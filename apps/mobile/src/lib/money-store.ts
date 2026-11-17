/** Accounts, categories and transactions on the phone: read from the local database, change it, sync, and redraw widgets. */
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import {
  ACCOUNTS_TABLE, CATEGORIES_TABLE, FIXED_EXPENSES_TABLE, MONEY_PLANS_TABLE, STARTER_ACCOUNTS, STARTER_CATEGORIES, STASHES_TABLE, TASKS_TABLE, TRANSACTIONS_TABLE, billTaskId, checkPassword, localDate, currentPlan, passwordProblem, resetMoneyRemote,
  type Account, type Category, type FixedExpense, type MoneyPlan, type Stash, type Transaction, type TransactionDraft,
} from '@dirary/shared';

import { processCaptures } from './capture';
import { readAccounts, readCategories, readFixedExpenses, readMoneyPlans, readStashes, readTasks, readTransactions, resetMoneyLocal, saveLocal } from './db';
import { supabase } from './supabase';
import { subscribeStore, syncTasks } from './tasks-store';
import { refreshWidgets } from '../widgets/refresh';

const now = () => new Date().toISOString();
const listeners = new Set<() => void>();

async function changed() {
  for (const listener of listeners) listener();
  refreshWidgets().catch(() => {});
  syncTasks(); // one sync covers every table
}

function newTransaction(draft: TransactionDraft, extra: Partial<Transaction> = {}): Transaction {
  const stamp = now();
  return { id: Crypto.randomUUID(), ...draft, source: 'manual', status: 'confirmed', fingerprint: null, transfer_group_id: null, fixed_expense_id: null, created_at: stamp, updated_at: stamp, deleted_at: null, ...extra };
}

export async function addTransaction(draft: TransactionDraft): Promise<void> {
  await saveLocal(TRANSACTIONS_TABLE, newTransaction(draft));
  await changed();
}

export async function updateTransaction(tx: Transaction, patch: Partial<Transaction>): Promise<void> {
  await saveLocal(TRANSACTIONS_TABLE, { ...tx, ...patch, updated_at: now() });
  await changed();
}

export async function removeTransaction(tx: Transaction): Promise<void> {
  await saveLocal(TRANSACTIONS_TABLE, { ...tx, deleted_at: now(), updated_at: now() });
  await changed();
}

/** Marks two existing transactions as the two halves of one move between your accounts. */
export async function linkTransfer(out: Transaction, into: Transaction): Promise<void> {
  const change = { transfer_group_id: Crypto.randomUUID(), status: 'confirmed' as const, category_id: null, updated_at: now() };
  await saveLocal(TRANSACTIONS_TABLE, { ...out, ...change });
  await saveLocal(TRANSACTIONS_TABLE, { ...into, ...change });
  await changed();
}

/** Records a move between two of your accounts as a linked pair, so it never counts as spending. */
export async function addTransfer(fromId: string, toId: string, amount_centavos: number): Promise<void> {
  const group = Crypto.randomUUID();
  const base = { category_id: null, amount_centavos, merchant: 'Transfer', note: null, occurred_at: now() };
  await saveLocal(TRANSACTIONS_TABLE, newTransaction({ ...base, account_id: fromId, direction: 'out' }, { transfer_group_id: group }));
  await saveLocal(TRANSACTIONS_TABLE, newTransaction({ ...base, account_id: toId, direction: 'in' }, { transfer_group_id: group }));
  await changed();
}

export async function saveAccount(account: Account | (Pick<Account, 'name' | 'institution' | 'opening_balance_centavos'> & { sort_order: number })): Promise<void> {
  const stamp = now();
  const row: Account = 'id' in account ? { ...account, updated_at: stamp } : { id: Crypto.randomUUID(), ...account, created_at: stamp, updated_at: stamp, deleted_at: null };
  await saveLocal(ACCOUNTS_TABLE, row);
  await changed();
}

export async function removeAccount(account: Account): Promise<void> {
  await saveLocal(ACCOUNTS_TABLE, { ...account, deleted_at: now(), updated_at: now() });
  await changed();
}

export async function saveCategory(category: Category | (Pick<Category, 'name' | 'kind' | 'color' | 'monthly_limit_centavos'> & { sort_order: number })): Promise<void> {
  const stamp = now();
  const row: Category = 'id' in category ? { ...category, updated_at: stamp } : { id: Crypto.randomUUID(), ...category, created_at: stamp, updated_at: stamp, deleted_at: null };
  await saveLocal(CATEGORIES_TABLE, row);
  await changed();
}

export async function removeCategory(category: Category): Promise<void> {
  await saveLocal(CATEGORIES_TABLE, { ...category, deleted_at: now(), updated_at: now() });
  await changed();
}

export async function saveFixed(expense: FixedExpense | (Pick<FixedExpense, 'name' | 'amount_centavos' | 'due_day' | 'category_id' | 'account_id'> & { sort_order: number })): Promise<void> {
  const stamp = now();
  const row: FixedExpense = 'id' in expense ? { ...expense, updated_at: stamp } : { id: Crypto.randomUUID(), ...expense, created_at: stamp, updated_at: stamp, deleted_at: null };
  await saveLocal(FIXED_EXPENSES_TABLE, row);
  await changed();
}

/** Deleting a bill also deletes this month's bill task, unless it was already ticked. */
export async function removeFixed(expense: FixedExpense): Promise<void> {
  const stamp = now();
  await saveLocal(FIXED_EXPENSES_TABLE, { ...expense, deleted_at: stamp, updated_at: stamp });
  const task = (await readTasks()).find((t) => t.id === billTaskId(expense.id, localDate().slice(0, 7)));
  if (task && task.status === 'todo') await saveLocal(TASKS_TABLE, { ...task, deleted_at: stamp, updated_at: stamp });
  await changed();
}

/** Ticking a fixed expense logs its payment, linked to it so it counts as paid this month. */
export async function payFixed(expense: FixedExpense, fallbackAccountId: string | null): Promise<void> {
  await saveLocal(TRANSACTIONS_TABLE, newTransaction(
    { account_id: expense.account_id ?? fallbackAccountId, category_id: expense.category_id, amount_centavos: expense.amount_centavos, direction: 'out', merchant: expense.name, note: null, occurred_at: now() },
    { fixed_expense_id: expense.id },
  ));
  await changed();
}

/** Sets the monthly budget (null clears it). There is one plan; it is created on first use. */
export async function setMonthlyBudget(monthly_budget_centavos: number | null): Promise<void> {
  const stamp = now();
  const existing = currentPlan(await readMoneyPlans());
  const row: MoneyPlan = existing ? { ...existing, monthly_budget_centavos, updated_at: stamp } : { id: Crypto.randomUUID(), monthly_budget_centavos, created_at: stamp, updated_at: stamp, deleted_at: null };
  await saveLocal(MONEY_PLANS_TABLE, row);
  await changed();
}

/**
 * Checks the password, then deletes every transaction and sets every account to ₱0, on the server first
 * (so rows this phone hasn't pulled yet go too) and then here. Returns a problem to show, or null when done.
 */
export async function resetMoney(password: string): Promise<string | null> {
  if (!supabase) return 'Not connected.';
  const check = await checkPassword(supabase, password);
  if (check !== 'ok') return passwordProblem(check);
  const stamp = now();
  const failure = await resetMoneyRemote(supabase, stamp);
  if (failure) return /fetch|network/i.test(failure) ? "Couldn't reach the server. Nothing was reset; try again." : failure;
  await resetMoneyLocal(stamp);
  await changed();
  return null;
}

/** Creates a stash, or changes one. The money never moves; a stash only marks part of an account as set aside. */
export async function saveStash(stash: Stash | (Pick<Stash, 'name' | 'account_id' | 'amount_centavos' | 'goal_centavos'> & { sort_order: number })): Promise<void> {
  const stamp = now();
  const row: Stash = 'id' in stash
    ? { ...stash, amount_centavos: Math.max(0, stash.amount_centavos), updated_at: stamp }
    : { id: Crypto.randomUUID(), ...stash, amount_centavos: Math.max(0, stash.amount_centavos), created_at: stamp, updated_at: stamp, deleted_at: null };
  await saveLocal(STASHES_TABLE, row);
  await changed();
}

export async function removeStash(stash: Stash): Promise<void> {
  await saveLocal(STASHES_TABLE, { ...stash, deleted_at: now(), updated_at: now() });
  await changed();
}

/** One tap on first use: your three accounts plus Cash, and a starter set of categories. */
export async function addStarterSet(): Promise<void> {
  const stamp = now();
  const base = { created_at: stamp, updated_at: stamp, deleted_at: null };
  if ((await readAccounts()).length === 0) {
    for (const [i, a] of STARTER_ACCOUNTS.entries()) await saveLocal(ACCOUNTS_TABLE, { id: Crypto.randomUUID(), ...a, opening_balance_centavos: 0, sort_order: i, ...base });
  }
  if ((await readCategories()).length === 0) {
    for (const [i, c] of STARTER_CATEGORIES.entries()) await saveLocal(CATEGORIES_TABLE, { id: Crypto.randomUUID(), ...c, monthly_limit_centavos: null, sort_order: i, ...base });
  }
  await changed();
}

/** Logs any notifications captured since last time. Returns how many transactions were added to the inbox. */
export async function logCaptured(): Promise<number> {
  const added = await processCaptures().catch(() => 0);
  if (added > 0) await changed();
  return added;
}

/** Live money data for a screen. Captured notifications are logged on open and whenever the app returns to the front. */
export function useMoneyStore() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [fixed, setFixed] = useState<FixedExpense[]>([]);
  const [plan, setPlan] = useState<MoneyPlan | null>(null);
  const [stashes, setStashes] = useState<Stash[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [a, c, t, f, p, s] = await Promise.all([readAccounts(), readCategories(), readTransactions(), readFixedExpenses(), readMoneyPlans(), readStashes()]);
    setStashes(s);
    setFixed(f);
    setPlan(currentPlan(p));
    setAccounts(a);
    setCategories(c);
    setTransactions(t);
    setLoading(false);
  }, []);

  useEffect(() => {
    listeners.add(load);
    // The shared sync announces through the tasks store when remote changes arrive.
    const unsubscribe = subscribeStore(load);
    load().then(() => logCaptured()).then(() => syncTasks());
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') logCaptured(); });
    const client = supabase;
    let channel = client?.channel('money_phone');
    if (channel) {
      for (const table of [ACCOUNTS_TABLE, CATEGORIES_TABLE, TRANSACTIONS_TABLE, FIXED_EXPENSES_TABLE, MONEY_PLANS_TABLE, STASHES_TABLE]) channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => { syncTasks(); });
      channel.subscribe();
    }
    return () => {
      listeners.delete(load);
      unsubscribe();
      appState.remove();
      if (client && channel) client.removeChannel(channel);
    };
  }, [load]);

  return { accounts, categories, transactions, fixed, plan, stashes, loading };
}

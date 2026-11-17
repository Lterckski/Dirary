import { useCallback, useEffect, useState } from 'react';
import {
  ACCOUNTS_TABLE, ACCOUNT_COLUMNS, CATEGORIES_TABLE, CATEGORY_COLUMNS, FIXED_EXPENSES_TABLE, FIXED_EXPENSE_COLUMNS, MONEY_PLANS_TABLE, MONEY_PLAN_COLUMNS,
  STARTER_ACCOUNTS, STARTER_CATEGORIES, TRANSACTIONS_TABLE, TRANSACTION_COLUMNS, checkPassword, currentPlan, passwordProblem, resetMoneyRemote,
  type Account, type Category, type FixedExpense, type MoneyPlan, type Transaction, type TransactionDraft,
} from '@dirary/shared';
import { supabase } from '../supabase';

const now = () => new Date().toISOString();
type Result = PromiseLike<{ error: { message: string } | null }>;

function newTransaction(draft: TransactionDraft, extra: Partial<Transaction> = {}): Transaction {
  const stamp = now();
  return {
    id: crypto.randomUUID(), ...draft, source: 'manual', status: 'confirmed', fingerprint: null, transfer_group_id: null, fixed_expense_id: null,
    created_at: stamp, updated_at: stamp, deleted_at: null, ...extra,
  };
}

/** Accounts, categories and transactions, kept live, with the changes the Money screen can make. */
export function useMoney() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [fixed, setFixed] = useState<FixedExpense[]>([]);
  const [plans, setPlans] = useState<MoneyPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [a, c, t, f, p] = await Promise.all([
      supabase.from(ACCOUNTS_TABLE).select(ACCOUNT_COLUMNS).is('deleted_at', null).order('sort_order').order('created_at'),
      supabase.from(CATEGORIES_TABLE).select(CATEGORY_COLUMNS).is('deleted_at', null).order('sort_order').order('created_at'),
      supabase.from(TRANSACTIONS_TABLE).select(TRANSACTION_COLUMNS).is('deleted_at', null).order('occurred_at', { ascending: false }).limit(5000),
      supabase.from(FIXED_EXPENSES_TABLE).select(FIXED_EXPENSE_COLUMNS).is('deleted_at', null).order('sort_order').order('created_at'),
      supabase.from(MONEY_PLANS_TABLE).select(MONEY_PLAN_COLUMNS).is('deleted_at', null),
    ]);
    const failure = a.error ?? c.error ?? t.error ?? f.error ?? p.error;
    if (failure) setError(friendly(failure.message));
    else {
      setAccounts(a.data as unknown as Account[]);
      setCategories(c.data as unknown as Category[]);
      setTransactions(t.data as unknown as Transaction[]);
      setFixed(f.data as unknown as FixedExpense[]);
      setPlans(p.data as unknown as MoneyPlan[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    if (!supabase) return;
    const client = supabase;
    let channel = client.channel('money_web');
    for (const table of [ACCOUNTS_TABLE, CATEGORIES_TABLE, TRANSACTIONS_TABLE, FIXED_EXPENSES_TABLE, MONEY_PLANS_TABLE]) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, load);
    }
    channel.subscribe();
    return () => { client.removeChannel(channel); };
  }, [load]);

  /** Shows the change right away, saves it, and reloads if saving failed. */
  const save = useCallback(async (apply: () => void, write: () => Result) => {
    apply();
    const { error } = await write();
    if (error) {
      setError(friendly(error.message));
      load();
    } else setError(null);
  }, [load]);

  const addTransaction = useCallback((draft: TransactionDraft) => {
    const row = newTransaction(draft);
    return save(() => setTransactions((all) => [row, ...all]), () => supabase!.from(TRANSACTIONS_TABLE).insert(row));
  }, [save]);

  const updateTransaction = useCallback((id: string, patch: Partial<Transaction>) => {
    const change = { ...patch, updated_at: now() };
    return save(() => setTransactions((all) => all.map((t) => (t.id === id ? { ...t, ...change } : t))), () => supabase!.from(TRANSACTIONS_TABLE).update(change).eq('id', id));
  }, [save]);

  const removeTransaction = useCallback((id: string) => {
    const change = { deleted_at: now(), updated_at: now() };
    return save(() => setTransactions((all) => all.filter((t) => t.id !== id)), () => supabase!.from(TRANSACTIONS_TABLE).update(change).eq('id', id));
  }, [save]);

  /** Marks two existing transactions as the two halves of one move between your accounts. */
  const linkTransfer = useCallback((outId: string, inId: string) => {
    const change = { transfer_group_id: crypto.randomUUID(), status: 'confirmed' as const, category_id: null, updated_at: now() };
    return save(
      () => setTransactions((all) => all.map((t) => (t.id === outId || t.id === inId ? { ...t, ...change } : t))),
      () => supabase!.from(TRANSACTIONS_TABLE).update(change).in('id', [outId, inId]),
    );
  }, [save]);

  /** Records a move between two of your accounts as a linked pair, so it never counts as spending. */
  const addTransfer = useCallback((fromId: string, toId: string, amount_centavos: number, occurred_at: string) => {
    const group = crypto.randomUUID();
    const base = { category_id: null, amount_centavos, merchant: 'Transfer', note: null, occurred_at };
    const rows = [
      newTransaction({ ...base, account_id: fromId, direction: 'out' }, { transfer_group_id: group }),
      newTransaction({ ...base, account_id: toId, direction: 'in' }, { transfer_group_id: group }),
    ];
    return save(() => setTransactions((all) => [...rows, ...all]), () => supabase!.from(TRANSACTIONS_TABLE).insert(rows));
  }, [save]);

  /** Adds imported statement rows, skipping any whose fingerprint is already logged. Returns how many were added. */
  const importTransactions = useCallback(async (rows: (TransactionDraft & { fingerprint: string })[]) => {
    const known = new Set(transactions.map((t) => t.fingerprint).filter(Boolean));
    const fresh = rows.filter((r) => !known.has(r.fingerprint)).map(({ fingerprint, ...draft }) => newTransaction(draft, { source: 'import', fingerprint }));
    if (fresh.length > 0) await save(() => setTransactions((all) => [...fresh, ...all]), () => supabase!.from(TRANSACTIONS_TABLE).insert(fresh));
    return fresh.length;
  }, [save, transactions]);

  const saveAccount = useCallback((account: { id?: string } & Pick<Account, 'name' | 'institution' | 'opening_balance_centavos'>) => {
    const stamp = now();
    const { id } = account;
    const fields = { name: account.name, institution: account.institution, opening_balance_centavos: account.opening_balance_centavos };
    if (id) {
      const change = { ...fields, updated_at: stamp };
      return save(() => setAccounts((all) => all.map((a) => (a.id === id ? { ...a, ...change } : a))), () => supabase!.from(ACCOUNTS_TABLE).update(change).eq('id', id));
    }
    const row: Account = { id: crypto.randomUUID(), ...fields, sort_order: accounts.length, created_at: stamp, updated_at: stamp, deleted_at: null };
    return save(() => setAccounts((all) => [...all, row]), () => supabase!.from(ACCOUNTS_TABLE).insert(row));
  }, [accounts.length, save]);

  const removeAccount = useCallback((id: string) => {
    const change = { deleted_at: now(), updated_at: now() };
    return save(() => setAccounts((all) => all.filter((a) => a.id !== id)), () => supabase!.from(ACCOUNTS_TABLE).update(change).eq('id', id));
  }, [save]);

  const saveCategory = useCallback((category: { id?: string } & Pick<Category, 'name' | 'kind' | 'color' | 'monthly_limit_centavos'>) => {
    const stamp = now();
    const { id } = category;
    const fields = { name: category.name, kind: category.kind, color: category.color, monthly_limit_centavos: category.monthly_limit_centavos };
    if (id) {
      const change = { ...fields, updated_at: stamp };
      return save(() => setCategories((all) => all.map((c) => (c.id === id ? { ...c, ...change } : c))), () => supabase!.from(CATEGORIES_TABLE).update(change).eq('id', id));
    }
    const row: Category = { id: crypto.randomUUID(), ...fields, sort_order: categories.length, created_at: stamp, updated_at: stamp, deleted_at: null };
    return save(() => setCategories((all) => [...all, row]), () => supabase!.from(CATEGORIES_TABLE).insert(row));
  }, [categories.length, save]);

  const removeCategory = useCallback((id: string) => {
    const change = { deleted_at: now(), updated_at: now() };
    return save(() => setCategories((all) => all.filter((c) => c.id !== id)), () => supabase!.from(CATEGORIES_TABLE).update(change).eq('id', id));
  }, [save]);

  /** One tap on first use: your three accounts plus Cash, and a starter set of categories. */
  const addStarterSet = useCallback(() => {
    const stamp = now();
    const base = { created_at: stamp, updated_at: stamp, deleted_at: null };
    const newAccounts: Account[] = accounts.length ? [] : STARTER_ACCOUNTS.map((a, i) => ({ id: crypto.randomUUID(), ...a, opening_balance_centavos: 0, sort_order: i, ...base }));
    const newCategories: Category[] = categories.length ? [] : STARTER_CATEGORIES.map((c, i) => ({ id: crypto.randomUUID(), ...c, monthly_limit_centavos: null, sort_order: i, ...base }));
    return save(
      () => { setAccounts((all) => [...all, ...newAccounts]); setCategories((all) => [...all, ...newCategories]); },
      async () => {
        const first = newAccounts.length ? await supabase!.from(ACCOUNTS_TABLE).insert(newAccounts) : { error: null };
        if (first.error || !newCategories.length) return first;
        return supabase!.from(CATEGORIES_TABLE).insert(newCategories);
      },
    );
  }, [accounts.length, categories.length, save]);

  const saveFixed = useCallback((expense: { id?: string } & Pick<FixedExpense, 'name' | 'amount_centavos' | 'due_day' | 'category_id' | 'account_id'>) => {
    const stamp = now();
    const { id } = expense;
    const fields = { name: expense.name, amount_centavos: expense.amount_centavos, due_day: expense.due_day, category_id: expense.category_id, account_id: expense.account_id };
    if (id) {
      const change = { ...fields, updated_at: stamp };
      return save(() => setFixed((all) => all.map((e) => (e.id === id ? { ...e, ...change } : e))), () => supabase!.from(FIXED_EXPENSES_TABLE).update(change).eq('id', id));
    }
    const row: FixedExpense = { id: crypto.randomUUID(), ...fields, sort_order: fixed.length, created_at: stamp, updated_at: stamp, deleted_at: null };
    return save(() => setFixed((all) => [...all, row]), () => supabase!.from(FIXED_EXPENSES_TABLE).insert(row));
  }, [fixed.length, save]);

  const removeFixed = useCallback((id: string) => {
    const change = { deleted_at: now(), updated_at: now() };
    return save(() => setFixed((all) => all.filter((e) => e.id !== id)), () => supabase!.from(FIXED_EXPENSES_TABLE).update(change).eq('id', id));
  }, [save]);

  /** Ticking a fixed expense logs its payment, linked to it so it counts as paid this month. */
  const payFixed = useCallback((expense: FixedExpense, fallbackAccountId: string | null) => {
    const row = newTransaction(
      { account_id: expense.account_id ?? fallbackAccountId, category_id: expense.category_id, amount_centavos: expense.amount_centavos, direction: 'out', merchant: expense.name, note: null, occurred_at: now() },
      { fixed_expense_id: expense.id },
    );
    return save(() => setTransactions((all) => [row, ...all]), () => supabase!.from(TRANSACTIONS_TABLE).insert(row));
  }, [save]);

  /** Sets the monthly budget (null clears it). There is one plan; it is created on first use. */
  const setMonthlyBudget = useCallback((monthly_budget_centavos: number | null) => {
    const stamp = now();
    const existing = currentPlan(plans);
    if (existing) {
      const change = { monthly_budget_centavos, updated_at: stamp };
      return save(() => setPlans((all) => all.map((p) => (p.id === existing.id ? { ...p, ...change } : p))), () => supabase!.from(MONEY_PLANS_TABLE).update(change).eq('id', existing.id));
    }
    const row: MoneyPlan = { id: crypto.randomUUID(), monthly_budget_centavos, created_at: stamp, updated_at: stamp, deleted_at: null };
    return save(() => setPlans((all) => [...all, row]), () => supabase!.from(MONEY_PLANS_TABLE).insert(row));
  }, [plans, save]);

  /** Checks the password, then deletes every transaction and sets every account to ₱0. Returns a problem to show, or null when done. */
  const resetMoney = useCallback(async (password: string): Promise<string | null> => {
    if (!supabase) return 'Not connected.';
    const check = await checkPassword(supabase, password);
    if (check !== 'ok') return passwordProblem(check);
    const stamp = now();
    const failure = await resetMoneyRemote(supabase, stamp);
    if (failure) { load(); return friendly(failure); }
    setTransactions([]);
    setAccounts((all) => all.map((a) => ({ ...a, opening_balance_centavos: 0, updated_at: stamp })));
    return null;
  }, [load]);

  return {
    resetMoney,
    fixed, plan: currentPlan(plans), saveFixed, removeFixed, payFixed, setMonthlyBudget,
    accounts, categories, transactions, loading, error,
    addTransaction, updateTransaction, removeTransaction, linkTransfer, addTransfer, importTransactions,
    saveAccount, removeAccount, saveCategory, removeCategory, addStarterSet,
  };
}

export type MoneyStore = ReturnType<typeof useMoney>;

function friendly(message: string): string {
  if (/relation .* does not exist|schema cache|fixed_expense_id/i.test(message)) return "Some money tables aren't in Supabase yet. Run both Phase 2 SQL files (money, then plan), then reload.";
  if (/failed to fetch|network/i.test(message)) return "Couldn't reach the server. Check your connection and try again.";
  return message;
}

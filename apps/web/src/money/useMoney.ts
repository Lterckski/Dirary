import { useCallback, useEffect, useState } from 'react';
import {
  ACCOUNTS_TABLE, ACCOUNT_COLUMNS, CATEGORIES_TABLE, CATEGORY_COLUMNS, STARTER_ACCOUNTS, STARTER_CATEGORIES, TRANSACTIONS_TABLE, TRANSACTION_COLUMNS,
  type Account, type Category, type Transaction, type TransactionDraft,
} from '@dirary/shared';
import { supabase } from '../supabase';

const now = () => new Date().toISOString();
type Result = PromiseLike<{ error: { message: string } | null }>;

function newTransaction(draft: TransactionDraft, extra: Partial<Transaction> = {}): Transaction {
  const stamp = now();
  return {
    id: crypto.randomUUID(), ...draft, source: 'manual', status: 'confirmed', fingerprint: null, transfer_group_id: null,
    created_at: stamp, updated_at: stamp, deleted_at: null, ...extra,
  };
}

/** Accounts, categories and transactions, kept live, with the changes the Money screen can make. */
export function useMoney() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [a, c, t] = await Promise.all([
      supabase.from(ACCOUNTS_TABLE).select(ACCOUNT_COLUMNS).is('deleted_at', null).order('sort_order').order('created_at'),
      supabase.from(CATEGORIES_TABLE).select(CATEGORY_COLUMNS).is('deleted_at', null).order('sort_order').order('created_at'),
      supabase.from(TRANSACTIONS_TABLE).select(TRANSACTION_COLUMNS).is('deleted_at', null).order('occurred_at', { ascending: false }).limit(5000),
    ]);
    const failure = a.error ?? c.error ?? t.error;
    if (failure) setError(friendly(failure.message));
    else {
      setAccounts(a.data as unknown as Account[]);
      setCategories(c.data as unknown as Category[]);
      setTransactions(t.data as unknown as Transaction[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    if (!supabase) return;
    const client = supabase;
    let channel = client.channel('money_web');
    for (const table of [ACCOUNTS_TABLE, CATEGORIES_TABLE, TRANSACTIONS_TABLE]) {
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

  return {
    accounts, categories, transactions, loading, error,
    addTransaction, updateTransaction, removeTransaction, linkTransfer, addTransfer, importTransactions,
    saveAccount, removeAccount, saveCategory, removeCategory, addStarterSet,
  };
}

export type MoneyStore = ReturnType<typeof useMoney>;

function friendly(message: string): string {
  if (/relation .* does not exist|schema cache/i.test(message)) return "The money tables aren't in Supabase yet. Run the Phase 2 SQL file, then reload.";
  if (/failed to fetch|network/i.test(message)) return "Couldn't reach the server. Check your connection and try again.";
  return message;
}

/**
 * The phone's local database and its sync with Supabase.
 *
 * Every change is written here first, so the app works with no signal. Changed rows are
 * marked dirty and pushed when online; remote changes are pulled since the last cursor.
 * Conflicts resolve by last-write-wins on updated_at.
 */
import * as SQLite from 'expo-sqlite';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ACCOUNTS_TABLE, ACCOUNT_COLUMNS, CATEGORIES_TABLE, CATEGORY_COLUMNS, FIXED_EXPENSES_TABLE, FIXED_EXPENSE_COLUMNS, LISTS_TABLE, LIST_COLUMNS, MONEY_PLANS_TABLE, MONEY_PLAN_COLUMNS,
  STASHES_TABLE, STASH_COLUMNS, TASKS_TABLE, TASK_COLUMNS, TRANSACTIONS_TABLE, TRANSACTION_COLUMNS, remoteWins,
  type Account, type Category, type FixedExpense, type List, type MoneyPlan, type Stash, type Task, type Transaction,
} from '@dirary/shared';

type Row = Record<string, string | number | null>;
/** `optional` tables may not exist on the server yet (their SQL file not run); sync skips them instead of failing. */
interface TableDef { name: string; select: string; columns: string[]; optional?: boolean }

const cols = (select: string) => select.split(',').map((c) => c.trim());
// Order matters: a task may point at a list, and a transaction at an account, a category and a fixed expense.
const TABLES: TableDef[] = [
  { name: LISTS_TABLE, select: LIST_COLUMNS, columns: cols(LIST_COLUMNS) },
  { name: TASKS_TABLE, select: TASK_COLUMNS, columns: cols(TASK_COLUMNS) },
  { name: ACCOUNTS_TABLE, select: ACCOUNT_COLUMNS, columns: cols(ACCOUNT_COLUMNS) },
  { name: CATEGORIES_TABLE, select: CATEGORY_COLUMNS, columns: cols(CATEGORY_COLUMNS) },
  { name: FIXED_EXPENSES_TABLE, select: FIXED_EXPENSE_COLUMNS, columns: cols(FIXED_EXPENSE_COLUMNS) },
  { name: MONEY_PLANS_TABLE, select: MONEY_PLAN_COLUMNS, columns: cols(MONEY_PLAN_COLUMNS) },
  { name: TRANSACTIONS_TABLE, select: TRANSACTION_COLUMNS, columns: cols(TRANSACTION_COLUMNS) },
  { name: STASHES_TABLE, select: STASH_COLUMNS, columns: cols(STASH_COLUMNS), optional: true },
];
const missingTable = (message: string) => /relation .* does not exist|schema cache/i.test(message);
export type SyncedTable = typeof LISTS_TABLE | typeof TASKS_TABLE | typeof ACCOUNTS_TABLE | typeof CATEGORIES_TABLE | typeof FIXED_EXPENSES_TABLE | typeof MONEY_PLANS_TABLE | typeof TRANSACTIONS_TABLE | typeof STASHES_TABLE;
/** Re-read a little before the cursor, so a change stamped by a device with a slow clock isn't missed. */
const OVERLAP_MS = 10 * 60 * 1000;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
export function db(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= (async () => {
    const database = await SQLite.openDatabaseAsync('dirary.db');
    await database.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS lists (
        id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY NOT NULL, list_id TEXT, title TEXT NOT NULL, notes TEXT, due_date TEXT, due_time TEXT, remind_at TEXT,
        priority INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'todo', recurrence_rule TEXT, completed_at TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS tasks_due_idx ON tasks (due_date);
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, institution TEXT NOT NULL, opening_balance_centavos INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL, color TEXT NOT NULL, monthly_limit_centavos INTEGER,
        sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS transactions (
        id TEXT PRIMARY KEY NOT NULL, account_id TEXT, category_id TEXT, amount_centavos INTEGER NOT NULL, direction TEXT NOT NULL,
        merchant TEXT, note TEXT, occurred_at TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL, fingerprint TEXT, transfer_group_id TEXT, fixed_expense_id TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS transactions_occurred_idx ON transactions (occurred_at);
      CREATE INDEX IF NOT EXISTS transactions_fingerprint_idx ON transactions (fingerprint);
      CREATE TABLE IF NOT EXISTS fixed_expenses (
        id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, amount_centavos INTEGER NOT NULL, due_day INTEGER NOT NULL DEFAULT 1, category_id TEXT, account_id TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS stashes (
        id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, account_id TEXT NOT NULL, amount_centavos INTEGER NOT NULL DEFAULT 0, goal_centavos INTEGER,
        sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS money_plans (
        id TEXT PRIMARY KEY NOT NULL, monthly_budget_centavos INTEGER,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, dirty INTEGER NOT NULL DEFAULT 0
      );
    `);
    // A phone that installed an earlier build has a transactions table without this column.
    const txColumns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(transactions)');
    if (!txColumns.some((c) => c.name === 'fixed_expense_id')) await database.execAsync('ALTER TABLE transactions ADD COLUMN fixed_expense_id TEXT');
    return database;
  })();
  return dbPromise;
}

async function upsert(database: SQLite.SQLiteDatabase, table: TableDef, row: Row, dirty: 0 | 1) {
  const names = [...table.columns, 'dirty'];
  const updates = names.filter((n) => n !== 'id').map((n) => `${n} = excluded.${n}`).join(', ');
  await database.runAsync(
    `INSERT INTO ${table.name} (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')}) ON CONFLICT(id) DO UPDATE SET ${updates}`,
    [...table.columns.map((c) => row[c] ?? null), dirty],
  );
}

const tableOf = (name: string) => TABLES.find((t) => t.name === name)!;

/** Saves a row on the phone and marks it for syncing. */
export async function saveLocal(table: SyncedTable, row: List | Task | Account | Category | Transaction | FixedExpense | MoneyPlan | Stash): Promise<void> {
  await upsert(await db(), tableOf(table), row as unknown as Row, 1);
}

export async function readTasks(): Promise<Task[]> {
  return (await db()).getAllAsync<Task>(`SELECT ${TASK_COLUMNS} FROM tasks WHERE deleted_at IS NULL ORDER BY created_at`);
}

export async function readLists(): Promise<List[]> {
  return (await db()).getAllAsync<List>(`SELECT ${LIST_COLUMNS} FROM lists WHERE deleted_at IS NULL ORDER BY sort_order, created_at`);
}

export async function readAccounts(): Promise<Account[]> {
  return (await db()).getAllAsync<Account>(`SELECT ${ACCOUNT_COLUMNS} FROM accounts WHERE deleted_at IS NULL ORDER BY sort_order, created_at`);
}

export async function readCategories(): Promise<Category[]> {
  return (await db()).getAllAsync<Category>(`SELECT ${CATEGORY_COLUMNS} FROM categories WHERE deleted_at IS NULL ORDER BY sort_order, created_at`);
}

export async function readTransactions(): Promise<Transaction[]> {
  return (await db()).getAllAsync<Transaction>(`SELECT ${TRANSACTION_COLUMNS} FROM transactions WHERE deleted_at IS NULL ORDER BY occurred_at DESC LIMIT 5000`);
}

export async function readFixedExpenses(): Promise<FixedExpense[]> {
  return (await db()).getAllAsync<FixedExpense>(`SELECT ${FIXED_EXPENSE_COLUMNS} FROM fixed_expenses WHERE deleted_at IS NULL ORDER BY sort_order, created_at`);
}

export async function readStashes(): Promise<Stash[]> {
  return (await db()).getAllAsync<Stash>(`SELECT ${STASH_COLUMNS} FROM stashes WHERE deleted_at IS NULL ORDER BY sort_order, created_at`);
}

export async function readMoneyPlans(): Promise<MoneyPlan[]> {
  return (await db()).getAllAsync<MoneyPlan>(`SELECT ${MONEY_PLAN_COLUMNS} FROM money_plans WHERE deleted_at IS NULL`);
}

/** True if a transaction with this fingerprint was ever logged here, including ones you deleted, so a deleted one doesn't come back. */
export async function hasFingerprint(fingerprint: string): Promise<boolean> {
  return (await (await db()).getFirstAsync('SELECT 1 FROM transactions WHERE fingerprint = ? LIMIT 1', [fingerprint])) !== null;
}

export async function getMeta(key: string): Promise<string | null> {
  return (await (await db()).getFirstAsync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', [key]))?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await (await db()).runAsync('INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
}

export async function pendingCount(): Promise<number> {
  const database = await db();
  const row = await database.getFirstAsync<{ n: number }>(`SELECT ${TABLES.map((t) => `(SELECT COUNT(*) FROM ${t.name} WHERE dirty = 1)`).join(' + ')} AS n`);
  return row?.n ?? 0;
}

/** Marks every transaction deleted and every account at ₱0, ready to sync. */
export async function resetMoneyLocal(stamp: string): Promise<void> {
  const database = await db();
  await database.withTransactionAsync(async () => {
    await database.runAsync('UPDATE transactions SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE deleted_at IS NULL', [stamp, stamp]);
    await database.runAsync('UPDATE accounts SET opening_balance_centavos = 0, updated_at = ?, dirty = 1 WHERE deleted_at IS NULL', [stamp]);
    await database.runAsync('UPDATE stashes SET amount_centavos = 0, updated_at = ?, dirty = 1 WHERE deleted_at IS NULL', [stamp]);
  });
}

/** Clears everything stored on this phone. Used when signing out. */
export async function clearLocal(): Promise<void> {
  await (await db()).execAsync(`${TABLES.map((t) => `DELETE FROM ${t.name};`).join(' ')} DELETE FROM sync_meta;`);
}

let running: Promise<{ pushed: number; pulled: number }> | null = null;

/** Pushes local changes, then pulls remote ones. Safe to call often; calls made while one is running share its result. */
export function syncAll(client: SupabaseClient): Promise<{ pushed: number; pulled: number }> {
  running ??= runSync(client).finally(() => { running = null; });
  return running;
}

async function runSync(client: SupabaseClient) {
  const database = await db();
  let pushed = 0;
  let pulled = 0;

  for (const table of TABLES) {
    // 1. Push
    const dirty = await database.getAllAsync<Row>(`SELECT * FROM ${table.name} WHERE dirty = 1`);
    if (dirty.length > 0) {
      const payload = dirty.map((row) => Object.fromEntries(table.columns.map((c) => [c, row[c] ?? null])));
      const { error } = await client.from(table.name).upsert(payload);
      if (error && table.optional && missingTable(error.message)) continue; // keep them dirty until the table exists
      if (error) throw new Error(error.message);
      for (const row of dirty) {
        // Only clear the flag if the row wasn't edited again while the push was in flight.
        await database.runAsync(`UPDATE ${table.name} SET dirty = 0 WHERE id = ? AND updated_at = ?`, [row.id ?? null, row.updated_at ?? null]);
      }
      pushed += dirty.length;
    }

    // 2. Pull what changed since the last cursor
    const key = `cursor_${table.name}`;
    const saved = await database.getFirstAsync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', [key]);
    const cursor = saved?.value ?? '1970-01-01T00:00:00.000Z';
    const since = new Date(Math.max(0, Date.parse(cursor) - OVERLAP_MS)).toISOString();
    const { data, error } = await client.from(table.name).select(table.select).gt('updated_at', since).order('updated_at', { ascending: true }).limit(5000);
    if (error && table.optional && missingTable(error.message)) continue;
    if (error) throw new Error(error.message);

    let newest = cursor;
    for (const remote of (data ?? []) as unknown as Row[]) {
      const local = await database.getFirstAsync<{ id: string; updated_at: string; dirty: number }>(`SELECT id, updated_at, dirty FROM ${table.name} WHERE id = ?`, [remote.id ?? null]);
      if (remoteWins(local, remote as unknown as { id: string; updated_at: string })) {
        await upsert(database, table, remote, 0);
        pulled += 1;
      }
      const stamp = String(remote.updated_at);
      if (Date.parse(stamp) > Date.parse(newest)) newest = stamp;
    }
    await database.runAsync('INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, newest]);
  }
  return { pushed, pulled };
}

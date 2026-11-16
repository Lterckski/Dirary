/**
 * The phone's local database and its sync with Supabase.
 *
 * Every change is written here first, so the app works with no signal. Changed rows are
 * marked dirty and pushed when online; remote changes are pulled since the last cursor.
 * Conflicts resolve by last-write-wins on updated_at.
 */
import * as SQLite from 'expo-sqlite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { LISTS_TABLE, LIST_COLUMNS, TASKS_TABLE, TASK_COLUMNS, remoteWins, type List, type Task } from '@dirary/shared';

type Row = Record<string, string | number | null>;
interface TableDef { name: string; select: string; columns: string[] }

const cols = (select: string) => select.split(',').map((c) => c.trim());
// Lists sync before tasks, because a task may point at a list.
const TABLES: TableDef[] = [
  { name: LISTS_TABLE, select: LIST_COLUMNS, columns: cols(LIST_COLUMNS) },
  { name: TASKS_TABLE, select: TASK_COLUMNS, columns: cols(TASK_COLUMNS) },
];
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
    `);
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
export async function saveLocal(table: typeof LISTS_TABLE | typeof TASKS_TABLE, row: List | Task): Promise<void> {
  await upsert(await db(), tableOf(table), row as unknown as Row, 1);
}

export async function readTasks(): Promise<Task[]> {
  return (await db()).getAllAsync<Task>(`SELECT ${TASK_COLUMNS} FROM tasks WHERE deleted_at IS NULL ORDER BY created_at`);
}

export async function readLists(): Promise<List[]> {
  return (await db()).getAllAsync<List>(`SELECT ${LIST_COLUMNS} FROM lists WHERE deleted_at IS NULL ORDER BY sort_order, created_at`);
}

export async function pendingCount(): Promise<number> {
  const database = await db();
  const row = await database.getFirstAsync<{ n: number }>('SELECT (SELECT COUNT(*) FROM tasks WHERE dirty = 1) + (SELECT COUNT(*) FROM lists WHERE dirty = 1) AS n');
  return row?.n ?? 0;
}

/** Clears everything stored on this phone. Used when signing out. */
export async function clearLocal(): Promise<void> {
  await (await db()).execAsync('DELETE FROM tasks; DELETE FROM lists; DELETE FROM sync_meta;');
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

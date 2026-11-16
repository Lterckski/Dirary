/**
 * Offline-first sync, Phase 0 edition.
 *
 * The phone writes to a local SQLite database first, so the app works with no signal.
 * Changed rows are marked dirty and pushed to Supabase when online; remote changes are
 * pulled since the last cursor. Conflicts resolve by last-write-wins on updated_at.
 * Every later module (tasks, money, health) reuses this pattern.
 */
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SYNC_PROBE_COLUMNS, SYNC_PROBE_TABLE, remoteWins, type SyncProbe } from '@dirary/shared';

type LocalRow = SyncProbe & { dirty: number };
const CURSOR_KEY = 'sync_probe_cursor';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
function db() {
  dbPromise ??= (async () => {
    const database = await SQLite.openDatabaseAsync('dirary.db');
    await database.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS sync_probe (
        id TEXT PRIMARY KEY NOT NULL,
        note TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        dirty INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    `);
    return database;
  })();
  return dbPromise;
}

export async function listNotes(): Promise<SyncProbe[]> {
  const database = await db();
  return database.getAllAsync<SyncProbe>(
    'SELECT id, note, updated_at, deleted_at FROM sync_probe WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT 20',
  );
}

export async function pendingCount(): Promise<number> {
  const database = await db();
  const row = await database.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM sync_probe WHERE dirty = 1');
  return row?.n ?? 0;
}

/** Saves locally right away. Call syncNow() afterwards to push it. */
export async function addNote(note: string): Promise<void> {
  const database = await db();
  await database.runAsync(
    'INSERT INTO sync_probe (id, note, updated_at, deleted_at, dirty) VALUES (?, ?, ?, NULL, 1)',
    Crypto.randomUUID(), note, new Date().toISOString(),
  );
}

/** Pushes local changes, then pulls remote ones. Safe to call often; throws when offline. */
export async function syncNow(client: SupabaseClient): Promise<{ pushed: number; pulled: number }> {
  const database = await db();

  // 1. Push
  const dirty = await database.getAllAsync<LocalRow>('SELECT * FROM sync_probe WHERE dirty = 1');
  if (dirty.length > 0) {
    const payload = dirty.map(({ id, note, updated_at, deleted_at }) => ({ id, note, updated_at, deleted_at }));
    const { error } = await client.from(SYNC_PROBE_TABLE).upsert(payload);
    if (error) throw new Error(error.message);
    for (const row of dirty) {
      // Only clear the flag if the row wasn't edited again while the push was in flight.
      await database.runAsync('UPDATE sync_probe SET dirty = 0 WHERE id = ? AND updated_at = ?', row.id, row.updated_at);
    }
  }

  // 2. Pull everything changed since the last cursor
  const cursorRow = await database.getFirstAsync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', CURSOR_KEY);
  const cursor = cursorRow?.value ?? '1970-01-01T00:00:00Z';
  const { data, error } = await client.from(SYNC_PROBE_TABLE).select(SYNC_PROBE_COLUMNS).gt('updated_at', cursor).order('updated_at', { ascending: true });
  if (error) throw new Error(error.message);

  const remote = (data ?? []) as SyncProbe[];
  let pulled = 0;
  let newest = cursor;
  for (const row of remote) {
    const local = await database.getFirstAsync<LocalRow>('SELECT * FROM sync_probe WHERE id = ?', row.id);
    if (remoteWins(local, row)) {
      await database.runAsync(
        `INSERT INTO sync_probe (id, note, updated_at, deleted_at, dirty) VALUES (?, ?, ?, ?, 0)
         ON CONFLICT(id) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, dirty = 0`,
        row.id, row.note, row.updated_at, row.deleted_at,
      );
      pulled += 1;
    }
    if (Date.parse(row.updated_at) > Date.parse(newest)) newest = row.updated_at;
  }
  await database.runAsync(
    'INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    CURSOR_KEY, newest,
  );

  return { pushed: dirty.length, pulled };
}

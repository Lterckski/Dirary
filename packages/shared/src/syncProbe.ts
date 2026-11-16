import { z } from 'zod';

/** Phase 0 test table: proves login, row-level security and two-way sync before real modules exist. */
export const SyncProbe = z.object({
  id: z.uuid(),
  note: z.string().min(1).max(200),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});
export type SyncProbe = z.infer<typeof SyncProbe>;

export const SYNC_PROBE_TABLE = 'sync_probe';
export const SYNC_PROBE_COLUMNS = 'id, note, updated_at, deleted_at';

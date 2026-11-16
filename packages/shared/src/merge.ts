export interface Versioned {
  id: string;
  updated_at: string;
}

/**
 * Last-write-wins merge, the sync rule for every Dirary module.
 * For each id, the row with the newest updated_at wins; ties keep the local row.
 */
export function mergeLastWriteWins<T extends Versioned>(local: readonly T[], remote: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const row of local) byId.set(row.id, row);
  for (const row of remote) {
    const mine = byId.get(row.id);
    if (!mine || Date.parse(row.updated_at) > Date.parse(mine.updated_at)) byId.set(row.id, row);
  }
  return [...byId.values()];
}

/** True when the remote row should replace the local one. */
export function remoteWins(local: Versioned | null | undefined, remote: Versioned): boolean {
  return !local || Date.parse(remote.updated_at) > Date.parse(local.updated_at);
}

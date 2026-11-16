import { describe, expect, it } from 'vitest';
import { mergeLastWriteWins, remoteWins } from './merge';

const row = (id: string, updated_at: string, note = '') => ({ id, updated_at, note });

describe('mergeLastWriteWins', () => {
  it('keeps the newer row for the same id', () => {
    const merged = mergeLastWriteWins([row('a', '2026-11-16T10:00:00Z', 'phone')], [row('a', '2026-11-16T11:00:00Z', 'web')]);
    expect(merged).toEqual([row('a', '2026-11-16T11:00:00Z', 'web')]);
  });
  it('keeps the local row when it is newer or tied', () => {
    expect(mergeLastWriteWins([row('a', '2026-11-16T12:00:00Z', 'phone')], [row('a', '2026-11-16T11:00:00Z', 'web')])[0]?.note).toBe('phone');
    expect(mergeLastWriteWins([row('a', '2026-11-16T12:00:00Z', 'phone')], [row('a', '2026-11-16T12:00:00Z', 'web')])[0]?.note).toBe('phone');
  });
  it('unions rows that exist on one side only', () => {
    expect(mergeLastWriteWins([row('a', '2026-11-16T10:00:00Z')], [row('b', '2026-11-16T10:00:00Z')]).map((r) => r.id).sort()).toEqual(['a', 'b']);
  });
});

describe('remoteWins', () => {
  it('is true with no local row, false when local is newer', () => {
    expect(remoteWins(null, row('a', '2026-11-16T10:00:00Z'))).toBe(true);
    expect(remoteWins(row('a', '2026-11-16T11:00:00Z'), row('a', '2026-11-16T10:00:00Z'))).toBe(false);
  });
});

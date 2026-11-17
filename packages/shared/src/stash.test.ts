import { describe, expect, it } from 'vitest';
import type { Account, Transaction } from './money';
import { moveStash, stashProgress, stashSummary, type Stash } from './stash';

const stamps = { created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', deleted_at: null };
const acct = (id: string, opening: number, p: Partial<Account> = {}): Account => ({ id, name: id, institution: 'other', opening_balance_centavos: opening, sort_order: 0, ...stamps, ...p });
const stash = (id: string, account_id: string, amount: number, p: Partial<Stash> = {}): Stash => ({ id, name: id, account_id, amount_centavos: amount, goal_centavos: null, sort_order: 0, ...stamps, ...p });
const spend: Transaction = {
  id: 't', account_id: 'gotyme', category_id: null, amount_centavos: 100000, direction: 'out', merchant: null, note: null, occurred_at: '2026-11-02T00:00:00Z',
  source: 'manual', status: 'confirmed', fingerprint: null, transfer_group_id: null, fixed_expense_id: null, ...stamps,
};

describe('stashes', () => {
  it('takes stashed money out of what is spendable, account by account', () => {
    const s = stashSummary(
      [stash('emergency', 'gotyme', 500000), stash('tuition', 'sb', 300000), stash('gone', 'sb', 999, { deleted_at: 'x' }), stash('orphan', 'closed', 999)],
      [acct('gotyme', 1000000), acct('sb', 400000), acct('closed', 50000, { deleted_at: 'x' })],
      [spend],
    );
    expect(s.total).toBe(1300000);
    expect(s.stashed).toBe(800000);
    expect(s.spendable).toBe(500000);
    expect(s.byAccount.get('gotyme')).toEqual({ balance: 900000, stashed: 500000, free: 400000 });
    expect(s.stashes.map((x) => x.id)).toEqual(['emergency', 'tuition']);
    expect(s.overdrawn).toEqual([]);
  });
  it('flags an account whose stashes add up to more than it holds', () => {
    const s = stashSummary([stash('a', 'gcash', 80000)], [acct('gcash', 50000)], []);
    expect(s.byAccount.get('gcash')?.free).toBe(-30000);
    expect(s.overdrawn.map((a) => a.id)).toEqual(['gcash']);
  });
  it('tracks progress toward a goal and never goes below zero', () => {
    expect(stashProgress(stash('x', 'a', 25000, { goal_centavos: 100000 }))).toBe(25);
    expect(stashProgress(stash('x', 'a', 250000, { goal_centavos: 100000 }))).toBe(100);
    expect(stashProgress(stash('x', 'a', 25000))).toBeNull();
    expect(moveStash(stash('x', 'a', 25000), 10000)).toBe(35000);
    expect(moveStash(stash('x', 'a', 25000), -90000)).toBe(0);
  });
});

/** Stashes: money set aside inside an account, so it stops counting as spendable. The money itself never moves. */
import { z } from 'zod';
import { accountBalance, type Account, type Transaction } from './money';

export const Stash = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(40),
  account_id: z.uuid(),
  /** Set aside right now. Never negative. */
  amount_centavos: z.number().int().min(0),
  /** Optional target. */
  goal_centavos: z.number().int().positive().nullable(),
  sort_order: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});
export type Stash = z.infer<typeof Stash>;

export const STASHES_TABLE = 'stashes';
export const STASH_COLUMNS = 'id, name, account_id, amount_centavos, goal_centavos, sort_order, created_at, updated_at, deleted_at';

export interface AccountStash {
  balance: number;
  stashed: number;
  /** balance − stashed. Negative when more is set aside than the account holds. */
  free: number;
}

export interface StashSummary {
  /** Every live account's balance added up. */
  total: number;
  /** Set aside across all stashes in live accounts. */
  stashed: number;
  /** total − stashed. */
  spendable: number;
  byAccount: Map<string, AccountStash>;
  /** Live stashes in live accounts, in their saved order. */
  stashes: Stash[];
  /** Accounts where the stashes add up to more than the account holds. */
  overdrawn: Account[];
}

export function stashSummary(stashes: readonly Stash[], accounts: readonly Account[], transactions: readonly Transaction[]): StashSummary {
  const live = accounts.filter((a) => a.deleted_at === null);
  const byAccount = new Map<string, AccountStash>();
  for (const a of live) {
    const balance = accountBalance(a, transactions);
    byAccount.set(a.id, { balance, stashed: 0, free: balance });
  }
  const kept = stashes.filter((s) => s.deleted_at === null && byAccount.has(s.account_id)).sort((a, b) => a.sort_order - b.sort_order || (a.created_at < b.created_at ? -1 : 1));
  for (const s of kept) {
    const row = byAccount.get(s.account_id)!;
    row.stashed += s.amount_centavos;
    row.free = row.balance - row.stashed;
  }
  const total = [...byAccount.values()].reduce((sum, r) => sum + r.balance, 0);
  const stashed = kept.reduce((sum, s) => sum + s.amount_centavos, 0);
  return { total, stashed, spendable: total - stashed, byAccount, stashes: kept, overdrawn: live.filter((a) => (byAccount.get(a.id)?.free ?? 0) < 0 && (byAccount.get(a.id)?.stashed ?? 0) > 0) };
}

/** 0–100 toward the goal, or null without one. */
export function stashProgress(stash: Stash): number | null {
  if (!stash.goal_centavos) return null;
  return Math.min(100, Math.round((stash.amount_centavos / stash.goal_centavos) * 100));
}

/** The new amount after putting money in (positive) or taking it out (negative). Never below zero. */
export function moveStash(stash: Stash, change: number): number {
  return Math.max(0, stash.amount_centavos + change);
}

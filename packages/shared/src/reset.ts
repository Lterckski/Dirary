/** Starting money over from ₱0, after the person re-enters their password. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { ACCOUNTS_TABLE, TRANSACTIONS_TABLE } from './money';

export type PasswordCheck = 'ok' | 'wrong' | 'offline' | 'signed-out';

/** Checks the signed-in person's password with Supabase. Needs a connection. */
export async function checkPassword(client: SupabaseClient, password: string): Promise<PasswordCheck> {
  const { data } = await client.auth.getSession();
  const email = data.session?.user.email;
  if (!email) return 'signed-out';
  try {
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (!error) return 'ok';
    return /fetch|network/i.test(error.message) ? 'offline' : 'wrong';
  } catch {
    return 'offline';
  }
}

export function passwordProblem(result: Exclude<PasswordCheck, 'ok'>): string {
  if (result === 'wrong') return "That password isn't right.";
  if (result === 'offline') return "Couldn't reach the server to check your password. Connect to the internet and try again.";
  return 'You are signed out. Sign in again first.';
}

/**
 * Deletes every transaction and sets every account's opening balance to ₱0. Accounts, categories,
 * fixed expenses and the budget stay. Rows are marked deleted, not erased, so other devices pick it up.
 */
export async function resetMoneyRemote(client: SupabaseClient, stamp: string): Promise<string | null> {
  const t = await client.from(TRANSACTIONS_TABLE).update({ deleted_at: stamp, updated_at: stamp }).is('deleted_at', null);
  if (t.error) return t.error.message;
  const a = await client.from(ACCOUNTS_TABLE).update({ opening_balance_centavos: 0, updated_at: stamp }).is('deleted_at', null);
  return a.error ? a.error.message : null;
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { checkPassword, resetMoneyRemote } from './reset';

const fakeAuth = (email: string | null, signIn: () => Promise<{ error: { message: string } | null }>) =>
  ({ auth: { getSession: async () => ({ data: { session: email ? { user: { email } } : null } }), signInWithPassword: signIn } }) as unknown as SupabaseClient;

describe('password check', () => {
  it('accepts the right password and rejects a wrong one', async () => {
    expect(await checkPassword(fakeAuth('me@example.com', async () => ({ error: null })), 'pw')).toBe('ok');
    expect(await checkPassword(fakeAuth('me@example.com', async () => ({ error: { message: 'Invalid login credentials' } })), 'pw')).toBe('wrong');
  });
  it('tells being offline or signed out apart from a wrong password', async () => {
    expect(await checkPassword(fakeAuth('me@example.com', async () => ({ error: { message: 'Failed to fetch' } })), 'pw')).toBe('offline');
    expect(await checkPassword(fakeAuth('me@example.com', async () => { throw new TypeError('Network request failed'); }), 'pw')).toBe('offline');
    expect(await checkPassword(fakeAuth(null, async () => ({ error: null })), 'pw')).toBe('signed-out');
  });
});

describe('money reset', () => {
  it('marks live transactions deleted and zeroes live accounts, and stops at the first failure', async () => {
    const calls: [string, Record<string, unknown>, string][] = [];
    const client = (fail?: string) => ({
      from: (table: string) => ({
        update: (change: Record<string, unknown>) => ({
          is: async (column: string) => { calls.push([table, change, column]); return { error: table === fail ? { message: 'nope' } : null }; },
        }),
      }),
    }) as unknown as SupabaseClient;
    expect(await resetMoneyRemote(client(), 'T')).toBeNull();
    expect(calls).toEqual([
      ['transactions', { deleted_at: 'T', updated_at: 'T' }, 'deleted_at'],
      ['accounts', { opening_balance_centavos: 0, updated_at: 'T' }, 'deleted_at'],
      ['stashes', { amount_centavos: 0, updated_at: 'T' }, 'deleted_at'],
    ]);
    calls.length = 0;
    expect(await resetMoneyRemote(client('transactions'), 'T')).toBe('nope');
    expect(calls.map((c) => c[0])).toEqual(['transactions']);
  });
});

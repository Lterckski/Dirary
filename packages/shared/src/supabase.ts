import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseEnv {
  url: string | undefined;
  /** The publishable (anon) key. Safe to ship in the app; row-level security does the protecting. */
  key: string | undefined;
}

export interface AuthStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

/** Returns null when the env vars are missing, so the apps can show setup help instead of crashing. */
export function createSupabase(env: SupabaseEnv, opts: { storage?: AuthStorage; detectSessionInUrl?: boolean } = {}): SupabaseClient | null {
  if (!env.url || !env.key) return null;
  return createClient(env.url, env.key, {
    auth: {
      storage: opts.storage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: opts.detectSessionInUrl ?? false,
    },
  });
}

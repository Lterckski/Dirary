import { createSupabase } from '@dirary/shared';

export const supabase = createSupabase(
  { url: import.meta.env.VITE_SUPABASE_URL, key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
  { detectSessionInUrl: true },
);

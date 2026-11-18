import { useEffect, useState } from 'react';
import { parseUsdaFoods, type StarterFood } from '@dirary/shared';
import { supabase } from '../supabase';

const cache = new Map<string, StarterFood[]>();

/**
 * USDA FoodData Central results for what you typed, fetched through the usda-search Supabase function a
 * moment after you stop typing. Empty for fewer than 3 characters, offline, or when the function isn't set up.
 */
export function useUsdaSearch(query: string): { results: StarterFood[]; searching: boolean; problem: string | null } {
  const q = query.trim().toLowerCase();
  const [state, setState] = useState<{ q: string; results: StarterFood[]; searching: boolean; problem: string | null }>({ q: '', results: [], searching: false, problem: null });

  useEffect(() => {
    if (q.length < 3 || !supabase) return setState({ q, results: [], searching: false, problem: null });
    const hit = cache.get(q);
    if (hit) return setState({ q, results: hit, searching: false, problem: null });
    setState((s) => ({ ...s, q, searching: true }));
    let stale = false;
    const client = supabase;
    const timer = window.setTimeout(async () => {
      const { data, error } = await client.functions.invoke('usda-search', { body: { query: q } });
      if (stale) return;
      if (error) return setState({ q, results: [], searching: false, problem: 'USDA search isn’t available right now.' });
      const results = parseUsdaFoods(data);
      cache.set(q, results);
      setState({ q, results, searching: false, problem: null });
    }, 400);
    return () => { stale = true; window.clearTimeout(timer); };
  }, [q]);

  return state.q === q ? state : { results: [], searching: q.length >= 3, problem: null };
}

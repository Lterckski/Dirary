import { useEffect, useState } from 'react';
import { offSearchUrl, parseOffSearch, parseUsdaFoods, type StarterFood } from '@dirary/shared';
import { supabase } from './supabase';

const cache = new Map<string, StarterFood[]>();

async function usda(q: string): Promise<StarterFood[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.functions.invoke('usda-search', { body: { query: q } });
  return error ? null : parseUsdaFoods(data);
}

/** Open Food Facts asks apps to name themselves. Packaged food, lots of it Filipino (Lucky Me, Magnolia, Goldilocks). */
async function openFoodFacts(q: string): Promise<StarterFood[] | null> {
  try {
    const res = await fetch(offSearchUrl(q), { headers: { 'User-Agent': 'Dirary/1.0 (personal food log)' } });
    return res.ok ? parseOffSearch(await res.json()) : null;
  } catch {
    return null;
  }
}

/**
 * Foods found online for what you typed, a moment after you stop typing: USDA FoodData Central (through the
 * usda-search Supabase function) and Open Food Facts, up to five of each. Empty for fewer than 3 characters
 * or offline; `problem` only when both fail.
 */
export function useOnlineFoods(query: string): { results: StarterFood[]; searching: boolean; problem: string | null } {
  const q = query.trim().toLowerCase();
  const [state, setState] = useState<{ q: string; results: StarterFood[]; searching: boolean; problem: string | null }>({ q: '', results: [], searching: false, problem: null });

  useEffect(() => {
    if (q.length < 3) return setState({ q, results: [], searching: false, problem: null });
    const hit = cache.get(q);
    if (hit) return setState({ q, results: hit, searching: false, problem: null });
    setState((s) => ({ ...s, q, searching: true }));
    let stale = false;
    const timer = setTimeout(async () => {
      const [fromUsda, fromOff] = await Promise.all([usda(q), openFoodFacts(q)]);
      if (stale) return;
      if (!fromUsda && !fromOff) return setState({ q, results: [], searching: false, problem: 'Online food search isn’t available right now.' });
      const results = [...(fromUsda ?? []).slice(0, 5), ...(fromOff ?? []).slice(0, 5)];
      if (fromUsda && fromOff) cache.set(q, results);
      setState({ q, results, searching: false, problem: null });
    }, 400);
    return () => { stale = true; clearTimeout(timer); };
  }, [q]);

  return state.q === q ? state : { results: [], searching: q.length >= 3, problem: null };
}

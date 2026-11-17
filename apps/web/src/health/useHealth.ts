import { useCallback, useEffect, useState } from 'react';
import {
  FOODS_TABLE, FOOD_COLUMNS, FOOD_LOGS_TABLE, FOOD_LOG_COLUMNS, HEALTH_GOALS_TABLE, HEALTH_GOAL_COLUMNS, WATER_LOGS_TABLE, WATER_LOG_COLUMNS,
  Food, FoodLog, HealthGoals, WaterLog, addDays, currentGoals, localDate, nutrition, servingsOf, servingsText, waterTap,
  type Meal, type Serving, type StarterFood,
} from '@dirary/shared';
import { supabase } from '../supabase';

const now = () => new Date().toISOString();
type Result = PromiseLike<{ error: { message: string } | null }>;
/** How far back the food log is loaded: enough for the "Again?" chips and a week's view. */
const DAYS_LOADED = 30;

export interface FoodDraft { name: string; kcal_per_100g: number; protein_per_100g: number; servings: Serving[] }

/** Foods, the food log, targets and water, kept live, with the changes the Health screen can make. */
export function useHealth() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [goals, setGoals] = useState<HealthGoals[]>([]);
  const [water, setWater] = useState<WaterLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const since = addDays(localDate(), -DAYS_LOADED);
    const [f, l, g, w] = await Promise.all([
      supabase.from(FOODS_TABLE).select(FOOD_COLUMNS).is('deleted_at', null).order('name').limit(5000),
      supabase.from(FOOD_LOGS_TABLE).select(FOOD_LOG_COLUMNS).is('deleted_at', null).gte('eaten_on', since).order('created_at').limit(5000),
      supabase.from(HEALTH_GOALS_TABLE).select(HEALTH_GOAL_COLUMNS).is('deleted_at', null),
      supabase.from(WATER_LOGS_TABLE).select(WATER_LOG_COLUMNS).is('deleted_at', null).gte('drunk_on', addDays(localDate(), -7)).order('created_at'),
    ]);
    const failure = f.error ?? l.error ?? g.error ?? w.error;
    if (failure) setError(friendly(failure.message));
    else {
      // numeric columns can come back as text; the schemas read them as numbers.
      setFoods((f.data ?? []).map((r) => Food.parse(r)));
      setLogs((l.data ?? []).map((r) => FoodLog.parse(r)));
      setGoals((g.data ?? []).map((r) => HealthGoals.parse(r)));
      setWater((w.data ?? []).map((r) => WaterLog.parse(r)));
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    if (!supabase) return;
    const client = supabase;
    let channel = client.channel('health_web');
    for (const table of [FOODS_TABLE, FOOD_LOGS_TABLE, HEALTH_GOALS_TABLE, WATER_LOGS_TABLE]) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, load);
    }
    channel.subscribe();
    return () => { client.removeChannel(channel); };
  }, [load]);

  /** Shows the change right away, saves it, and reloads if saving failed. */
  const save = useCallback(async (apply: () => void, write: () => Result) => {
    apply();
    const { error } = await write();
    if (error) {
      setError(friendly(error.message));
      load();
    } else setError(null);
  }, [load]);

  /** Creates or updates one of your foods. Returns the saved food. */
  const saveFood = useCallback((draft: FoodDraft, existing: Food | null): Food => {
    const stamp = now();
    if (existing) {
      const change = { name: draft.name, kcal_per_100g: draft.kcal_per_100g, protein_per_100g: draft.protein_per_100g, servings: servingsText(draft.servings), updated_at: stamp };
      save(() => setFoods((all) => all.map((f) => (f.id === existing.id ? { ...f, ...change } : f))), () => supabase!.from(FOODS_TABLE).update(change).eq('id', existing.id));
      return { ...existing, ...change };
    }
    const row: Food = { id: crypto.randomUUID(), name: draft.name, source: 'own', source_ref: null, kcal_per_100g: draft.kcal_per_100g, protein_per_100g: draft.protein_per_100g, servings: servingsText(draft.servings), barcode: null, created_at: stamp, updated_at: stamp, deleted_at: null };
    save(() => setFoods((all) => [...all, row]), () => supabase!.from(FOODS_TABLE).insert(row));
    return row;
  }, [save]);

  const removeFood = useCallback((id: string) => {
    const change = { deleted_at: now(), updated_at: now() };
    return save(() => setFoods((all) => all.filter((f) => f.id !== id)), () => supabase!.from(FOODS_TABLE).update(change).eq('id', id));
  }, [save]);

  /**
   * Logs an amount of a food. A starter food is first copied into your foods, so it shows up under "Again?"
   * and can be edited. A new serving typed while logging is saved with the food.
   */
  const logFood = useCallback(async (pick: { food: Food | null; starter: StarterFood | null }, grams: number, meal: Meal, addServing: Serving | null, day = localDate()) => {
    if (!supabase) return;
    const stamp = now();
    let food = pick.food;
    const writes: (() => Result)[] = [];
    if (!food && pick.starter) {
      const s = pick.starter;
      food = { id: crypto.randomUUID(), name: s.name, source: s.source, source_ref: s.key, kcal_per_100g: s.kcal_per_100g, protein_per_100g: s.protein_per_100g, servings: servingsText([...s.servings, ...(addServing ? [addServing] : [])]), barcode: null, created_at: stamp, updated_at: stamp, deleted_at: null };
      const row = food;
      writes.push(() => supabase!.from(FOODS_TABLE).insert(row));
    } else if (food && addServing) {
      const servings = servingsText([...servingsOf(food), addServing]);
      food = { ...food, servings, updated_at: stamp };
      const id = food.id;
      writes.push(() => supabase!.from(FOODS_TABLE).update({ servings, updated_at: stamp }).eq('id', id));
    }
    if (!food) return;
    const { kcal, protein } = nutrition(food, grams);
    const log: FoodLog = { id: crypto.randomUUID(), food_id: food.id, name: food.name, meal, grams, kcal, protein_g: protein, eaten_on: day, created_at: stamp, updated_at: stamp, deleted_at: null };
    writes.push(() => supabase!.from(FOOD_LOGS_TABLE).insert(log));
    const saved = food;
    await save(
      () => {
        setFoods((all) => (all.some((f) => f.id === saved.id) ? all.map((f) => (f.id === saved.id ? saved : f)) : [...all, saved]));
        setLogs((all) => [...all, log]);
      },
      async () => {
        for (const write of writes) {
          const result = await write();
          if (result.error) return result;
        }
        return { error: null };
      },
    );
  }, [save]);

  /** Changes the amount or meal of a log; calories and protein follow the food it came from. */
  const updateLog = useCallback((log: FoodLog, grams: number, meal: Meal) => {
    const food = foods.find((f) => f.id === log.food_id);
    const per = food ?? { kcal_per_100g: (log.kcal / log.grams) * 100, protein_per_100g: (log.protein_g / log.grams) * 100 };
    const { kcal, protein } = nutrition(per, grams);
    const change = { grams, meal, kcal, protein_g: protein, updated_at: now() };
    return save(() => setLogs((all) => all.map((l) => (l.id === log.id ? { ...l, ...change } : l))), () => supabase!.from(FOOD_LOGS_TABLE).update(change).eq('id', log.id));
  }, [foods, save]);

  const removeLog = useCallback((id: string) => {
    const change = { deleted_at: now(), updated_at: now() };
    return save(() => setLogs((all) => all.filter((l) => l.id !== id)), () => supabase!.from(FOOD_LOGS_TABLE).update(change).eq('id', id));
  }, [save]);

  /** Sets the daily targets. There is one goals row; it is created on first use. */
  const saveGoals = useCallback((patch: Pick<HealthGoals, 'kcal_target' | 'protein_target_g' | 'water_glasses'>) => {
    const stamp = now();
    const existing = currentGoals(goals);
    if (existing) {
      const change = { ...patch, updated_at: stamp };
      return save(() => setGoals((all) => all.map((g) => (g.id === existing.id ? { ...g, ...change } : g))), () => supabase!.from(HEALTH_GOALS_TABLE).update(change).eq('id', existing.id));
    }
    const row: HealthGoals = { id: crypto.randomUUID(), ...patch, created_at: stamp, updated_at: stamp, deleted_at: null };
    return save(() => setGoals((all) => [...all, row]), () => supabase!.from(HEALTH_GOALS_TABLE).insert(row));
  }, [goals, save]);

  /** Tapping glass n fills up to it, or empties it and the ones after. */
  const tapWater = useCallback((n: number, day = localDate()) => {
    const { add, remove } = waterTap(water, day, n);
    const stamp = now();
    if (add > 0) {
      const rows: WaterLog[] = Array.from({ length: add }, (_, i) => ({ id: crypto.randomUUID(), drunk_on: day, created_at: new Date(Date.now() + i).toISOString(), updated_at: stamp, deleted_at: null }));
      return save(() => setWater((all) => [...all, ...rows]), () => supabase!.from(WATER_LOGS_TABLE).insert(rows));
    }
    const ids = remove.map((w) => w.id);
    return save(() => setWater((all) => all.filter((w) => !ids.includes(w.id))), () => supabase!.from(WATER_LOGS_TABLE).update({ deleted_at: stamp, updated_at: stamp }).in('id', ids));
  }, [water, save]);

  return { foods, logs, goals: currentGoals(goals), water, loading, error, saveFood, removeFood, logFood, updateLog, removeLog, saveGoals, tapWater };
}

export type HealthStore = ReturnType<typeof useHealth>;

function friendly(message: string): string {
  if (/relation .* does not exist|schema cache/i.test(message)) return "The food tables aren't in Supabase yet. Run the Phase 3a SQL file (20261121000000_phase3a_food.sql), then reload.";
  if (/failed to fetch|network/i.test(message)) return "Couldn't reach the server. Check your connection and try again.";
  return message;
}

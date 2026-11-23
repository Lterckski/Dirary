/** The food log on the phone: read from the local database, change it, and sync. Rules live in packages/shared/src/health.ts. */
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import {
  FOODS_TABLE, FOOD_LOGS_TABLE, HEALTH_GOALS_TABLE, WATER_LOGS_TABLE, addDays, currentGoals, localDate, nutrition, offProductUrl, parseFoodPhoto, parseOffProduct, servingsOf, servingsText, waterTap,
  type Food, type FoodLog, type HealthGoals, type Meal, type PhotoFood, type Serving, type StarterFood, type WaterLog,
} from '@dirary/shared';

import { readFoodLogs, readFoods, readHealthGoals, readWater, saveLocal } from './db';
import { watchTables } from './realtime';
import { supabase } from './supabase';
import { subscribeStore, syncTasks } from './tasks-store';
import { refreshWidgets } from '../widgets/refresh';

const now = () => new Date().toISOString();
const listeners = new Set<() => void>();
/** How far back the food log is read: enough for the "Again?" chips. */
const DAYS_LOADED = 30;

async function changed() {
  for (const listener of listeners) listener();
  refreshWidgets().catch(() => {});
  syncTasks(); // one sync covers every table
}

export interface FoodDraft { name: string; kcal_per_100g: number; protein_per_100g: number; servings: Serving[]; barcode?: string | null }

/** Creates or updates one of your foods. Returns the saved food. */
export async function saveFood(draft: FoodDraft, existing: Food | null): Promise<Food> {
  const stamp = now();
  const row: Food = existing
    ? { ...existing, name: draft.name, kcal_per_100g: draft.kcal_per_100g, protein_per_100g: draft.protein_per_100g, servings: servingsText(draft.servings), updated_at: stamp }
    : { id: Crypto.randomUUID(), name: draft.name, source: 'own', source_ref: null, kcal_per_100g: draft.kcal_per_100g, protein_per_100g: draft.protein_per_100g, servings: servingsText(draft.servings), barcode: draft.barcode ?? null, created_at: stamp, updated_at: stamp, deleted_at: null };
  await saveLocal(FOODS_TABLE, row);
  await changed();
  return row;
}

export async function removeFood(food: Food): Promise<void> {
  await saveLocal(FOODS_TABLE, { ...food, deleted_at: now(), updated_at: now() });
  await changed();
}

/** Logs an amount of a food. A starter food is copied into your foods first; a new serving is saved with the food. */
export async function logFood(pick: { food: Food | null; starter: StarterFood | null }, grams: number, meal: Meal, addServing: Serving | null): Promise<void> {
  const stamp = now();
  let food = pick.food;
  if (!food && pick.starter) {
    const s = pick.starter;
    food = { id: Crypto.randomUUID(), name: s.name, source: s.source, source_ref: s.key, kcal_per_100g: s.kcal_per_100g, protein_per_100g: s.protein_per_100g, servings: servingsText([...s.servings, ...(addServing ? [addServing] : [])]), barcode: s.barcode ?? null, created_at: stamp, updated_at: stamp, deleted_at: null };
    await saveLocal(FOODS_TABLE, food);
  } else if (food && addServing) {
    food = { ...food, servings: servingsText([...servingsOf(food), addServing]), updated_at: stamp };
    await saveLocal(FOODS_TABLE, food);
  }
  if (!food) return;
  const { kcal, protein } = nutrition(food, grams);
  const log: FoodLog = { id: Crypto.randomUUID(), food_id: food.id, name: food.name, meal, grams, kcal, protein_g: protein, eaten_on: localDate(), created_at: stamp, updated_at: stamp, deleted_at: null };
  await saveLocal(FOOD_LOGS_TABLE, log);
  await changed();
}

/** Changes the amount or meal of a log; calories and protein follow the food it came from. */
export async function updateLog(log: FoodLog, food: Food | null, grams: number, meal: Meal): Promise<void> {
  const per = food ?? { kcal_per_100g: (log.kcal / log.grams) * 100, protein_per_100g: (log.protein_g / log.grams) * 100 };
  const { kcal, protein } = nutrition(per, grams);
  await saveLocal(FOOD_LOGS_TABLE, { ...log, grams, meal, kcal, protein_g: protein, updated_at: now() });
  await changed();
}

export async function removeLog(log: FoodLog): Promise<void> {
  await saveLocal(FOOD_LOGS_TABLE, { ...log, deleted_at: now(), updated_at: now() });
  await changed();
}

/** Sets the daily targets. There is one goals row; it is created on first use. */
export async function saveGoals(existing: HealthGoals | null, patch: Pick<HealthGoals, 'kcal_target' | 'protein_target_g' | 'water_glasses'>): Promise<void> {
  const stamp = now();
  const row: HealthGoals = existing ? { ...existing, ...patch, updated_at: stamp } : { id: Crypto.randomUUID(), ...patch, created_at: stamp, updated_at: stamp, deleted_at: null };
  await saveLocal(HEALTH_GOALS_TABLE, row);
  await changed();
}

/** Tapping glass n fills up to it, or empties it and the ones after. */
export async function tapWater(water: WaterLog[], n: number): Promise<void> {
  const day = localDate();
  const { add, remove } = waterTap(water, day, n);
  const stamp = now();
  for (let i = 0; i < add; i++) {
    const at = new Date(Date.now() + i).toISOString();
    await saveLocal(WATER_LOGS_TABLE, { id: Crypto.randomUUID(), drunk_on: day, created_at: at, updated_at: stamp, deleted_at: null });
  }
  for (const w of remove) await saveLocal(WATER_LOGS_TABLE, { ...w, deleted_at: stamp, updated_at: stamp });
  await changed();
}

/**
 * What a scanned barcode is: one of your foods first, then Open Food Facts. Null when neither knows it
 * (you then add it from the label, and it's yours the next time you scan it). Throws when offline.
 */
export async function lookUpBarcode(code: string, foods: readonly Food[]): Promise<{ food: Food | null; starter: StarterFood | null } | null> {
  const mine = foods.find((f) => f.deleted_at === null && f.barcode === code);
  if (mine) return { food: mine, starter: null };
  const res = await fetch(offProductUrl(code), { headers: { 'User-Agent': 'Dirary/1.0 (personal food log)' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts answered ${res.status}`);
  const starter = parseOffProduct(await res.json(), code);
  return starter ? { food: null, starter } : null;
}

/**
 * The foods in a photo (base64 JPEG) with their portions and calories, from the food-photo Supabase function,
 * which asks Gemini. [] when there's no food. Throws with a message to show when it can't ask.
 */
export async function lookAtPhoto(image: string): Promise<PhotoFood[]> {
  if (!supabase) throw new Error('Sign in to use the food camera.');
  const { data, error } = await supabase.functions.invoke('food-photo', { body: { image } });
  if (error) {
    const said = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(typeof said?.error === 'string' ? said.error : 'Couldn’t reach the food camera. Check your connection.');
  }
  const found = parseFoodPhoto(data);
  if (!found) throw new Error('The food camera gave a strange answer. Try again.');
  return found;
}

/** Logs foods from a photo. Each becomes one of your foods (updated if you have one by that name), so search finds it next time. */
export async function logPhotoFoods(items: readonly PhotoFood[], meal: Meal, foods: readonly Food[]): Promise<void> {
  for (const item of items) {
    const per100 = (n: number) => Math.round((n / item.grams) * 1000) / 10;
    const existing = foods.find((f) => f.deleted_at === null && f.source === 'own' && f.name.toLowerCase() === item.name.toLowerCase()) ?? null;
    const food = await saveFood({ name: item.name, kcal_per_100g: Math.min(900, per100(item.kcal)), protein_per_100g: Math.min(100, per100(item.protein_g)), servings: existing ? servingsOf(existing) : [] }, existing);
    await logFood({ food, starter: null }, item.grams, meal, null);
  }
}

/** Live foods, log, targets and water for the Health screen. */
export function useHealthStore() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [logs, setLogs] = useState<FoodLog[]>([]);
  const [goals, setGoals] = useState<HealthGoals | null>(null);
  const [water, setWater] = useState<WaterLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const today = localDate();
    const [f, l, g, w] = await Promise.all([readFoods(), readFoodLogs(addDays(today, -DAYS_LOADED)), readHealthGoals(), readWater(addDays(today, -7))]);
    setFoods(f);
    setLogs(l);
    setGoals(currentGoals(g));
    setWater(w);
    setLoading(false);
  }, []);

  useEffect(() => {
    listeners.add(load);
    const unsubscribe = subscribeStore(load); // the shared sync announces remote changes through the tasks store
    load().then(() => syncTasks());
    const unwatch = watchTables('health_phone', [FOODS_TABLE, FOOD_LOGS_TABLE, HEALTH_GOALS_TABLE, WATER_LOGS_TABLE], () => { syncTasks(); });
    return () => {
      listeners.delete(load);
      unsubscribe();
      unwatch();
    };
  }, [load]);

  return { foods, logs, goals, water, loading };
}

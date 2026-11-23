/** Food log: foods by grams, what you ate, daily targets and water. Shared by the web and the phone. */
import { z } from 'zod';
import type { InkMood } from './taskViews';

const stamps = { created_at: z.string(), updated_at: z.string(), deleted_at: z.string().nullable() };
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** numeric columns can arrive as strings from some clients; read them as numbers. */
const num = z.coerce.number();

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type Meal = (typeof MEALS)[number];
export const MEAL_LABEL: Record<Meal, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };

export const FOOD_SOURCES = ['own', 'philfct', 'usda', 'off'] as const;
export type FoodSource = (typeof FOOD_SOURCES)[number];
export const FOOD_SOURCE_LABEL: Record<FoodSource, string> = { own: 'Mine', philfct: 'PhilFCT', usda: 'USDA', off: 'Open Food Facts' };

export const Serving = z.object({ label: z.string().trim().min(1).max(30), grams: z.number().positive().max(5000) });
export type Serving = z.infer<typeof Serving>;

export const Food = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  source: z.enum(FOOD_SOURCES),
  source_ref: z.string().max(80).nullable(),
  kcal_per_100g: num.min(0).max(900),
  protein_per_100g: num.min(0).max(100),
  /** JSON array of servings, stored as text so it syncs like any other column. Read it with servingsOf. */
  servings: z.string(),
  barcode: z.string().regex(/^\d{6,14}$/).nullable(),
  ...stamps,
});
export type Food = z.infer<typeof Food>;

export const FoodLog = z.object({
  id: z.uuid(),
  food_id: z.uuid().nullable(),
  name: z.string().trim().min(1).max(80),
  meal: z.enum(MEALS),
  grams: num.positive().max(5000),
  kcal: num.min(0),
  protein_g: num.min(0),
  eaten_on: isoDate,
  ...stamps,
});
export type FoodLog = z.infer<typeof FoodLog>;

export const HealthGoals = z.object({
  id: z.uuid(),
  kcal_target: z.number().int().min(500).max(10000).nullable(),
  protein_target_g: z.number().int().min(10).max(500).nullable(),
  water_glasses: z.number().int().min(1).max(30),
  ...stamps,
});
export type HealthGoals = z.infer<typeof HealthGoals>;

export const WaterLog = z.object({ id: z.uuid(), drunk_on: isoDate, ...stamps });
export type WaterLog = z.infer<typeof WaterLog>;

export const FOODS_TABLE = 'foods';
export const FOOD_LOGS_TABLE = 'food_logs';
export const HEALTH_GOALS_TABLE = 'health_goals';
export const WATER_LOGS_TABLE = 'water_logs';
export const FOOD_COLUMNS = 'id, name, source, source_ref, kcal_per_100g, protein_per_100g, servings, barcode, created_at, updated_at, deleted_at';
export const FOOD_LOG_COLUMNS = 'id, food_id, name, meal, grams, kcal, protein_g, eaten_on, created_at, updated_at, deleted_at';
export const HEALTH_GOAL_COLUMNS = 'id, kcal_target, protein_target_g, water_glasses, created_at, updated_at, deleted_at';
export const WATER_LOG_COLUMNS = 'id, drunk_on, created_at, updated_at, deleted_at';

// ---- foods ----

/** The food's serving shortcuts. Bad or missing data reads as none. */
export function servingsOf(food: Pick<Food, 'servings'>): Serving[] {
  try {
    const parsed = z.array(Serving).safeParse(JSON.parse(food.servings));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export const servingsText = (servings: readonly Serving[]): string => JSON.stringify(servings.map((s) => ({ label: s.label.trim(), grams: round1(s.grams) })));

export const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Calories and protein for an amount of a food, to one decimal. */
export function nutrition(food: Pick<Food, 'kcal_per_100g' | 'protein_per_100g'>, grams: number): { kcal: number; protein: number } {
  return { kcal: round1((food.kcal_per_100g * grams) / 100), protein: round1((food.protein_per_100g * grams) / 100) };
}

/** "1 cup" when the grams match a serving, otherwise "150 g". */
export function amountLabel(grams: number, servings: readonly Serving[]): string {
  const match = servings.find((s) => Math.abs(s.grams - grams) < 0.5);
  return match ? match.label : `${formatGrams(grams)} g`;
}

export const formatGrams = (grams: number): string => (Number.isInteger(grams) ? String(grams) : grams.toFixed(1));
/** Whole calories with thousands separators: 1,140. */
export const formatKcal = (kcal: number): string => Math.round(kcal).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Grams typed by hand: "150", "150 g", "1,200". Null unless it is a positive amount up to 5 kg. */
export function parseGrams(text: string): number | null {
  const clean = text.replace(/[,\s]|g$/gi, '');
  if (!/^\d+(\.\d)?$/.test(clean)) return null;
  const grams = Number(clean);
  return grams > 0 && grams <= 5000 ? grams : null;
}

/** A starter food: shipped with the app, copied into your foods the first time you log it. */
export interface StarterFood {
  key: string;
  name: string;
  source: Exclude<FoodSource, 'own'>;
  kcal_per_100g: number;
  protein_per_100g: number;
  servings: Serving[];
  /** For a food found by its barcode. */
  barcode?: string;
}

export interface FoodMatch {
  /** Your saved food, if this is one. */
  food: Food | null;
  /** Or a starter food you haven't used yet. */
  starter: StarterFood | null;
  name: string;
  source: FoodSource;
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Foods matching what you typed: your own first, then starter foods you haven't saved. Every word typed
 * must start a word in the name ("chick ado" finds "Chicken adobo"). Whole-name and prefix matches rank first.
 */
export function searchFoods(query: string, foods: readonly Food[], starters: readonly StarterFood[], limit = 8): FoodMatch[] {
  const words = norm(query).split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const score = (name: string): number | null => {
    const n = norm(name);
    const parts = n.split(' ');
    if (!words.every((w) => parts.some((p) => p.startsWith(w)))) return null;
    return n === words.join(' ') ? 0 : n.startsWith(words.join(' ')) ? 1 : 2;
  };
  const own = foods.filter((f) => f.deleted_at === null);
  const saved = new Set(own.map((f) => f.source_ref).filter(Boolean));
  const ownNames = new Set(own.map((f) => norm(f.name)));
  const results: (FoodMatch & { rank: number; order: number })[] = [];
  for (const food of own) {
    const s = score(food.name);
    if (s !== null) results.push({ food, starter: null, name: food.name, source: food.source, rank: s, order: 0 });
  }
  // Starter foods keep their list order on a tie, so the picked everyday foods come before the rest of PhilFCT.
  starters.forEach((starter, order) => {
    if (saved.has(starter.key) || ownNames.has(norm(starter.name))) return;
    const s = score(starter.name);
    if (s !== null) results.push({ food: null, starter, name: starter.name, source: starter.source, rank: s + 10, order });
  });
  return results.sort((a, b) => a.rank - b.rank || a.order - b.order || a.name.localeCompare(b.name)).slice(0, limit).map(({ rank: _r, order: _o, ...m }) => m);
}

// ---- the day ----

export interface MealTotals { kcal: number; protein: number; logs: FoodLog[] }
export interface DayTotals {
  kcal: number;
  protein: number;
  meals: Record<Meal, MealTotals>;
}

/** What you ate on a day ("YYYY-MM-DD"), by meal, oldest first within each meal. */
export function dayTotals(logs: readonly FoodLog[], day: string): DayTotals {
  const meals = Object.fromEntries(MEALS.map((m) => [m, { kcal: 0, protein: 0, logs: [] as FoodLog[] }])) as Record<Meal, MealTotals>;
  let kcal = 0;
  let protein = 0;
  for (const log of [...logs].sort((a, b) => (a.created_at < b.created_at ? -1 : 1))) {
    if (log.deleted_at !== null || log.eaten_on !== day) continue;
    const m = meals[log.meal];
    m.logs.push(log);
    m.kcal = round1(m.kcal + log.kcal);
    m.protein = round1(m.protein + log.protein_g);
    kcal = round1(kcal + log.kcal);
    protein = round1(protein + log.protein_g);
  }
  return { kcal, protein, meals };
}

/** The meal a log most likely belongs to at this hour of the day. */
export function mealAt(hour: number): Meal {
  if (hour >= 4 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'snack';
}

/** There is one goals row. If two devices each created one offline, the most recently changed wins. */
export function currentGoals(goals: readonly HealthGoals[]): HealthGoals | null {
  return goals.filter((g) => g.deleted_at === null).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))[0] ?? null;
}

/** Glasses of water drunk on a day. */
export const glassesOn = (water: readonly WaterLog[], day: string): number => water.filter((w) => w.deleted_at === null && w.drunk_on === day).length;

/**
 * Tapping glass n (1-based): if it isn't filled yet, fill up to it; if it is, empty it and the ones after.
 * Returns how many glasses to add, or which logs to remove (newest first).
 */
export function waterTap(water: readonly WaterLog[], day: string, n: number): { add: number; remove: WaterLog[] } {
  const today = water.filter((w) => w.deleted_at === null && w.drunk_on === day).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  if (n > today.length) return { add: n - today.length, remove: [] };
  return { add: 0, remove: today.slice(n - 1).reverse() };
}

export interface RecentFood { food: Food; grams: number; label: string }

/** The foods you logged most recently, newest first, each with the amount you had last time: the "Again?" chips. */
export function recentFoods(logs: readonly FoodLog[], foods: readonly Food[], limit = 6): RecentFood[] {
  const byId = new Map(foods.filter((f) => f.deleted_at === null).map((f) => [f.id, f]));
  const seen = new Set<string>();
  const out: RecentFood[] = [];
  for (const log of [...logs].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))) {
    if (log.deleted_at !== null || !log.food_id || seen.has(log.food_id)) continue;
    const food = byId.get(log.food_id);
    if (!food) continue;
    seen.add(log.food_id);
    out.push({ food, grams: log.grams, label: amountLabel(log.grams, servingsOf(food)) });
    if (out.length === limit) break;
  }
  return out;
}

/** Ink's one line on the Food card. Gentle: never scolds, and stays quiet about calories until there's a target. */
export function foodCoach(totals: DayTotals, goals: HealthGoals | null, hour: number): { mood: InkMood; line: string } {
  const kcalGoal = goals?.kcal_target ?? null;
  const proteinGoal = goals?.protein_target_g ?? null;
  const eaten = MEALS.some((m) => totals.meals[m].logs.length > 0);
  if (!kcalGoal && !proteinGoal) return { mood: 'coach', line: eaten ? 'Set a calorie and protein target and I can tell you how the day is going.' : 'Log what you eat and I’ll keep count. Set your targets whenever you’re ready.' };
  if (!eaten) return hour < 11 ? { mood: 'sleepy', line: 'Nothing logged yet. Breakfast first?' } : { mood: 'coach', line: 'Nothing logged yet today. Add what you’ve had so far.' };
  const proteinLeft = proteinGoal ? Math.round(proteinGoal - totals.protein) : 0;
  const kcalLeft = kcalGoal ? Math.round(kcalGoal - totals.kcal) : 0;
  if (proteinGoal && proteinLeft <= 0 && (!kcalGoal || kcalLeft >= 0)) return { mood: 'cheer', line: 'Protein target hit. Nice work.' };
  if (kcalGoal && kcalLeft < -150) return { mood: 'worried', line: `${formatKcal(-kcalLeft)} kcal over today. Tomorrow’s a new day.` };
  if (proteinGoal && proteinLeft > 0) {
    const next = hour < 10 ? 'Breakfast' : hour < 14 ? 'Lunch' : hour < 21 ? 'Dinner' : 'A snack';
    return { mood: 'coach', line: `${proteinLeft} g of protein to go. ${next}’s a good place for ${proteinLeft > 30 ? 'most of it' : 'it'}.` };
  }
  return { mood: 'happy', line: `${formatKcal(Math.max(0, kcalLeft))} kcal left today.` };
}

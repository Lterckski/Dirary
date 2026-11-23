import { describe, expect, it } from 'vitest';
import {
  Food, amountLabel, currentGoals, dayTotals, foodCoach, glassesOn, mealAt, nutrition, parseGrams, recentFoods, searchFoods, servingsOf, servingsText, waterTap,
  type FoodLog, type HealthGoals, type StarterFood, type WaterLog,
} from './health';

const stamps = (at = '2026-11-17T01:00:00Z') => ({ created_at: at, updated_at: at, deleted_at: null });
const DAY = '2026-11-17';
let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const food = (name: string, kcal: number, protein: number, servings = '[]', p: Partial<Food> = {}): Food => ({
  id: uuid(), name, source: 'own', source_ref: null, kcal_per_100g: kcal, protein_per_100g: protein, servings, barcode: null, ...stamps(), ...p,
});
const log = (f: Food, grams: number, meal: FoodLog['meal'], at: string, p: Partial<FoodLog> = {}): FoodLog => ({
  id: uuid(), food_id: f.id, name: f.name, meal, grams, ...(() => { const x = nutrition(f, grams); return { kcal: x.kcal, protein_g: x.protein }; })(), eaten_on: DAY, ...stamps(at), ...p,
});
const goals = (kcal: number | null, protein: number | null): HealthGoals => ({ id: uuid(), kcal_target: kcal, protein_target_g: protein, water_glasses: 8, ...stamps() });

const rice = food('Rice, white, cooked', 130, 2.7, servingsText([{ label: '1 cup', grams: 158 }]));
const adobo = food('Chicken adobo', 157, 17.6, servingsText([{ label: '1 serving', grams: 150 }]));

describe('foods', () => {
  it('works out calories and protein from grams', () => {
    expect(nutrition(adobo, 150)).toEqual({ kcal: 235.5, protein: 26.4 });
    expect(nutrition(rice, 158)).toEqual({ kcal: 205.4, protein: 4.3 });
  });
  it('reads servings safely and names amounts', () => {
    expect(servingsOf(rice)).toEqual([{ label: '1 cup', grams: 158 }]);
    expect(servingsOf({ servings: 'not json' })).toEqual([]);
    expect(servingsOf({ servings: '[{"label":"","grams":5}]' })).toEqual([]);
    expect(amountLabel(158, servingsOf(rice))).toBe('1 cup');
    expect(amountLabel(120, servingsOf(rice))).toBe('120 g');
  });
  it('reads typed grams', () => {
    expect(parseGrams('150')).toBe(150);
    expect(parseGrams('1,200 g')).toBe(1200);
    expect(parseGrams('12.5')).toBe(12.5);
    expect(parseGrams('0')).toBeNull();
    expect(parseGrams('abc')).toBeNull();
    expect(parseGrams('9000')).toBeNull();
  });
  it('accepts numeric columns sent as text', () => {
    expect(Food.parse({ ...adobo, kcal_per_100g: '157.0' }).kcal_per_100g).toBe(157);
  });
});

describe('searchFoods', () => {
  const starters: StarterFood[] = [
    { key: 'pork-adobo', name: 'Pork adobo', source: 'philfct', kcal_per_100g: 300, protein_per_100g: 18, servings: [] },
    { key: 'chicken-adobo', name: 'Chicken adobo', source: 'philfct', kcal_per_100g: 150, protein_per_100g: 18, servings: [] },
    { key: 'rice', name: 'Rice, white, cooked', source: 'usda', kcal_per_100g: 130, protein_per_100g: 2.7, servings: [] },
  ];
  it('puts your own foods first and hides starters you already have', () => {
    const found = searchFoods('adobo', [adobo], starters);
    expect(found.map((f) => [f.name, f.source])).toEqual([['Chicken adobo', 'own'], ['Pork adobo', 'philfct']]);
  });
  it('matches the start of each word, ignoring case and accents', () => {
    expect(searchFoods('chick ADO', [], starters).map((f) => f.name)).toEqual(['Chicken adobo']);
    expect(searchFoods('rice', [], starters).map((f) => f.name)).toEqual(['Rice, white, cooked']);
    expect(searchFoods('ice', [], starters)).toEqual([]);
    expect(searchFoods('  ', [], starters)).toEqual([]);
  });
  it('hides a starter once it is saved', () => {
    const saved = food('Rice (mine)', 130, 2.7, '[]', { source: 'usda', source_ref: 'rice' });
    expect(searchFoods('rice', [saved], starters).map((f) => f.name)).toEqual(['Rice (mine)']);
  });
});

describe('the day', () => {
  const logs = [
    log(rice, 158, 'lunch', '2026-11-17T04:00:00Z'),
    log(adobo, 150, 'lunch', '2026-11-17T04:01:00Z'),
    log(adobo, 100, 'dinner', '2026-11-16T11:00:00Z', { eaten_on: '2026-11-16' }),
    log(rice, 100, 'breakfast', '2026-11-17T00:00:00Z', { deleted_at: '2026-11-17T00:05:00Z' }),
  ];
  it('totals the day by meal, leaving out other days and deleted logs', () => {
    const t = dayTotals(logs, DAY);
    expect(t.kcal).toBe(440.9);
    expect(t.protein).toBe(30.7);
    expect(t.meals.lunch.logs.map((l) => l.name)).toEqual(['Rice, white, cooked', 'Chicken adobo']);
    expect(t.meals.breakfast.logs).toEqual([]);
  });
  it('lists recent foods once each, with the amount you had last', () => {
    expect(recentFoods(logs, [rice, adobo]).map((r) => [r.food.name, r.label])).toEqual([['Chicken adobo', '1 serving'], ['Rice, white, cooked', '1 cup']]);
  });
  it('guesses the meal from the hour', () => {
    expect([7, 12, 16, 19, 23].map(mealAt)).toEqual(['breakfast', 'lunch', 'snack', 'dinner', 'snack']);
  });
  it('coaches gently', () => {
    const t = dayTotals(logs, DAY);
    expect(foodCoach(t, null, 12).line).toMatch(/Set a calorie/);
    expect(foodCoach(dayTotals([], DAY), goals(2200, 120), 8).mood).toBe('sleepy');
    expect(foodCoach(t, goals(2200, 120), 13).line).toBe('89 g of protein to go. Lunch’s a good place for most of it.');
    expect(foodCoach(t, goals(2200, 120), 19).line).toMatch(/Dinner’s/);
    expect(foodCoach(t, goals(2200, 30), 13).mood).toBe('cheer');
    expect(foodCoach(t, goals(200, null), 13)).toEqual({ mood: 'worried', line: '241 kcal over today. Tomorrow’s a new day.' });
  });
  it('keeps the most recently changed goals', () => {
    const a = { ...goals(2000, 100), updated_at: '2026-11-17T01:00:00Z' };
    const b = { ...goals(2200, 120), updated_at: '2026-11-17T02:00:00Z' };
    expect(currentGoals([a, b])).toBe(b);
  });
});

describe('water', () => {
  const w = (at: string, day = DAY): WaterLog => ({ id: uuid(), drunk_on: day, ...stamps(at) });
  const water = [w('2026-11-17T01:00:00Z'), w('2026-11-17T02:00:00Z'), w('2026-11-17T03:00:00Z'), w('2026-11-16T03:00:00Z', '2026-11-16')];
  it('counts today’s glasses', () => expect(glassesOn(water, DAY)).toBe(3));
  it('fills up to the glass tapped, or empties from it', () => {
    expect(waterTap(water, DAY, 5)).toEqual({ add: 2, remove: [] });
    expect(waterTap(water, DAY, 2).remove.map((x) => x.created_at)).toEqual(['2026-11-17T03:00:00Z', '2026-11-17T02:00:00Z']);
    expect(waterTap(water, DAY, 3).remove).toHaveLength(1);
  });
});

describe('starter foods', async () => {
  const { STARTER_FOODS } = await import('./starterFoods');
  it('have unique keys and sensible figures', () => {
    expect(new Set(STARTER_FOODS.map((f) => f.key)).size).toBe(STARTER_FOODS.length);
    for (const f of STARTER_FOODS) {
      expect(f.kcal_per_100g).toBeGreaterThan(0);
      expect(f.kcal_per_100g).toBeLessThanOrEqual(900); // pure oil is 900
      expect(f.protein_per_100g * 4).toBeLessThan(f.kcal_per_100g + 1); // protein can't hold more energy than the food
    }
  });
  it('are found by search', () => expect(searchFoods('sinangag', [], STARTER_FOODS)[0]?.name).toBe('Rice, fried (sinangag)'));
  it('include the rest of PhilFCT, Filipino names too, picked foods first', () => {
    expect(STARTER_FOODS.length).toBeGreaterThan(1000);
    expect(searchFoods('rice', [], STARTER_FOODS)[0]?.name).toBe('Rice, white, boiled (kanin)');
    expect(searchFoods('kare kare', [], STARTER_FOODS).map((f) => f.name)).toContain('Beef kare-kare, canned');
    expect(searchFoods('sotanghon', [], STARTER_FOODS)[0]?.name).toBe('Noodles, mung bean starch (Sotanghon)');
  });
});

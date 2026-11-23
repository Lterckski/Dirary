/**
 * Reading food data from outside sources into foods you can log: USDA FoodData Central (searched through the
 * usda-search Supabase function) and Open Food Facts (looked up by barcode). Both give figures per 100 g.
 */
import { z } from 'zod';
import type { Serving, StarterFood } from './health';

const UsdaFood = z.object({
  fdcId: z.coerce.number().int().positive(),
  description: z.string().min(1),
  dataType: z.string().optional(),
  foodNutrients: z.array(z.object({ nutrientId: z.coerce.number(), unitName: z.string().optional(), value: z.coerce.number().optional() })).default([]),
  foodMeasures: z.array(z.object({ disseminationText: z.string().optional(), gramWeight: z.coerce.number().optional() })).default([]),
});

const ENERGY_KCAL = 1008;
const ENERGY_ATWATER = [2047, 2048];
const PROTEIN = 1003;

/** "RICE, WHITE, COOKED" → "Rice, white, cooked"; mixed-case names are left alone. Cut to 80 characters. */
function tidyName(name: string): string {
  const n = name.trim().replace(/\s+/g, ' ');
  const shouty = n === n.toUpperCase();
  const fixed = shouty ? n.charAt(0) + n.slice(1).toLowerCase() : n;
  return fixed.length > 80 ? `${fixed.slice(0, 79)}…` : fixed;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Household measures as servings: "1 cup" = 158 g. Vague ones ("Quantity not specified") are left out. */
function measures(list: { disseminationText?: string; gramWeight?: number }[]): Serving[] {
  const out: Serving[] = [];
  for (const m of list) {
    const label = (m.disseminationText ?? '').trim();
    const grams = m.gramWeight ?? 0;
    if (!label || !(grams > 0 && grams <= 5000) || /not specified|^undetermined/i.test(label)) continue;
    if (out.some((s) => s.label === label.slice(0, 30))) continue;
    out.push({ label: label.slice(0, 30), grams: round1(grams) });
    if (out.length === 4) break;
  }
  return out;
}

/** USDA search results as foods to log. Ones without a calorie figure are skipped. */
export function parseUsdaFoods(data: unknown): StarterFood[] {
  const list = (data as { foods?: unknown })?.foods;
  if (!Array.isArray(list)) return [];
  const out: StarterFood[] = [];
  for (const raw of list) {
    const parsed = UsdaFood.safeParse(raw);
    if (!parsed.success) continue;
    const f = parsed.data;
    const value = (id: number) => f.foodNutrients.find((n) => n.nutrientId === id && n.value !== undefined && (n.unitName ?? '').toUpperCase() !== 'KJ')?.value;
    const kcal = value(ENERGY_KCAL) ?? ENERGY_ATWATER.map(value).find((v) => v !== undefined);
    if (kcal === undefined || kcal < 0 || kcal > 900) continue;
    const protein = Math.min(100, Math.max(0, value(PROTEIN) ?? 0));
    out.push({ key: `usda:${f.fdcId}`, name: tidyName(f.description), source: 'usda', kcal_per_100g: round1(kcal), protein_per_100g: round1(protein), servings: measures(f.foodMeasures) });
  }
  return out;
}

// ---- Open Food Facts ----

/** A barcode as printed: 8, 12, 13 or 14 digits (EAN-8, UPC-A, EAN-13, GTIN-14). */
export const isBarcode = (code: string): boolean => /^(\d{8}|\d{12,14})$/.test(code);

/** The Open Food Facts address for one product, asking only for the fields the app reads. */
export const offProductUrl = (barcode: string): string =>
  `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,brands,nutriments,serving_quantity,serving_size`;

const OffProduct = z.object({
  status: z.coerce.number().optional(),
  product: z.object({
    product_name: z.string().optional(),
    brands: z.string().optional(),
    serving_quantity: z.coerce.number().optional(),
    serving_size: z.string().optional(),
    nutriments: z.record(z.string(), z.unknown()).default({}),
  }).optional(),
});

/**
 * An Open Food Facts product as a food to log, or null when it isn't there or has no calorie figure.
 * Calories come from "energy-kcal_100g", or from kJ divided by 4.184 when only that is given.
 */
export function parseOffProduct(data: unknown, barcode: string): StarterFood | null {
  const parsed = OffProduct.safeParse(data);
  if (!parsed.success || !parsed.data.product) return null;
  const p = parsed.data.product;
  const num = (key: string) => {
    const v = Number(p.nutriments[key]);
    return Number.isFinite(v) ? v : undefined;
  };
  const kj = num('energy_100g') ?? num('energy-kj_100g');
  const kcal = num('energy-kcal_100g') ?? (kj !== undefined ? kj / 4.184 : undefined);
  if (kcal === undefined || kcal < 0 || kcal > 900) return null;
  const protein = Math.min(100, Math.max(0, num('proteins_100g') ?? 0));
  const brand = (p.brands ?? '').split(',')[0]?.trim();
  const base = (p.product_name ?? '').trim() || 'Scanned food';
  const name = brand && !base.toLowerCase().includes(brand.toLowerCase()) ? `${base} (${brand})` : base;
  const servingGrams = p.serving_quantity;
  const servings: Serving[] = servingGrams && servingGrams > 0 && servingGrams <= 5000 ? [{ label: '1 serving', grams: round1(servingGrams) }] : [];
  return { key: `off:${barcode}`, name: name.slice(0, 80), source: 'off', kcal_per_100g: round1(kcal), protein_per_100g: round1(protein), servings, barcode };
}

/** Open Food Facts text search (free, no key). Its server doesn't allow web pages to call it, so only the phone uses it. */
export const offSearchUrl = (query: string): string =>
  `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=15&fields=code,product_name,brands,nutriments,serving_quantity`;

/**
 * Open Food Facts search hits as foods to log. Hits without calories, or with nothing at all (0 kcal and
 * 0 g protein, which is mostly missing data), are skipped.
 */
export function parseOffSearch(data: unknown): StarterFood[] {
  const hits = (data as { hits?: unknown })?.hits;
  if (!Array.isArray(hits)) return [];
  const out: StarterFood[] = [];
  for (const hit of hits as Record<string, unknown>[]) {
    const code = String(hit?.code ?? '');
    if (!isBarcode(code)) continue;
    const brands = Array.isArray(hit.brands) ? hit.brands.join(',') : hit.brands;
    const food = parseOffProduct({ product: { ...hit, brands } }, code);
    if (food && (food.kcal_per_100g > 0 || food.protein_per_100g > 0)) out.push(food);
  }
  return out;
}

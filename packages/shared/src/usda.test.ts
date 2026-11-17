import { describe, expect, it } from 'vitest';
import { isBarcode, parseOffProduct, parseUsdaFoods } from './usda';

describe('parseUsdaFoods', () => {
  const data = {
    foods: [
      {
        fdcId: 168878, description: 'RICE, WHITE, LONG-GRAIN, REGULAR, ENRICHED, COOKED', dataType: 'SR Legacy',
        foodNutrients: [{ nutrientId: 1003, unitName: 'G', value: 2.69 }, { nutrientId: 1008, unitName: 'KCAL', value: 130 }],
        foodMeasures: [{ disseminationText: '1 cup', gramWeight: 158 }, { disseminationText: 'Quantity not specified', gramWeight: 200 }],
      },
      { fdcId: 2346393, description: 'Banana, raw', dataType: 'Foundation', foodNutrients: [{ nutrientId: 1003, unitName: 'G', value: 0.74 }, { nutrientId: 2047, unitName: 'KCAL', value: 97.5 }] },
      { fdcId: 1, description: 'No energy', foodNutrients: [{ nutrientId: 1003, value: 5 }] },
      { fdcId: 'bad' },
    ],
  };
  it('reads calories, protein and measures per 100 g', () => {
    expect(parseUsdaFoods(data)).toEqual([
      { key: 'usda:168878', name: 'Rice, white, long-grain, regular, enriched, cooked', source: 'usda', kcal_per_100g: 130, protein_per_100g: 2.7, servings: [{ label: '1 cup', grams: 158 }] },
      { key: 'usda:2346393', name: 'Banana, raw', source: 'usda', kcal_per_100g: 97.5, protein_per_100g: 0.7, servings: [] },
    ]);
  });
  it('copes with anything else', () => {
    expect(parseUsdaFoods(null)).toEqual([]);
    expect(parseUsdaFoods({ foods: 'x' })).toEqual([]);
  });
});

describe('Open Food Facts', () => {
  it('reads a product', () => {
    const food = parseOffProduct({ status: 1, product: { product_name: 'Skyflakes Crackers', brands: 'M.Y. San, Monde', serving_quantity: 25, nutriments: { 'energy-kcal_100g': 460, proteins_100g: 9.2 } } }, '4800092110222');
    expect(food).toEqual({ key: 'off:4800092110222', name: 'Skyflakes Crackers (M.Y. San)', source: 'off', kcal_per_100g: 460, protein_per_100g: 9.2, servings: [{ label: '1 serving', grams: 25 }], barcode: '4800092110222' });
  });
  it('works out kcal from kJ, and gives up without energy', () => {
    expect(parseOffProduct({ product: { product_name: 'Juice', nutriments: { energy_100g: 184 } } }, '12345678')?.kcal_per_100g).toBe(44);
    expect(parseOffProduct({ product: { product_name: 'Mystery', nutriments: {} } }, '12345678')).toBeNull();
    expect(parseOffProduct({ status: 0 }, '12345678')).toBeNull();
  });
  it('knows a barcode', () => {
    expect(isBarcode('4800092110222')).toBe(true);
    expect(isBarcode('12345')).toBe(false);
  });
});

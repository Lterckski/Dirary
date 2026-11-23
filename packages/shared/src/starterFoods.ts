/**
 * Foods shipped with the app, so search finds common Filipino food from day one. Every figure is per 100 g
 * of the edible portion (no bones, skin or peel unless the name says so), from DOST-FNRI's Philippine Food
 * Composition Table (PhilFCT, release 1, December 2019). Each line gives the PhilFCT food ID and its report
 * page. Three figures come from Juan Nutrisyon, which republishes PhilFCT data; their keys are names, not IDs.
 *
 * Servings are only given where the weight is standard (USDA: 1 cup cooked rice = 158 g, 1 large egg = 50 g).
 * Add your own when you log; they are saved with the food.
 */
import type { StarterFood } from './health';
import { PHILFCT_ROWS } from './philfctFoods';

const fct = (key: string, name: string, kcal: number, protein: number, servings: StarterFood['servings'] = []): StarterFood =>
  ({ key: `philfct:${key}`, name, source: 'philfct', kcal_per_100g: kcal, protein_per_100g: protein, servings });

const CUP_RICE = [{ label: '1 cup', grams: 158 }];
const EGG = [{ label: '1 egg', grams: 50 }];

const PICKED: readonly StarterFood[] = [
  // Rice and rice dishes
  fct('rice-well-milled-boiled', 'Rice, white, boiled (kanin)', 129, 2.1, CUP_RICE),             // Juan Nutrisyon, from PhilFCT "Rice, well-milled, boiled"
  fct('rice-well-milled-fried', 'Rice, fried (sinangag)', 187, 2.6, CUP_RICE),                  // Juan Nutrisyon, from PhilFCT "Rice, well-milled, fried"
  fct('A183', 'Lugaw (rice porridge)', 71, 1.4),                              // report/3145
  fct('R012', 'Champorado with milk', 97, 1.7),                               // report/4432
  // Eggs
  fct('H004', 'Egg, boiled', 166, 14, EGG),                                   // report/4216
  fct('H002', 'Egg white', 61, 12.7),                                         // report/4214
  fct('H016', 'Balut', 172, 12.8),                                            // report/4228
  // Chicken
  fct('F093', 'Chicken breast, raw', 131, 21.6),                              // report/3800
  fct('F266', 'Lechon manok, skin removed', 162, 26.2),                       // report/3973
  fct('chicken-thigh-leg', 'Chicken thigh & leg, raw', 187, 17.6),                         // Juan Nutrisyon, from PhilFCT "Chicken thigh & leg"
  // Pork, beef, processed meat
  fct('R047', 'Adobo, pork & chicken (canned)', 189, 14.5),                   // report/4467
  fct('R050', 'Adobo, pork (canned)', 277, 10.3),                             // report/4470
  fct('F257', 'Longganisa, pork', 315, 11.8),                                 // report/3964
  fct('F245', 'Tocino, pork', 206, 11.2),                                     // report/3952
  fct('F226', 'Corned beef (canned)', 168, 17.9),                             // report/3933
  fct('F227', 'Embotido', 164, 10.1),                                         // report/3934
  fct('R086', 'Pork & beans (canned)', 105, 4.7),                             // report/4506
  // Fish
  fct('G076', 'Bangus (milkfish), fried', 188, 23.6),                         // report/4056
  fct('G075', 'Bangus (milkfish), grilled', 137, 23.4),                       // report/4055
  fct('G162', 'Fish ball, fried', 266, 10.3),                                 // report/4142
  // Bread and snacks
  fct('A039', 'Pan de leche', 323, 10.5),                                     // report/3001
  fct('A041', 'Pan de monay', 318, 10.6),                                     // report/3003
  fct('A045', 'Ensaymada', 326, 8.6),                                         // report/3007
  fct('A114', 'Crackers, salted', 480, 9.6),                                  // report/3076
  fct('A094', 'Otap', 462, 10.1),                                             // report/3056
  // Bananas
  fct('E014', 'Banana, saba', 110, 1.1),                                      // report/3596
  fct('E008', 'Banana, cavendish', 104, 0.9),                                 // report/3590
  fct('E101', 'Banana cue', 183, 2),                                          // report/3683
  fct('E102', 'Turon', 259, 2.4),                                             // report/3684
];

/** The picked foods above (friendly names, servings), then the rest of PhilFCT, about 1,500 foods. */
export const STARTER_FOODS: readonly StarterFood[] = [
  ...PICKED,
  ...PHILFCT_ROWS.filter(([id]) => !PICKED.some((f) => f.key === `philfct:${id}`)).map(([id, name, kcal, protein]) => fct(id, name, kcal, protein)),
];

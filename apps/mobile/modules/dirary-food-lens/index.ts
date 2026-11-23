import { requireOptionalNativeModule } from 'expo';

export interface FoodGuess {
  /** The dish, in English: "Sinigang", "Halo-halo", "Fried rice". */
  name: string;
  /** 0 to 1. */
  confidence: number;
}

interface DiraryFoodLensNative {
  guess(uri: string): Promise<FoodGuess[]>;
}

/** Null on an app build made before the food camera existed, and on anything that isn't Android. */
const native = requireOptionalNativeModule<DiraryFoodLensNative>('DiraryFoodLens');

export const foodLensAvailable = native !== null;
/** What dish a photo (a file:// address) shows, best guess first. Runs on the phone; nothing is uploaded. */
export const guessFood = (uri: string): Promise<FoodGuess[]> => native?.guess(uri) ?? Promise.resolve([]);

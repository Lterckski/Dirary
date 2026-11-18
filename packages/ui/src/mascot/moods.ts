/**
 * Ink's moods. The pictures themselves are PNGs cut from the Gemini art by tools/mascot/cutout.py:
 * apps/mobile/assets/mascot and apps/web/public/ink.
 */
export type MascotMood = 'happy' | 'coach' | 'cheer' | 'sleepy' | 'worried';
export const MASCOT_MOODS: readonly MascotMood[] = ['happy', 'coach', 'cheer', 'sleepy', 'worried'];

export interface MascotProps {
  mood?: MascotMood;
  /** Width and height of the square picture, in points. */
  size?: number;
}

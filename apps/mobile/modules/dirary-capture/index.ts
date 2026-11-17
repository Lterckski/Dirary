import { requireOptionalNativeModule } from 'expo';

export interface Capture {
  id: number;
  packageName: string;
  title: string;
  text: string;
  /** Milliseconds since epoch. */
  postedAt: number;
}

interface DiraryCaptureNative {
  isEnabled(): boolean;
  openSettings(): void;
  getKeywords(): string[];
  setKeywords(keywords: string[]): void;
  getCaptures(afterId: number, limit: number): Capture[];
  count(): number;
  clear(): void;
}

/** Null on an app build made before capture mode existed, and on anything that isn't Android. */
const native = requireOptionalNativeModule<DiraryCaptureNative>('DiraryCapture');

export const captureAvailable = native !== null;
export const isCaptureEnabled = (): boolean => native?.isEnabled() ?? false;
export const openCaptureSettings = (): void => native?.openSettings();
export const getCaptureKeywords = (): string[] => native?.getKeywords() ?? [];
export const setCaptureKeywords = (keywords: string[]): void => native?.setKeywords(keywords);
export const getCaptures = (afterId: number, limit = 200): Capture[] => native?.getCaptures(afterId, limit) ?? [];
export const captureCount = (): number => native?.count() ?? 0;
export const clearCaptures = (): void => native?.clear();

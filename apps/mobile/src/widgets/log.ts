/**
 * A short record of what the home-screen widgets did, kept on the phone, so "the widget is blank" can be
 * looked into from inside the app (the widget check on Today). Holds no task text, only what ran and when.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'widget-log';
const KEEP = 30;

export interface WidgetLogEntry { at: string; widget: string; action: string; ok: boolean; note?: string }

export async function logWidget(entry: Omit<WidgetLogEntry, 'at'>): Promise<void> {
  try {
    const list = await readWidgetLog();
    await AsyncStorage.setItem(KEY, JSON.stringify([{ ...entry, at: new Date().toISOString() }, ...list].slice(0, KEEP)));
  } catch {
    // Logging must never break a widget.
  }
}

export async function readWidgetLog(): Promise<WidgetLogEntry[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]');
  } catch {
    return [];
  }
}

export function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 300) : String(error).slice(0, 300);
}

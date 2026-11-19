/**
 * Ink's nudges on the web: the same lines as the phone (packages/shared/src/inkVoice.ts) and the same bark,
 * shown as browser notifications. A web page can only do this while Dirary is open in a tab (no server
 * push), so the phone stays the main place for reminders.
 */
import { dayNudges, inkNote, type DayNudgeInput, type Task } from '@dirary/shared';

const ICON = '/ink/ink-badge.png';
const BARK = '/sounds/bark.wav';
/** Timers only go this far ahead; the plan is redone whenever Today changes anyway. */
const HORIZON_MS = 24 * 60 * 60 * 1000;

export const nudgesSupported = () => typeof window !== 'undefined' && 'Notification' in window;
export const nudgePermission = (): NotificationPermission | 'unsupported' => (nudgesSupported() ? Notification.permission : 'unsupported');

/** Must be called from a click. Plays the bark once so the browser lets it play later. */
export async function askForNudges(): Promise<boolean> {
  if (!nudgesSupported()) return false;
  const result = await Notification.requestPermission();
  if (result === 'granted') show('Ink here…', 'Woof. I\'ll nudge you here while Dirary is open.');
  return result === 'granted';
}

let audio: HTMLAudioElement | null = null;
function bark() {
  try {
    audio ??= new Audio(BARK);
    audio.currentTime = 0;
    void audio.play().catch(() => {});
  } catch { /* no audio */ }
}

function show(title: string, body: string, url = '/') {
  if (nudgePermission() !== 'granted') return;
  try {
    const n = new Notification(title, { body, icon: ICON, badge: ICON, tag: `${title}:${body}`, silent: true });
    n.onclick = () => { window.focus(); if (url !== location.pathname) location.assign(url); n.close(); };
    bark();
  } catch { /* some browsers only allow notifications from a service worker */ }
}

const timers = new Map<string, number>();

/**
 * Replaces every scheduled nudge with this plan: today's task reminders and Ink's day nudges
 * (lunch not logged, workout not done, tasks still open tonight). Timers live outside React, so they keep
 * running while you're on another page of the app.
 */
export function planNudges(tasks: readonly Task[], day: Omit<DayNudgeInput, 'now'>) {
  for (const id of timers.values()) window.clearTimeout(id);
  timers.clear();
  if (nudgePermission() !== 'granted') return;
  const now = Date.now();
  const at = (key: string, when: number, title: string, body: string, url: string) => {
    const wait = when - now;
    if (wait <= 0 || wait > HORIZON_MS) return;
    timers.set(key, window.setTimeout(() => { timers.delete(key); show(title, body, url); }, wait));
  };
  for (const task of tasks) {
    if (task.status !== 'todo' || task.deleted_at !== null || !task.remind_at) continue;
    const note = inkNote('task', { task: task.title }, `${task.id}:${task.remind_at}`);
    at(`task-${task.id}`, Date.parse(task.remind_at), note.title, note.body, '/tasks');
  }
  for (const n of dayNudges({ ...day, now: new Date(now) })) at(n.id, n.at.getTime(), n.note.title, n.note.body, '/');
}

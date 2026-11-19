/**
 * Ink's nudges on the web: the same lines as the phone (packages/shared/src/inkVoice.ts) and the same bark,
 * shown as browser notifications. A web page can only do this while Dirary is open in a tab (no server
 * push), so the phone stays the main place for reminders.
 */
import { useSyncExternalStore } from 'react';
import { dayNudges, inkNote, reminderDue, SNOOZE_MINUTES, type DayNudgeInput, type Task } from '@dirary/shared';

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
 * Task reminders that have gone off and are waiting for an answer: "Remind me in 15 min" or "Cancel".
 * A browser notification can't carry buttons without a service worker, so Dirary shows them in the page.
 */
export type RingingReminder = { taskId: string; title: string; body: string };
let ringing: readonly RingingReminder[] = [];
const listeners = new Set<() => void>();
const snoozes = new Map<string, number>();

function setRinging(next: readonly RingingReminder[]) {
  ringing = next;
  for (const l of listeners) l();
}

function ring(reminder: RingingReminder) {
  show(reminder.title, reminder.body, '/tasks');
  setRinging([...ringing.filter((r) => r.taskId !== reminder.taskId), reminder]);
}

export function useRingingReminders(): readonly RingingReminder[] {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => ringing);
}

/** Rings the same reminder again in 15 minutes. */
export function snoozeReminder(taskId: string) {
  const reminder = ringing.find((r) => r.taskId === taskId);
  if (!reminder) return;
  setRinging(ringing.filter((r) => r.taskId !== taskId));
  window.clearTimeout(snoozes.get(taskId));
  snoozes.set(taskId, window.setTimeout(() => { snoozes.delete(taskId); ring(reminder); }, SNOOZE_MINUTES * 60_000));
}

/** Clears a reminder that went off, and any snooze of it. */
export function cancelReminder(taskId: string) {
  setRinging(ringing.filter((r) => r.taskId !== taskId));
  window.clearTimeout(snoozes.get(taskId));
  snoozes.delete(taskId);
}

/**
 * Replaces every scheduled nudge with this plan: today's task reminders and Ink's day nudges
 * (lunch not logged, workout not done, tasks still open tonight). Timers live outside React, so they keep
 * running while you're on another page of the app.
 */
export function planNudges(tasks: readonly Task[], day: Omit<DayNudgeInput, 'now'>) {
  for (const id of timers.values()) window.clearTimeout(id);
  timers.clear();
  // A reminder that went off or was snoozed goes away once its task is done or deleted.
  const open = new Set(tasks.filter((t) => t.status === 'todo' && t.deleted_at === null).map((t) => t.id));
  for (const r of ringing) if (!open.has(r.taskId)) cancelReminder(r.taskId);
  for (const id of [...snoozes.keys()]) if (!open.has(id)) cancelReminder(id);
  if (nudgePermission() !== 'granted') return;
  const now = Date.now();
  const at = (key: string, when: number, fire: () => void) => {
    const wait = when - now;
    if (wait <= 0 || wait > HORIZON_MS) return;
    timers.set(key, window.setTimeout(() => { timers.delete(key); fire(); }, wait));
  };
  for (const task of tasks) {
    const when = task.status === 'todo' && task.deleted_at === null ? reminderDue(task, new Date(now)) : null;
    if (!when) continue;
    const note = inkNote('task', { task: task.title }, `${task.id}:${task.remind_at}`);
    at(`task-${task.id}`, when.getTime(), () => ring({ taskId: task.id, title: note.title, body: note.body }));
  }
  for (const n of dayNudges({ ...day, now: new Date(now) })) at(n.id, n.at.getTime(), () => show(n.note.title, n.note.body, '/'));
}

export const REMINDERS = ['none', 'at', '10m', '1h', '1d'] as const;
export type Reminder = (typeof REMINDERS)[number];
export const REMINDER_LABEL: Record<Reminder, string> = { none: 'No reminder', at: 'At the due time', '10m': '10 minutes before', '1h': '1 hour before', '1d': '1 day before' };
const OFFSET_MS: Record<Exclude<Reminder, 'none'>, number> = { at: 0, '10m': 600_000, '1h': 3_600_000, '1d': 86_400_000 };

/** A due date without a time counts as 9:00 AM for reminders. */
export const DEFAULT_REMINDER_TIME = '09:00';

function dueMoment(dueDate: string, dueTime: string | null): Date {
  const [y, m, d] = dueDate.split('-').map(Number) as [number, number, number];
  const [hh, mm] = (dueTime ?? DEFAULT_REMINDER_TIME).split(':').map(Number) as [number, number];
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

/** When to remind, as an ISO timestamp, or null. */
export function remindAt(dueDate: string | null, dueTime: string | null, reminder: Reminder): string | null {
  if (reminder === 'none' || !dueDate) return null;
  return new Date(dueMoment(dueDate, dueTime).getTime() - OFFSET_MS[reminder]).toISOString();
}

/** Which reminder option a saved task has, for showing in the editor. */
export function reminderOf(task: { due_date: string | null; due_time: string | null; remind_at: string | null }): Reminder {
  if (!task.remind_at || !task.due_date) return 'none';
  const gap = dueMoment(task.due_date, task.due_time).getTime() - Date.parse(task.remind_at);
  const match = (Object.keys(OFFSET_MS) as Exclude<Reminder, 'none'>[]).find((k) => Math.abs(OFFSET_MS[k] - gap) < 60_000);
  return match ?? 'at';
}

/** Tasks with a time get a reminder at that time unless told otherwise. */
export function defaultReminder(dueTime: string | null): Reminder {
  return dueTime ? 'at' : 'none';
}

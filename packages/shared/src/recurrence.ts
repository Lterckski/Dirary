import { addDays, localDate } from './dates';
import type { Task } from './tasks';

export const RECURRENCES = ['daily', 'weekdays', 'weekly', 'monthly'] as const;
export type Recurrence = (typeof RECURRENCES)[number];
export const RECURRENCE_LABEL: Record<Recurrence, string> = { daily: 'Every day', weekdays: 'Every weekday', weekly: 'Every week', monthly: 'Every month' };

export function asRecurrence(rule: string | null | undefined): Recurrence | null {
  return (RECURRENCES as readonly string[]).includes(rule ?? '') ? (rule as Recurrence) : null;
}

const parts = (date: string) => date.split('-').map(Number) as [number, number, number];

/** The next due date after `date` for a repeat rule. Monthly keeps the day, clamped to the month's length. */
export function nextDueDate(date: string, rule: Recurrence): string {
  if (rule === 'daily') return addDays(date, 1);
  if (rule === 'weekly') return addDays(date, 7);
  if (rule === 'weekdays') {
    let next = addDays(date, 1);
    for (;;) {
      const [y, m, d] = parts(next);
      const day = new Date(y, m - 1, d).getDay();
      if (day !== 0 && day !== 6) return next;
      next = addDays(next, 1);
    }
  }
  const [y, m, d] = parts(date);
  const lastDay = new Date(y, m + 1, 0).getDate(); // last day of the following month
  return localDate(new Date(y, m, Math.min(d, lastDay)));
}

const dayNumber = (date: string) => { const [y, m, d] = parts(date); return Math.round(Date.UTC(y, m - 1, d) / 86_400_000); };

/**
 * What changes when a task is ticked off.
 * A repeating task is marked done and a fresh copy is created for its next date,
 * always after today, so finishing an overdue daily task schedules tomorrow, not yesterday.
 */
export function completeTask(task: Task, nowIso: string, today: string, newId: string): { done: Partial<Task>; next: Task | null } {
  const rule = asRecurrence(task.recurrence_rule);
  const done: Partial<Task> = { status: 'done', completed_at: nowIso, updated_at: nowIso, ...(rule ? { recurrence_rule: null } : {}) };
  if (!rule) return { done, next: null };

  const from = task.due_date ?? today;
  let due = nextDueDate(from, rule);
  while (due <= today) due = nextDueDate(due, rule);
  const shift = (dayNumber(due) - dayNumber(from)) * 86_400_000;
  const next: Task = {
    ...task,
    id: newId,
    due_date: due,
    remind_at: task.remind_at ? new Date(Date.parse(task.remind_at) + shift).toISOString() : null,
    status: 'todo',
    completed_at: null,
    created_at: nowIso,
    updated_at: nowIso,
    deleted_at: null,
  };
  return { done, next };
}

/** Un-ticking a task. */
export function reopenTask(nowIso: string): Partial<Task> {
  return { status: 'todo', completed_at: null, updated_at: nowIso };
}

import * as chrono from 'chrono-node';
import { localDate } from './dates';
import type { Recurrence } from './recurrence';
import type { Priority } from './tasks';

export interface QuickAdd {
  title: string;
  due_date: string | null;
  due_time: string | null;
  priority: Priority;
  recurrence: Recurrence | null;
  /** Set when the text has a #tag that matches one of your lists. */
  list_id: string | null;
}

export interface ListRef { id: string; name: string }

const TAG = /(^|\s)#([\p{L}\p{N}_-]+)(?=\s|$)/u;
const squash = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** "#school" matches the list "School"; "#per" matches "Personal" if no other list starts that way. */
function findList(tag: string, lists: readonly ListRef[]): ListRef | null {
  const wanted = squash(tag);
  if (!wanted) return null;
  const exact = lists.find((l) => squash(l.name) === wanted);
  if (exact) return exact;
  const starts = lists.filter((l) => squash(l.name).startsWith(wanted));
  return starts.length === 1 ? starts[0]! : null;
}

const URGENCY = /(^|\s)!(high|medium|med|low|h|m|l|[123])(?=\s|$)/i;
const URGENCY_VALUE: Record<string, Priority> = { high: 3, h: 3, '3': 3, medium: 2, med: 2, m: 2, '2': 2, low: 1, l: 1, '1': 1 };
const REPEAT: [RegExp, Recurrence][] = [
  [/\b(every\s?weekday|on weekdays)\b/i, 'weekdays'],
  [/\b(every\s?day|daily)\b/i, 'daily'],
  [/\b(every\s?week|weekly)\b/i, 'weekly'],
  [/\b(every\s?month|monthly)\b/i, 'monthly'],
];
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Turns "Submit lab report tomorrow 5pm !high #school" into a clean title ("Submit lab report")
 * plus a date, time, urgency, repeat and list. Anything it can't read stays in the title.
 */
export function parseQuickAdd(text: string, now: Date = new Date(), lists: readonly ListRef[] = []): QuickAdd {
  let rest = text;
  let priority: Priority = 0;
  let recurrence: Recurrence | null = null;
  let list_id: string | null = null;

  const tag = TAG.exec(rest);
  if (tag) {
    const list = findList(tag[2]!, lists);
    if (list) {
      list_id = list.id;
      rest = rest.replace(tag[0], ' ');
    }
  }

  const urgency = URGENCY.exec(rest);
  if (urgency) {
    priority = URGENCY_VALUE[urgency[2]!.toLowerCase()] ?? 0;
    rest = rest.replace(urgency[0], ' ');
  }
  for (const [pattern, rule] of REPEAT) {
    if (pattern.test(rest)) {
      recurrence = rule;
      rest = rest.replace(pattern, ' ');
      break;
    }
  }

  let due_date: string | null = null;
  let due_time: string | null = null;
  const found = chrono.parse(rest, now, { forwardDate: true })[0];
  if (found) {
    const when = found.start.date();
    due_date = localDate(when);
    if (found.start.isCertain('hour')) due_time = `${pad(when.getHours())}:${pad(when.getMinutes())}`;
    rest = rest.slice(0, found.index) + ' ' + rest.slice(found.index + found.text.length);
  }
  if (recurrence && !due_date) due_date = localDate(now);

  let title = rest.replace(/\s+/g, ' ').trim().replace(/\s+(on|at|by|due|this|for)$/i, '').trim();
  // If everything was read as a date ("Friday"), keep the words as the title instead of losing them.
  if (!title) title = text.replace(/\s+/g, ' ').trim();
  return { title, due_date, due_time, priority, recurrence, list_id };
}

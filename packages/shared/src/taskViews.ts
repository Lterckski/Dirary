import { addDays } from './dates';
import type { Task } from './tasks';

/** Sort open tasks: earliest due first, then higher priority, then oldest first. Undated tasks go last. */
export function compareTasks(a: Task, b: Task): number {
  const ad = a.due_date ?? '9999-12-31';
  const bd = b.due_date ?? '9999-12-31';
  if (ad !== bd) return ad < bd ? -1 : 1;
  const at = a.due_time ?? '99:99';
  const bt = b.due_time ?? '99:99';
  if (at !== bt) return at < bt ? -1 : 1;
  if (a.priority !== b.priority) return b.priority - a.priority;
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

const live = (tasks: readonly Task[]) => tasks.filter((t) => t.deleted_at === null);
const newestDoneFirst = (a: Task, b: Task) => ((a.completed_at ?? '') < (b.completed_at ?? '') ? 1 : -1);

export interface TodayView {
  overdue: Task[];
  dueToday: Task[];
  /** Finished today, whatever their due date. */
  doneToday: Task[];
  /** Everything due today or overdue, plus what was finished today. */
  total: number;
  done: number;
}

export function todayView(tasks: readonly Task[], today: string, toLocalDate: (iso: string) => string): TodayView {
  const open = live(tasks).filter((t) => t.status === 'todo');
  const overdue = open.filter((t) => t.due_date !== null && t.due_date < today).sort(compareTasks);
  const dueToday = open.filter((t) => t.due_date === today).sort(compareTasks);
  const doneToday = live(tasks)
    .filter((t) => t.status === 'done' && t.completed_at !== null && toLocalDate(t.completed_at) === today)
    .sort(newestDoneFirst);
  return { overdue, dueToday, doneToday, total: overdue.length + dueToday.length + doneToday.length, done: doneToday.length };
}

export interface DayGroup {
  date: string;
  tasks: Task[];
}

/** Open tasks due after today, grouped by day, for the next `days` days (default two weeks). */
export function upcomingView(tasks: readonly Task[], today: string, days = 14): DayGroup[] {
  const last = addDays(today, days);
  const open = live(tasks)
    .filter((t) => t.status === 'todo' && t.due_date !== null && t.due_date > today && t.due_date <= last)
    .sort(compareTasks);
  const groups = new Map<string, Task[]>();
  for (const t of open) {
    const date = t.due_date as string;
    groups.set(date, [...(groups.get(date) ?? []), t]);
  }
  return [...groups.entries()].map(([date, items]) => ({ date, tasks: items }));
}

export interface ListView {
  open: Task[];
  done: Task[];
}

/** One list's tasks. listId null = the Inbox (tasks with no list, or whose list was deleted). */
export function listView(tasks: readonly Task[], listId: string | null, liveListIds: ReadonlySet<string>): ListView {
  const inList = live(tasks).filter((t) =>
    listId === null ? t.list_id === null || !liveListIds.has(t.list_id) : t.list_id === listId,
  );
  return {
    open: inList.filter((t) => t.status === 'todo').sort(compareTasks),
    done: inList.filter((t) => t.status === 'done').sort(newestDoneFirst).slice(0, 20),
  };
}

export type InkMood = 'happy' | 'coach' | 'cheer' | 'sleepy' | 'worried';

/** Ink's mood and line for the Today progress card. */
export function todayCoach(view: TodayView, justCompleted: boolean): { mood: InkMood; line: string } {
  const left = view.overdue.length + view.dueToday.length;
  if (view.total === 0) return { mood: 'sleepy', line: 'Nothing due today. Enjoy it.' };
  if (left === 0) return { mood: 'cheer', line: 'All done for today. Ink is proud of you.' };
  if (justCompleted) return { mood: 'cheer', line: `Nice. ${left} to go.` };
  if (view.overdue.length > 0) {
    const n = view.overdue.length;
    return { mood: 'worried', line: `${n} overdue. Want to clear ${n === 1 ? 'that one' : 'those'} first?` };
  }
  if (view.done === 0) return { mood: 'coach', line: 'Hardest one first? The rest feels easier after.' };
  return { mood: 'happy', line: `${left} left. Keep it going.` };
}

export const GROUPINGS = ['time', 'urgency', 'list'] as const;
export type Grouping = (typeof GROUPINGS)[number];
export const GROUPING_LABEL: Record<Grouping, string> = { time: 'Time', urgency: 'Urgency', list: 'List' };

export interface TaskGroup {
  key: string;
  title: string;
  tasks: Task[];
}

const URGENCY_TITLES = ['No urgency', 'Low', 'Medium', 'High'];

/**
 * Splits a day's tasks into sections so a long list is easier to scan.
 * time: Morning, Afternoon, Evening, Any time. urgency: High first. list: your lists in order, Inbox last.
 * Empty sections are left out; tasks keep their usual order inside each section.
 */
export function groupTasks(tasks: readonly Task[], by: Grouping, lists: readonly { id: string; name: string }[] = []): TaskGroup[] {
  const sorted = [...tasks].sort(compareTasks);
  const buckets: TaskGroup[] =
    by === 'time'
      ? [
          { key: 'morning', title: 'Morning', tasks: sorted.filter((t) => t.due_time !== null && t.due_time < '12:00') },
          { key: 'afternoon', title: 'Afternoon', tasks: sorted.filter((t) => t.due_time !== null && t.due_time >= '12:00' && t.due_time < '17:00') },
          { key: 'evening', title: 'Evening', tasks: sorted.filter((t) => t.due_time !== null && t.due_time >= '17:00') },
          { key: 'anytime', title: 'Any time', tasks: sorted.filter((t) => t.due_time === null) },
        ]
      : by === 'urgency'
        ? [3, 2, 1, 0].map((p) => ({ key: `u${p}`, title: URGENCY_TITLES[p] as string, tasks: sorted.filter((t) => t.priority === p) }))
        : [
            ...lists.map((l) => ({ key: l.id, title: l.name, tasks: sorted.filter((t) => t.list_id === l.id) })),
            { key: 'inbox', title: 'Inbox', tasks: sorted.filter((t) => t.list_id === null || !lists.some((l) => l.id === t.list_id)) },
          ];
  return buckets.filter((g) => g.tasks.length > 0);
}

/**
 * Finished tasks for the Done tab: newest first, grouped by the day they were completed.
 * Covers the last `days` days and at most `limit` tasks, so it stays quick however long you use the app.
 */
export function doneView(tasks: readonly Task[], today: string, toLocalDate: (iso: string) => string, days = 30, limit = 200): DayGroup[] {
  const oldest = addDays(today, -days);
  const done = live(tasks)
    .filter((t) => t.status === 'done' && t.completed_at !== null && toLocalDate(t.completed_at) >= oldest)
    .sort(newestDoneFirst)
    .slice(0, limit);
  const groups = new Map<string, Task[]>();
  for (const t of done) {
    const date = toLocalDate(t.completed_at as string);
    groups.set(date, [...(groups.get(date) ?? []), t]);
  }
  return [...groups.entries()].map(([date, items]) => ({ date, tasks: items }));
}

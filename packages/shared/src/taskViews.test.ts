import { describe, expect, it } from 'vitest';
import { addDays, dayLabel, timeLabel } from './dates';
import { TaskDraft, type Task } from './tasks';
import { compareTasks, listView, todayCoach, todayView, upcomingView } from './taskViews';

const TODAY = '2026-11-17';
const toLocal = (iso: string) => iso.slice(0, 10);
let n = 0;
function task(p: Partial<Task> = {}): Task {
  n += 1;
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    list_id: null, title: `Task ${n}`, notes: null, due_date: null, due_time: null, remind_at: null,
    priority: 0, status: 'todo', recurrence_rule: null, completed_at: null,
    created_at: `2026-11-10T00:${String(n % 60).padStart(2, '0')}:00Z`, updated_at: '2026-11-10T00:00:00Z', deleted_at: null,
    ...p,
  };
}

describe('dates', () => {
  it('adds days across month and year ends', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('labels days and times', () => {
    expect(dayLabel(TODAY, TODAY)).toBe('Today');
    expect(dayLabel('2026-11-18', TODAY)).toBe('Tomorrow');
    expect(dayLabel('2026-11-16', TODAY)).toBe('Yesterday');
    expect(timeLabel('17:00:00')).toBe('5:00 PM');
    expect(timeLabel('00:30')).toBe('12:30 AM');
    expect(timeLabel('12:05')).toBe('12:05 PM');
  });
});

describe('TaskDraft', () => {
  const base = { title: 'Buy rice', notes: null, due_date: null, due_time: null, priority: 0 as const, list_id: null, remind_at: null, recurrence_rule: null };
  it('rejects an empty title and a time without a date', () => {
    expect(TaskDraft.safeParse({ ...base, title: '   ' }).success).toBe(false);
    expect(TaskDraft.safeParse({ ...base, due_time: '09:00' }).success).toBe(false);
    expect(TaskDraft.safeParse({ ...base, due_date: TODAY, due_time: '09:00' }).success).toBe(true);
  });
});

describe('compareTasks', () => {
  it('sorts by date, then time, then priority, undated last', () => {
    const a = task({ due_date: TODAY, due_time: '10:00' });
    const b = task({ due_date: TODAY, due_time: '09:00' });
    const c = task({ due_date: TODAY, priority: 3 });
    const d = task({ due_date: TODAY, priority: 1 });
    const e = task();
    expect([e, d, c, a, b].sort(compareTasks)).toEqual([b, a, c, d, e]);
  });
});

describe('todayView', () => {
  it('splits overdue, due today and done today, and ignores deleted tasks', () => {
    const late = task({ due_date: '2026-11-15' });
    const due = task({ due_date: TODAY });
    const doneNow = task({ due_date: '2026-11-20', status: 'done', completed_at: `${TODAY}T03:00:00Z` });
    const doneBefore = task({ due_date: '2026-11-16', status: 'done', completed_at: '2026-11-16T03:00:00Z' });
    const gone = task({ due_date: TODAY, deleted_at: '2026-11-16T00:00:00Z' });
    const later = task({ due_date: '2026-11-19' });
    const v = todayView([late, due, doneNow, doneBefore, gone, later], TODAY, toLocal);
    expect(v.overdue).toEqual([late]);
    expect(v.dueToday).toEqual([due]);
    expect(v.doneToday).toEqual([doneNow]);
    expect([v.done, v.total]).toEqual([1, 3]);
  });
});

describe('upcomingView', () => {
  it('groups future open tasks by day within the window', () => {
    const t1 = task({ due_date: '2026-11-18' });
    const t2 = task({ due_date: '2026-11-18', priority: 3 });
    const t3 = task({ due_date: '2026-11-20' });
    const tooFar = task({ due_date: '2026-12-25' });
    const groups = upcomingView([t1, t2, t3, tooFar, task({ due_date: TODAY })], TODAY);
    expect(groups.map((g) => g.date)).toEqual(['2026-11-18', '2026-11-20']);
    expect(groups[0]?.tasks).toEqual([t2, t1]);
  });
});

describe('listView', () => {
  it('puts tasks from deleted lists in the Inbox', () => {
    const liveId = '00000000-0000-4000-8000-0000000000aa';
    const goneId = '00000000-0000-4000-8000-0000000000bb';
    const inLive = task({ list_id: liveId });
    const inGone = task({ list_id: goneId });
    const noList = task();
    const ids = new Set([liveId]);
    expect(listView([inLive, inGone, noList], null, ids).open.map((t) => t.id).sort()).toEqual([inGone.id, noList.id].sort());
    expect(listView([inLive, inGone, noList], liveId, ids).open).toEqual([inLive]);
  });
});

describe('todayCoach', () => {
  const view = (o: number, d: number, done: number) => ({
    overdue: Array.from({ length: o }, () => task()), dueToday: Array.from({ length: d }, () => task()),
    doneToday: Array.from({ length: done }, () => task()), total: o + d + done, done,
  });
  it('picks the right mood', () => {
    expect(todayCoach(view(1, 2, 0), false).mood).toBe('worried');
    expect(todayCoach(view(1, 2, 1), true).mood).toBe('cheer');
    expect(todayCoach(view(0, 0, 0), false).mood).toBe('sleepy');
    expect(todayCoach(view(0, 0, 3), false).mood).toBe('cheer');
    expect(todayCoach(view(0, 2, 0), false).mood).toBe('coach');
    expect(todayCoach(view(0, 2, 1), false).mood).toBe('happy');
  });
});

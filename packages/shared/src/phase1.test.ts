import { describe, expect, it } from 'vitest';
import { fromNow } from './dates';
import { parseQuickAdd } from './quickAdd';
import { completeTask, nextDueDate } from './recurrence';
import { doneView, groupTasks } from './taskViews';
import { defaultReminder, remindAt, reminderDue, reminderOf } from './reminders';
import type { Task } from './tasks';

const NOW = new Date(2026, 10, 17, 8, 0, 0); // Tue 17 Nov 2026, 8:00 local
const base: Task = {
  id: '00000000-0000-4000-8000-000000000001', list_id: null, title: 'Walk Ink', notes: null, due_date: '2026-11-17', due_time: '07:00',
  remind_at: null, priority: 0, status: 'todo', recurrence_rule: null, completed_at: null,
  created_at: '2026-11-10T00:00:00Z', updated_at: '2026-11-10T00:00:00Z', deleted_at: null,
};

describe('parseQuickAdd', () => {
  it('reads date, time and urgency', () => {
    expect(parseQuickAdd('Submit report tomorrow 5pm !high', NOW)).toEqual({ title: 'Submit report', due_date: '2026-11-18', due_time: '17:00', priority: 3, recurrence: null, list_id: null });
  });
  it('reads a weekday without a time, looking forward', () => {
    const r = parseQuickAdd('Call the bank on Friday', NOW);
    expect([r.title, r.due_date, r.due_time]).toEqual(['Call the bank', '2026-11-20', null]);
  });
  it('reads repeats and defaults the first date to today', () => {
    expect(parseQuickAdd('Water plants every week', NOW)).toMatchObject({ title: 'Water plants', due_date: '2026-11-17', recurrence: 'weekly' });
    expect(parseQuickAdd('Gym daily 6am !2', NOW)).toMatchObject({ title: 'Gym', due_time: '06:00', priority: 2, recurrence: 'daily' });
  });
  it('leaves plain titles alone', () => {
    expect(parseQuickAdd('Buy rice', NOW)).toEqual({ title: 'Buy rice', due_date: null, due_time: null, priority: 0, recurrence: null, list_id: null });
    expect(parseQuickAdd('Email prof! about grades', NOW).title).toBe('Email prof! about grades');
  });
  it('keeps the words when the whole text is a date', () => {
    expect(parseQuickAdd('Friday', NOW)).toMatchObject({ title: 'Friday', due_date: '2026-11-20' });
  });
});

describe('recurrence', () => {
  it('steps dates', () => {
    expect(nextDueDate('2026-11-20', 'weekdays')).toBe('2026-11-23'); // Fri -> Mon
    expect(nextDueDate('2026-11-17', 'weekly')).toBe('2026-11-24');
    expect(nextDueDate('2027-01-31', 'monthly')).toBe('2027-02-28');
    expect(nextDueDate('2026-12-15', 'monthly')).toBe('2027-01-15');
  });
  it('completing a repeating task creates the next one after today', () => {
    const overdue = { ...base, due_date: '2026-11-14', recurrence_rule: 'daily', remind_at: new Date(2026, 10, 14, 7, 0).toISOString() };
    const { done, next } = completeTask(overdue, NOW.toISOString(), '2026-11-17', 'new-id');
    expect(done).toMatchObject({ status: 'done', recurrence_rule: null });
    expect(next).toMatchObject({ id: 'new-id', due_date: '2026-11-18', status: 'todo', recurrence_rule: 'daily', completed_at: null });
    expect(next?.remind_at).toBe(new Date(2026, 10, 18, 7, 0).toISOString());
  });
  it('a one-off task creates nothing', () => {
    expect(completeTask(base, NOW.toISOString(), '2026-11-17', 'x').next).toBeNull();
  });
});

describe('reminders', () => {
  it('round-trips the reminder options', () => {
    const at = remindAt('2026-11-17', '17:00', '1h');
    expect(at).toBe(new Date(2026, 10, 17, 16, 0).toISOString());
    expect(reminderOf({ due_date: '2026-11-17', due_time: '17:00', remind_at: at })).toBe('1h');
    expect(remindAt('2026-11-17', null, 'at')).toBe(new Date(2026, 10, 17, 9, 0).toISOString());
    expect(remindAt(null, null, 'at')).toBeNull();
    expect(reminderOf({ due_date: '2026-11-17', due_time: null, remind_at: null })).toBe('none');
  });
});

describe('fromNow', () => {
  it('counts hours and minutes when there is a time', () => {
    expect(fromNow('2026-11-17', '11:00', NOW)).toBe('in 3 hours');
    expect(fromNow('2026-11-17', '08:45', NOW)).toBe('in 45 min');
    expect(fromNow('2026-11-17', '07:00', NOW)).toBe('1 hour ago');
    expect(fromNow('2026-11-17', '08:00', NOW)).toBe('now');
  });
  it('counts days otherwise', () => {
    expect(fromNow('2026-11-18', null, NOW)).toBe('in 1 day');
    expect(fromNow('2026-11-20', '09:30', NOW)).toBe('in 3 days');
    expect(fromNow('2026-11-15', null, NOW)).toBe('2 days ago');
    expect(fromNow('2026-11-17', null, NOW)).toBeNull();
    expect(fromNow(null, null, NOW)).toBeNull();
  });
});

describe('quick add with #list', () => {
  const lists = [{ id: 'L1', name: 'School' }, { id: 'L2', name: 'Side Project' }, { id: 'L3', name: 'Shopping' }];
  it('reads everything and leaves a clean title', () => {
    expect(parseQuickAdd('Submit lab report tomorrow 5pm !high #school', NOW, lists)).toEqual(
      { title: 'Submit lab report', due_date: '2026-11-18', due_time: '17:00', priority: 3, recurrence: null, list_id: 'L1' });
  });
  it('matches names with spaces and unique beginnings, and leaves unknown or unclear tags in the title', () => {
    expect(parseQuickAdd('Fix login #sideproject', NOW, lists)).toMatchObject({ title: 'Fix login', list_id: 'L2' });
    expect(parseQuickAdd('Fix login #side', NOW, lists).list_id).toBe('L2');
    expect(parseQuickAdd('Buy rice #s', NOW, lists)).toMatchObject({ title: 'Buy rice #s', list_id: null });
    expect(parseQuickAdd('Issue #42 follow-up', NOW, lists)).toMatchObject({ title: 'Issue #42 follow-up', list_id: null });
  });
});

describe('groupTasks', () => {
  const t = (p: Partial<Task>): Task => ({ ...base, id: Math.random().toString(), due_time: null, ...p });
  const lists = [{ id: 'L1', name: 'School' }, { id: 'L2', name: 'Work' }];
  const all = [t({ due_time: '18:00', priority: 1, list_id: 'L2' }), t({ due_time: '09:00', priority: 3, list_id: 'L1' }), t({ priority: 3 }), t({ due_time: '13:30', list_id: 'gone' })];
  it('groups by time, urgency and list, skipping empty sections', () => {
    expect(groupTasks(all, 'time').map((g) => [g.title, g.tasks.length])).toEqual([['Morning', 1], ['Afternoon', 1], ['Evening', 1], ['Any time', 1]]);
    expect(groupTasks(all, 'urgency').map((g) => [g.title, g.tasks.length])).toEqual([['High', 2], ['Low', 1], ['No urgency', 1]]);
    expect(groupTasks(all, 'list', lists).map((g) => [g.title, g.tasks.length])).toEqual([['School', 1], ['Work', 1], ['Inbox', 2]]);
  });
});

describe('doneView', () => {
  it('groups finished tasks by completion day, newest first, within the window', () => {
    const d = (completed_at: string, p: Partial<Task> = {}): Task => ({ ...base, id: completed_at, status: 'done', completed_at, ...p });
    const groups = doneView(
      [d('2026-11-17T09:00:00Z'), d('2026-11-17T12:00:00Z'), d('2026-11-15T10:00:00Z'), d('2026-09-01T10:00:00Z'), d('2026-11-16T10:00:00Z', { deleted_at: 'x' }), base],
      '2026-11-17', (iso) => iso.slice(0, 10));
    expect(groups.map((g) => [g.date, g.tasks.map((t) => t.id)])).toEqual([
      ['2026-11-17', ['2026-11-17T12:00:00Z', '2026-11-17T09:00:00Z']],
      ['2026-11-15', ['2026-11-15T10:00:00Z']],
    ]);
  });
});

describe('reminders: heads-up and late saves', () => {
  it('reminds 30 minutes before a timed task by default', () => {
    expect(defaultReminder('16:42')).toBe('30m');
    expect(defaultReminder(null)).toBe('none');
    expect(remindAt('2026-11-19', '16:42', '30m')).toBe(new Date(2026, 10, 19, 16, 12).toISOString());
    expect(reminderOf({ due_date: '2026-11-19', due_time: '16:42', remind_at: new Date(2026, 10, 19, 16, 12).toISOString() })).toBe('30m');
  });

  it('rings at the due time when the heads-up was already past on saving', () => {
    const task = { due_date: '2026-11-19', due_time: '16:42', remind_at: new Date(2026, 10, 19, 16, 12).toISOString(), updated_at: new Date(2026, 10, 19, 16, 30).toISOString() };
    expect(reminderDue(task, new Date(2026, 10, 19, 16, 31))?.getTime()).toBe(new Date(2026, 10, 19, 16, 42).getTime());
    expect(reminderDue(task, new Date(2026, 10, 19, 16, 43))).toBeNull();
  });

  it('rings at the reminder when it is still ahead, and not again once it has rung', () => {
    const task = { due_date: '2026-11-19', due_time: '16:42', remind_at: new Date(2026, 10, 19, 16, 12).toISOString(), updated_at: new Date(2026, 10, 19, 9, 0).toISOString() };
    expect(reminderDue(task, new Date(2026, 10, 19, 10, 0))?.getTime()).toBe(new Date(2026, 10, 19, 16, 12).getTime());
    expect(reminderDue(task, new Date(2026, 10, 19, 16, 20))).toBeNull();
  });
});

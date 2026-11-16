import { z } from 'zod';

export const LIST_COLORS = ['inkBlue', 'tongue', 'amber', 'red', 'muted'] as const;
export type ListColor = (typeof LIST_COLORS)[number];

export const List = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(40),
  color: z.enum(LIST_COLORS),
  sort_order: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});
export type List = z.infer<typeof List>;

/** 0 none, 1 low, 2 medium, 3 high */
export const PRIORITIES = [0, 1, 2, 3] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { 0: 'None', 1: 'Low', 2: 'Medium', 3: 'High' };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clockTime = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);

export const Task = z.object({
  id: z.uuid(),
  list_id: z.uuid().nullable(),
  title: z.string().trim().min(1).max(200),
  notes: z.string().max(2000).nullable(),
  due_date: isoDate.nullable(),
  due_time: clockTime.nullable(),
  remind_at: z.string().nullable(),
  priority: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  status: z.enum(['todo', 'done']),
  recurrence_rule: z.string().nullable(),
  completed_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});
export type Task = z.infer<typeof Task>;

/** What the add/edit form produces. */
export const TaskDraft = Task.pick({
  title: true, notes: true, due_date: true, due_time: true, priority: true, list_id: true, remind_at: true, recurrence_rule: true,
}).refine(
  (d) => d.due_time === null || d.due_date !== null,
  { message: 'Pick a date before a time', path: ['due_time'] },
);
export type TaskDraft = z.infer<typeof TaskDraft>;

export const LISTS_TABLE = 'lists';
export const TASKS_TABLE = 'tasks';
export const LIST_COLUMNS = 'id, name, color, sort_order, created_at, updated_at, deleted_at';
export const TASK_COLUMNS =
  'id, list_id, title, notes, due_date, due_time, remind_at, priority, status, recurrence_rule, completed_at, created_at, updated_at, deleted_at';

/**
 * Workouts and Tasks. Each planned workout day shows up as a task in a Workouts list. Ticking the task marks
 * the workout done in Health, even with no sets logged; finishing in Health ticks the task. Unticking clears
 * only the done mark (logged sets stay). Moving the task to another day moves the workout. Rest days never
 * become tasks.
 *
 * Ids are derived, so the phone and the web make the same rows and a deleted one stays deleted:
 *   workout  = from the routine, the routine's last edit and the planned day
 *   its task = from the workout
 *   the Workouts list = from your user id
 * Editing a routine's days or exercises gives its coming workouts new ids, and the old, untouched ones are
 * cleared away, so the plan always follows the routine.
 */
import { addDays } from './dates';
import { stableUuid } from './links';
import { remindAt } from './reminders';
import type { List, Task } from './tasks';
import { planOf, weekdayOf, weekdaysOf, type Routine, type WorkoutSession, type WorkoutSet } from './workouts';

/** How many days ahead planned workouts (and their tasks) are made, today included. */
export const PLAN_DAYS = 7;

export const workoutSessionId = (routine: Pick<Routine, 'id' | 'updated_at'>, day: string): string => stableUuid(`dirary-workout:${routine.id}:${routine.updated_at}:${day}`);
export const workoutTaskId = (sessionId: string): string => stableUuid(`dirary-workout-task:${sessionId}`);
export const workoutsListId = (userId: string): string => stableUuid(`dirary-workouts-list:${userId}`);

export interface WorkoutTaskPlan {
  list: List | null;
  createSessions: WorkoutSession[];
  createTasks: Task[];
  /** Workouts and tasks to change: done marks, days and names kept in step. */
  updateSessions: { session: WorkoutSession; change: Partial<WorkoutSession> }[];
  updateTasks: { task: Task; change: Partial<Task> }[];
  /** Planned workouts the routine no longer plans (or a deleted routine's), untouched, with their tasks. */
  removeSessions: WorkoutSession[];
  removeTasks: Task[];
}

const live = <T extends { deleted_at: string | null }>(rows: readonly T[]) => rows.filter((r) => r.deleted_at === null);

export function planWorkoutTasks(input: {
  userId: string;
  routines: readonly Routine[];
  sessions: readonly WorkoutSession[];
  sets: readonly WorkoutSet[];
  tasks: readonly Task[];
  lists: readonly List[];
  /** Every task, workout and list id this device has seen, deleted ones included. */
  knownIds: ReadonlySet<string>;
  today: string;
  nowIso: string;
}): WorkoutTaskPlan {
  const { userId, sets, today, nowIso, knownIds } = input;
  const routines = live(input.routines);
  const sessions = live(input.sessions);
  const tasks = new Map(live(input.tasks).map((t) => [t.id, t]));
  const routineById = new Map(routines.map((r) => [r.id, r]));
  const started = new Set(live(sets).map((s) => s.session_id));
  const plan: WorkoutTaskPlan = { list: null, createSessions: [], createTasks: [], updateSessions: [], updateTasks: [], removeSessions: [], removeTasks: [] };

  // The Workouts list: yours if one exists by that name, else made once.
  const listId = workoutsListId(userId);
  const named = live(input.lists).filter((l) => l.name.trim().toLowerCase() === 'workouts').sort((a, b) => (a.created_at < b.created_at ? -1 : 1))[0];
  let workoutsList: string | null = named?.id ?? (live(input.lists).some((l) => l.id === listId) ? listId : null);
  const ensureList = () => {
    if (workoutsList || knownIds.has(listId)) return workoutsList;
    plan.list = { id: listId, name: 'Workouts', color: 'tongue', sort_order: 100, created_at: nowIso, updated_at: nowIso, deleted_at: null };
    workoutsList = listId;
    return workoutsList;
  };

  // 1. Clear planned workouts the routine no longer plans, if nothing was done in them yet.
  const removed = new Set<string>();
  for (const s of sessions) {
    if (!s.routine_id || !s.planned_for || s.done_at || s.started_at || started.has(s.id) || s.planned_for < today) continue;
    const routine = routineById.get(s.routine_id);
    const stillPlanned = routine && planOf(routine).length > 0 && weekdaysOf(routine).includes(weekdayOf(s.planned_for)) && workoutSessionId(routine, s.planned_for) === s.id;
    if (stillPlanned) continue;
    removed.add(s.id);
    plan.removeSessions.push(s);
    const task = tasks.get(workoutTaskId(s.id));
    if (task && task.status === 'todo') plan.removeTasks.push(task);
  }

  // 2. Make the coming week's planned workouts.
  const all = [...sessions.filter((s) => !removed.has(s.id))];
  for (const routine of routines) {
    if (planOf(routine).length === 0) continue;
    const days = weekdaysOf(routine);
    for (let i = 0; i < PLAN_DAYS; i++) {
      const day = addDays(today, i);
      if (!days.includes(weekdayOf(day))) continue;
      const id = workoutSessionId(routine, day);
      // Skip a day already covered: the same workout, or one from an earlier version of the routine you started.
      if (knownIds.has(id) || all.some((s) => s.id === id || (s.routine_id === routine.id && s.planned_for === day))) continue;
      const session: WorkoutSession = { id, routine_id: routine.id, name: routine.name, planned_for: day, planned_date: day, started_at: null, done_at: null, created_at: nowIso, updated_at: nowIso, deleted_at: null };
      plan.createSessions.push(session);
      all.push(session);
    }
  }

  // 3. Each planned workout from today on has its task; done marks, days and names stay in step.
  for (const s of all) {
    if (!s.routine_id || !s.planned_for) continue;
    const taskId = workoutTaskId(s.id);
    const task = tasks.get(taskId);
    if (!task) {
      if (knownIds.has(taskId) || s.planned_date < today) continue;
      plan.createTasks.push({
        id: taskId, list_id: ensureList(), title: s.name, notes: null, due_date: s.planned_date, due_time: null, remind_at: remindAt(s.planned_date, null, 'at'),
        priority: 2, status: s.done_at ? 'done' : 'todo', recurrence_rule: null, completed_at: s.done_at, created_at: nowIso, updated_at: nowIso, deleted_at: null,
      });
      continue;
    }
    const taskChange: Partial<Task> = {};
    const sessionChange: Partial<WorkoutSession> = {};
    if (s.done_at && task.status !== 'done') Object.assign(taskChange, { status: 'done', completed_at: s.done_at });
    if (!s.done_at && task.status === 'done') Object.assign(taskChange, { status: 'todo', completed_at: null });
    if (task.status === 'todo' && !s.done_at && task.title !== s.name) taskChange.title = s.name;
    // Moving the task moves the workout.
    if (task.due_date && task.due_date !== s.planned_date) sessionChange.planned_date = task.due_date;
    if (Object.keys(taskChange).length) plan.updateTasks.push({ task, change: { ...taskChange, updated_at: nowIso } });
    if (Object.keys(sessionChange).length) plan.updateSessions.push({ session: s, change: { ...sessionChange, updated_at: nowIso } });
  }
  return plan;
}

/** The workout a task stands for, or null for an ordinary task. */
export function workoutOf(task: Pick<Task, 'id'>, sessions: readonly WorkoutSession[]): WorkoutSession | null {
  return live(sessions).find((s) => s.routine_id && workoutTaskId(s.id) === task.id) ?? null;
}

/** Ticking a workout's task marks the workout done (or not), keeping its sets. */
export function sessionDoneChange(session: WorkoutSession, done: boolean, nowIso: string): Partial<WorkoutSession> {
  return done ? { done_at: session.done_at ?? nowIso, updated_at: nowIso } : { done_at: null, updated_at: nowIso };
}

/** Planned workouts as tasks on the phone, kept in step in the local database (rules in packages/shared/src/workoutLinks.ts). */
import { LISTS_TABLE, TASKS_TABLE, WORKOUT_SESSIONS_TABLE, addDays, localDate, planWorkoutTasks, reopenTask, sessionDoneChange, workoutOf, type Task } from '@dirary/shared';

import { readAllIds, readAllTaskIds, readLists, readRoutines, readTasks, readWorkoutSessions, readWorkoutSets, saveLocal } from './db';
import { supabase } from './supabase';

async function userId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

/** Makes the coming week's planned workouts and their tasks, and keeps done marks and days in step. Returns rows changed. */
export async function reconcileWorkoutTasks(): Promise<number> {
  const routines = await readRoutines();
  const user = await userId();
  if (!user) return 0;
  const since = addDays(localDate(), -14);
  const [sessions, sets, tasks, lists, taskIds, sessionIds, listIds] = await Promise.all([
    readWorkoutSessions(since), readWorkoutSets(`${since}T00:00:00Z`), readTasks(), readLists(), readAllTaskIds(), readAllIds('workout_sessions'), readAllIds('lists'),
  ]);
  if (routines.length === 0 && !sessions.some((s) => s.routine_id)) return 0;
  const knownIds = new Set([...taskIds, ...sessionIds, ...listIds]);
  const plan = planWorkoutTasks({ userId: user, routines, sessions, sets, tasks, lists, knownIds, today: localDate(), nowIso: new Date().toISOString() });
  const stamp = new Date().toISOString();
  if (plan.list) await saveLocal(LISTS_TABLE, plan.list);
  for (const s of plan.createSessions) await saveLocal(WORKOUT_SESSIONS_TABLE, s);
  for (const t of plan.createTasks) await saveLocal(TASKS_TABLE, t);
  for (const { task, change } of plan.updateTasks) await saveLocal(TASKS_TABLE, { ...task, ...change });
  for (const { session, change } of plan.updateSessions) await saveLocal(WORKOUT_SESSIONS_TABLE, { ...session, ...change });
  for (const s of plan.removeSessions) await saveLocal(WORKOUT_SESSIONS_TABLE, { ...s, deleted_at: stamp, updated_at: stamp });
  for (const t of plan.removeTasks) await saveLocal(TASKS_TABLE, { ...t, deleted_at: stamp, updated_at: stamp });
  return (plan.list ? 1 : 0) + plan.createSessions.length + plan.createTasks.length + plan.updateTasks.length + plan.updateSessions.length + plan.removeSessions.length + plan.removeTasks.length;
}

/** If the task is a planned workout's, ticks or unticks the workout too (its sets stay) and returns true. */
export async function toggleWorkoutTask(task: Task): Promise<boolean> {
  const session = workoutOf(task, await readWorkoutSessions(addDays(localDate(), -60)));
  if (!session) return false;
  const stamp = new Date().toISOString();
  const done = task.status !== 'done';
  await saveLocal(WORKOUT_SESSIONS_TABLE, { ...session, ...sessionDoneChange(session, done, stamp) });
  await saveLocal(TASKS_TABLE, { ...task, ...(done ? { status: 'done' as const, completed_at: stamp } : reopenTask(stamp)), updated_at: stamp });
  return true;
}

import { useEffect, useRef } from 'react';
import { localDate, planWorkoutTasks, reopenTask, sessionDoneChange, workoutOf, workoutTaskId, type Task, type WorkoutSession } from '@dirary/shared';
import type { WorkoutsStore } from '../health/useWorkouts';
import type { TasksStore } from '../tasks/useTasks';
import { useSession } from '../useSession';

/**
 * Keeps planned workouts and their tasks in step while a screen that shows either is open (rules in
 * packages/shared/src/workoutLinks.ts). Returns `toggle` for ticking a workout's task, and `finish` for the
 * Finish button in Health, so each ticks both.
 */
export function useWorkoutTasks(tasks: TasksStore, workouts: WorkoutsStore) {
  const userId = useSession()?.user.id ?? null;
  const asked = useRef(new Set<string>());
  const ready = !!userId && !tasks.loading && !workouts.loading && !tasks.error && !workouts.error;

  useEffect(() => {
    if (!ready || !userId) return;
    const plan = planWorkoutTasks({
      userId, routines: workouts.routines, sessions: workouts.sessions, sets: workouts.sets, tasks: tasks.tasks, lists: tasks.lists,
      knownIds: asked.current, today: localDate(), nowIso: new Date().toISOString(),
    });
    // Ask the database about each derived row once; after that only real changes come through.
    if (plan.list) { asked.current.add(plan.list.id); tasks.addListIfNew(plan.list); }
    if (plan.createSessions.length) { for (const s of plan.createSessions) asked.current.add(s.id); workouts.addSessionsIfNew(plan.createSessions); }
    if (plan.createTasks.length) { for (const t of plan.createTasks) asked.current.add(t.id); tasks.addBillTasks(plan.createTasks); }
    for (const { task, change } of plan.updateTasks) tasks.updateTask(task.id, change);
    for (const { session, change } of plan.updateSessions) workouts.updateSession(session.id, change);
    if (plan.removeSessions.length) workouts.removeSessions(plan.removeSessions.map((s) => s.id));
    for (const t of plan.removeTasks) tasks.removeTask(t.id);
  }, [ready, userId, workouts.routines, workouts.sessions, workouts.sets, tasks.tasks, tasks.lists]); // eslint-disable-line react-hooks/exhaustive-deps

  /** If the task is a workout's, ticks or unticks both and returns true. */
  const toggle = (task: Task): boolean => {
    const session = workoutOf(task, workouts.sessions);
    if (!session) return false;
    const done = task.status !== 'done';
    const stamp = new Date().toISOString();
    workouts.updateSession(session.id, sessionDoneChange(session, done, stamp));
    tasks.updateTask(task.id, done ? { status: 'done', completed_at: stamp } : reopenTask(stamp));
    return true;
  };

  /** The Finish button: the workout is done, and so is its task. */
  const finish = (session: WorkoutSession) => {
    const stamp = new Date().toISOString();
    workouts.updateSession(session.id, sessionDoneChange(session, true, stamp));
    const task = tasks.tasks.find((t) => t.id === workoutTaskId(session.id));
    if (task && task.status !== 'done') tasks.updateTask(task.id, { status: 'done', completed_at: stamp });
  };

  return { toggle, finish };
}

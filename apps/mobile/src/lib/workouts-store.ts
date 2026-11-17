/** Workouts on the phone: read from the local database, change, and sync. Rules live in packages/shared/src/workouts.ts. */
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import {
  BODY_METRICS_TABLE, EXERCISES_TABLE, ROUTINES_TABLE, TASKS_TABLE, WORKOUT_SESSIONS_TABLE, WORKOUT_SETS_TABLE, addDays, localDate, planText, sessionDoneChange,
  weekdayOf, weekdaysOf, workoutSessionId, workoutTaskId,
  type BodyMetric, type Exercise, type PlanItem, type Routine, type StarterExercise, type WorkoutSession, type WorkoutSet,
} from '@dirary/shared';

import { readBodyMetrics, readExercises, readRoutines, readTasks, readWorkoutSessions, readWorkoutSets, saveLocal } from './db';
import { supabase } from './supabase';
import { subscribeStore, syncTasks } from './tasks-store';
import { refreshWidgets } from '../widgets/refresh';

const now = () => new Date().toISOString();
const listeners = new Set<() => void>();
/** How far back workouts are read: enough for "last time" and the progress charts. */
const DAYS_LOADED = 180;

async function changed() {
  for (const listener of listeners) listener();
  refreshWidgets().catch(() => {});
  syncTasks(); // one sync covers every table, and keeps workouts and their tasks in step
}

/** One of your exercises: a starter copied in (once), or a new one. */
export async function addExercise(name: string, muscle_group: string | null, starter: StarterExercise | null = null): Promise<Exercise> {
  if (starter) {
    const had = (await readExercises()).find((e) => e.starter_key === starter.key);
    if (had) return had;
  }
  const stamp = now();
  const row: Exercise = { id: Crypto.randomUUID(), name: name.trim().slice(0, 60), muscle_group, starter_key: starter?.key ?? null, created_at: stamp, updated_at: stamp, deleted_at: null };
  await saveLocal(EXERCISES_TABLE, row);
  await changed();
  return row;
}

export interface RoutineDraft { name: string; plan: PlanItem[]; weekdays: string }

/** Saving bumps the routine's version, so its coming workouts are planned again from the new days and exercises. */
export async function saveRoutine(draft: RoutineDraft, existing: Routine | null, count: number): Promise<void> {
  const stamp = now();
  const row: Routine = existing
    ? { ...existing, name: draft.name, plan: planText(draft.plan), weekdays: draft.weekdays, updated_at: stamp }
    : { id: Crypto.randomUUID(), name: draft.name, plan: planText(draft.plan), weekdays: draft.weekdays, sort_order: count, created_at: stamp, updated_at: stamp, deleted_at: null };
  await saveLocal(ROUTINES_TABLE, row);
  await changed();
}

export async function removeRoutine(routine: Routine): Promise<void> {
  await saveLocal(ROUTINES_TABLE, { ...routine, deleted_at: now(), updated_at: now() });
  await changed();
}

/** Starts today's workout: the planned one if this routine is planned today (the same row its task points at), else a new one. */
export async function startWorkout(routine: Routine | null, existing: WorkoutSession | null): Promise<WorkoutSession> {
  const stamp = now();
  if (existing) {
    const row = existing.started_at ? existing : { ...existing, started_at: stamp, updated_at: stamp };
    if (row !== existing) { await saveLocal(WORKOUT_SESSIONS_TABLE, row); await changed(); }
    return row;
  }
  const today = localDate();
  const planned = !!routine && weekdaysOf(routine).includes(weekdayOf(today));
  const id = planned ? workoutSessionId(routine!, today) : Crypto.randomUUID();
  const had = (await readWorkoutSessions(today)).find((s) => s.id === id);
  const row: WorkoutSession = had
    ? { ...had, started_at: had.started_at ?? stamp, updated_at: stamp }
    : { id, routine_id: routine?.id ?? null, name: routine?.name ?? 'Workout', planned_for: planned ? today : null, planned_date: today, started_at: stamp, done_at: null, created_at: stamp, updated_at: stamp, deleted_at: null };
  await saveLocal(WORKOUT_SESSIONS_TABLE, row);
  await changed();
  return row;
}

export async function logSet(session: WorkoutSession, exerciseId: string, setIndex: number, weight_kg: number, reps: number): Promise<void> {
  const stamp = now();
  await saveLocal(WORKOUT_SETS_TABLE, { id: Crypto.randomUUID(), session_id: session.id, exercise_id: exerciseId, set_index: setIndex, weight_kg, reps, performed_at: stamp, created_at: stamp, updated_at: stamp, deleted_at: null });
  if (!session.started_at) await saveLocal(WORKOUT_SESSIONS_TABLE, { ...session, started_at: stamp, updated_at: stamp });
  await changed();
}

export async function unlogSet(set: WorkoutSet): Promise<void> {
  await saveLocal(WORKOUT_SETS_TABLE, { ...set, deleted_at: now(), updated_at: now() });
  await changed();
}

/** The Finish button: the workout is done, and so is its task. */
export async function finishWorkout(session: WorkoutSession): Promise<void> {
  const stamp = now();
  await saveLocal(WORKOUT_SESSIONS_TABLE, { ...session, ...sessionDoneChange(session, true, stamp) });
  const task = (await readTasks()).find((t) => t.id === workoutTaskId(session.id));
  if (task && task.status !== 'done') await saveLocal(TASKS_TABLE, { ...task, status: 'done', completed_at: stamp, updated_at: stamp });
  await changed();
}

export async function logWeight(kg: number): Promise<void> {
  const stamp = now();
  await saveLocal(BODY_METRICS_TABLE, { id: Crypto.randomUUID(), weight_kg: kg, measured_on: localDate(), created_at: stamp, updated_at: stamp, deleted_at: null });
  await changed();
}

/** Live exercises, routines, workouts, sets and body weight for the Workouts tab. */
export function useWorkoutsStore() {
  const [state, setState] = useState<{ exercises: Exercise[]; routines: Routine[]; sessions: WorkoutSession[]; sets: WorkoutSet[]; metrics: BodyMetric[]; loading: boolean }>(
    { exercises: [], routines: [], sessions: [], sets: [], metrics: [], loading: true },
  );

  const load = useCallback(async () => {
    const since = addDays(localDate(), -DAYS_LOADED);
    const [exercises, routines, sessions, sets, metrics] = await Promise.all([
      readExercises(), readRoutines(), readWorkoutSessions(since), readWorkoutSets(`${since}T00:00:00Z`), readBodyMetrics(),
    ]);
    setState({ exercises, routines, sessions, sets, metrics, loading: false });
  }, []);

  useEffect(() => {
    listeners.add(load);
    const unsubscribe = subscribeStore(load);
    load();
    const client = supabase;
    let channel = client?.channel('workouts_phone');
    if (channel) {
      for (const table of [EXERCISES_TABLE, ROUTINES_TABLE, WORKOUT_SESSIONS_TABLE, WORKOUT_SETS_TABLE, BODY_METRICS_TABLE]) channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => { syncTasks(); });
      channel.subscribe();
    }
    return () => {
      listeners.delete(load);
      unsubscribe();
      if (client && channel) client.removeChannel(channel);
    };
  }, [load]);

  return state;
}

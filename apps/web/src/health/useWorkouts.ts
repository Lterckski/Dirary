import { useCallback, useEffect, useState } from 'react';
import {
  BODY_METRICS_TABLE, BODY_METRIC_COLUMNS, EXERCISES_TABLE, EXERCISE_COLUMNS, ROUTINES_TABLE, ROUTINE_COLUMNS, WORKOUT_SESSIONS_TABLE, WORKOUT_SESSION_COLUMNS,
  WORKOUT_SETS_TABLE, WORKOUT_SET_COLUMNS, BodyMetric, Exercise, Routine, WorkoutSession, WorkoutSet, addDays, localDate, planText, weekdaysOf, weekdayOf,
  programWorkout, workoutSessionId, type PlanItem, type ProgramPlace, type StarterExercise,
} from '@dirary/shared';
import { supabase } from '../supabase';

const now = () => new Date().toISOString();
type Result = PromiseLike<{ error: { message: string } | null }>;
/** How far back workouts are loaded: enough for "last time" and the progress charts. */
const DAYS_LOADED = 180;

export interface RoutineDraft { name: string; plan: PlanItem[]; weekdays: string }

/** Exercises, routines, workouts, sets and body weight, kept live, with the changes the Workouts tab can make. */
export function useWorkouts() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [sets, setSets] = useState<WorkoutSet[]>([]);
  const [metrics, setMetrics] = useState<BodyMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const since = addDays(localDate(), -DAYS_LOADED);
    const [e, r, s, w, b] = await Promise.all([
      supabase.from(EXERCISES_TABLE).select(EXERCISE_COLUMNS).is('deleted_at', null).order('name'),
      supabase.from(ROUTINES_TABLE).select(ROUTINE_COLUMNS).is('deleted_at', null).order('sort_order'),
      supabase.from(WORKOUT_SESSIONS_TABLE).select(WORKOUT_SESSION_COLUMNS).is('deleted_at', null).gte('planned_date', since).order('planned_date').limit(2000),
      supabase.from(WORKOUT_SETS_TABLE).select(WORKOUT_SET_COLUMNS).is('deleted_at', null).gte('performed_at', `${since}T00:00:00Z`).order('performed_at').limit(10000),
      supabase.from(BODY_METRICS_TABLE).select(BODY_METRIC_COLUMNS).is('deleted_at', null).order('measured_on').limit(2000),
    ]);
    const failure = e.error ?? r.error ?? s.error ?? w.error ?? b.error;
    if (failure) setError(friendly(failure.message));
    else {
      setExercises((e.data ?? []).map((x) => Exercise.parse(x)));
      setRoutines((r.data ?? []).map((x) => Routine.parse(x)));
      setSessions((s.data ?? []).map((x) => WorkoutSession.parse(x)));
      setSets((w.data ?? []).map((x) => WorkoutSet.parse(x)));
      setMetrics((b.data ?? []).map((x) => BodyMetric.parse(x)));
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    if (!supabase) return;
    const client = supabase;
    let channel = client.channel('workouts_web');
    for (const table of [EXERCISES_TABLE, ROUTINES_TABLE, WORKOUT_SESSIONS_TABLE, WORKOUT_SETS_TABLE, BODY_METRICS_TABLE]) {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, load);
    }
    channel.subscribe();
    return () => { client.removeChannel(channel); };
  }, [load]);

  const save = useCallback(async (apply: () => void, write: () => Result) => {
    apply();
    const { error } = await write();
    if (error) {
      setError(friendly(error.message));
      load();
    } else setError(null);
  }, [load]);

  /** One of your exercises: new, or a starter copied in. Returns it. */
  const addExercise = useCallback((name: string, muscle_group: string | null, starter: StarterExercise | null = null): Exercise => {
    const existing = starter && exercises.find((e) => e.starter_key === starter.key);
    if (existing) return existing;
    const stamp = now();
    const row: Exercise = { id: crypto.randomUUID(), name: name.trim().slice(0, 60), muscle_group, starter_key: starter?.key ?? null, created_at: stamp, updated_at: stamp, deleted_at: null };
    save(() => setExercises((all) => [...all, row]), () => supabase!.from(EXERCISES_TABLE).insert(row));
    return row;
  }, [exercises, save]);

  /** Saving a routine also bumps its version, so its coming workouts are re-planned from the new days and exercises. */
  const saveRoutine = useCallback((draft: RoutineDraft, existing: Routine | null) => {
    const stamp = now();
    if (existing) {
      const change = { name: draft.name, plan: planText(draft.plan), weekdays: draft.weekdays, updated_at: stamp };
      return save(() => setRoutines((all) => all.map((r) => (r.id === existing.id ? { ...r, ...change } : r))), () => supabase!.from(ROUTINES_TABLE).update(change).eq('id', existing.id));
    }
    const row: Routine = { id: crypto.randomUUID(), name: draft.name, plan: planText(draft.plan), weekdays: draft.weekdays, sort_order: routines.length, created_at: stamp, updated_at: stamp, deleted_at: null };
    return save(() => setRoutines((all) => [...all, row]), () => supabase!.from(ROUTINES_TABLE).insert(row));
  }, [routines.length, save]);

  const removeRoutine = useCallback((id: string) => {
    const change = { deleted_at: now(), updated_at: now() };
    return save(() => setRoutines((all) => all.filter((r) => r.id !== id)), () => supabase!.from(ROUTINES_TABLE).update(change).eq('id', id));
  }, [save]);

  /** Planned workouts made by planWorkoutTasks; one already in the database (or deleted) is skipped. */
  const addSessionsIfNew = useCallback(async (rows: WorkoutSession[]) => {
    if (!supabase || rows.length === 0) return;
    const { data, error: lookup } = await supabase.from(WORKOUT_SESSIONS_TABLE).select('id').in('id', rows.map((r) => r.id));
    if (lookup) return;
    const seen = new Set((data ?? []).map((r) => (r as { id: string }).id));
    const missing = rows.filter((r) => !seen.has(r.id));
    if (missing.length === 0) return;
    await save(() => setSessions((all) => [...all, ...missing.filter((m) => !all.some((s) => s.id === m.id))]),
      () => supabase!.from(WORKOUT_SESSIONS_TABLE).upsert(missing, { onConflict: 'id', ignoreDuplicates: true }));
  }, [save]);

  const updateSession = useCallback((id: string, change: Partial<WorkoutSession>) => {
    const patch = { ...change, updated_at: change.updated_at ?? now() };
    return save(() => setSessions((all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s))), () => supabase!.from(WORKOUT_SESSIONS_TABLE).update(patch).eq('id', id));
  }, [save]);

  const removeSessions = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const change = { deleted_at: now(), updated_at: now() };
    return save(() => setSessions((all) => all.filter((s) => !ids.includes(s.id))), () => supabase!.from(WORKOUT_SESSIONS_TABLE).update(change).in('id', ids));
  }, [save]);

  /**
   * Starts today's workout. A routine planned for today uses its planned workout (the same row the Tasks link
   * made, or makes it); otherwise a new one. Returns the workout.
   */
  const startWorkout = useCallback((routine: Routine | null, existing: WorkoutSession | null): WorkoutSession => {
    const stamp = now();
    if (existing) {
      if (!existing.started_at) updateSession(existing.id, { started_at: stamp });
      return { ...existing, started_at: existing.started_at ?? stamp };
    }
    const today = localDate();
    const planned = routine && weekdaysOf(routine).includes(weekdayOf(today));
    const row: WorkoutSession = {
      id: planned ? workoutSessionId(routine, today) : crypto.randomUUID(), routine_id: routine?.id ?? null, name: routine?.name ?? 'Workout',
      planned_for: planned ? today : null, planned_date: today, started_at: stamp, done_at: null, created_at: stamp, updated_at: stamp, deleted_at: null,
    };
    save(() => setSessions((all) => [...all.filter((s) => s.id !== row.id), row]), () => supabase!.from(WORKOUT_SESSIONS_TABLE).upsert(row));
    return row;
  }, [save, updateSession]);

  /**
   * Starts (or continues) one lifting day of My program as today's workout. Its exercises and hidden routine have
   * fixed ids (the same as on the phone), so they're made once and reused every week; the routine is refreshed if
   * the program text changed. Waits for those rows before starting, since the workout and its sets point at them.
   */
  const startProgramDay = useCallback(async (place: ProgramPlace, day: number): Promise<WorkoutSession | null> => {
    const w = programWorkout(place, day);
    if (!w || !supabase) return null;
    const stamp = now();
    const newExercises: Exercise[] = w.exercises.filter((e) => !exercises.some((x) => x.id === e.id))
      .map((e) => ({ id: e.id, name: e.name, muscle_group: null, starter_key: null, created_at: stamp, updated_at: stamp, deleted_at: null }));
    if (newExercises.length) {
      setExercises((all) => [...all, ...newExercises.filter((n) => !all.some((x) => x.id === n.id))]);
      const { error: failed } = await supabase.from(EXERCISES_TABLE).upsert(newExercises, { onConflict: 'id', ignoreDuplicates: true });
      if (failed) { setError(friendly(failed.message)); return null; }
    }
    const plan = planText(w.plan);
    const had = routines.find((r) => r.id === w.routineId);
    let routine: Routine = had ?? { id: w.routineId, name: w.name, plan, weekdays: '', sort_order: 1000 + day + (place === 'home' ? 10 : 0), created_at: stamp, updated_at: stamp, deleted_at: null };
    if (!had || had.plan !== plan || had.name !== w.name || had.weekdays !== '') {
      routine = { ...routine, name: w.name, plan, weekdays: '', updated_at: stamp };
      const row = routine;
      setRoutines((all) => [...all.filter((r) => r.id !== row.id), row]);
      const { error: failed } = await supabase.from(ROUTINES_TABLE).upsert(row);
      if (failed) { setError(friendly(failed.message)); return null; }
    }
    const today = localDate();
    const existing = sessions.filter((s) => s.routine_id === routine.id && s.planned_date === today).sort((a, b) => Number(!!a.done_at) - Number(!!b.done_at))[0] ?? null;
    return startWorkout(routine, existing);
  }, [exercises, routines, sessions, startWorkout]);

  const logSet = useCallback((session: WorkoutSession, exerciseId: string, setIndex: number, weight_kg: number, reps: number) => {
    const stamp = now();
    const row: WorkoutSet = { id: crypto.randomUUID(), session_id: session.id, exercise_id: exerciseId, set_index: setIndex, weight_kg, reps, performed_at: stamp, created_at: stamp, updated_at: stamp, deleted_at: null };
    return save(() => setSets((all) => [...all, row]), () => supabase!.from(WORKOUT_SETS_TABLE).insert(row));
  }, [save]);

  const unlogSet = useCallback((id: string) => {
    const change = { deleted_at: now(), updated_at: now() };
    return save(() => setSets((all) => all.filter((s) => s.id !== id)), () => supabase!.from(WORKOUT_SETS_TABLE).update(change).eq('id', id));
  }, [save]);

  const logWeight = useCallback((kg: number) => {
    const stamp = now();
    const row: BodyMetric = { id: crypto.randomUUID(), weight_kg: kg, measured_on: localDate(), created_at: stamp, updated_at: stamp, deleted_at: null };
    return save(() => setMetrics((all) => [...all, row]), () => supabase!.from(BODY_METRICS_TABLE).insert(row));
  }, [save]);

  return { exercises, routines, sessions, sets, metrics, loading, error, addExercise, saveRoutine, removeRoutine, addSessionsIfNew, updateSession, removeSessions, startWorkout, startProgramDay, logSet, unlogSet, logWeight };
}

export type WorkoutsStore = ReturnType<typeof useWorkouts>;

function friendly(message: string): string {
  if (/relation .* does not exist|schema cache/i.test(message)) return "The workout tables aren't in Supabase yet. Run the Phase 3b SQL file (20261122000000_phase3b_workouts.sql), then reload.";
  if (/failed to fetch|network/i.test(message)) return "Couldn't reach the server. Check your connection and try again.";
  return message;
}

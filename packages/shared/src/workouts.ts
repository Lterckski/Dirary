/** Workouts: exercises, routines, sessions, sets and body weight. Shared by the web and the phone. */
import { z } from 'zod';
import { addDays } from './dates';
import type { InkMood } from './taskViews';

const stamps = { created_at: z.string(), updated_at: z.string(), deleted_at: z.string().nullable() };
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const num = z.coerce.number();

export const Exercise = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(60),
  muscle_group: z.string().max(30).nullable(),
  starter_key: z.string().max(60).nullable(),
  ...stamps,
});
export type Exercise = z.infer<typeof Exercise>;

export const Routine = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(40),
  /** JSON array of PlanItem, stored as text so it syncs like any other column. Read it with planOf. */
  plan: z.string(),
  /** Planned weekdays as digits, 0 = Sunday: "135" is Mon, Wed, Fri. */
  weekdays: z.string().regex(/^[0-6]{0,7}$/),
  sort_order: z.coerce.number().int(),
  ...stamps,
});
export type Routine = z.infer<typeof Routine>;

export const WorkoutSession = z.object({
  id: z.uuid(),
  routine_id: z.uuid().nullable(),
  name: z.string().trim().min(1).max(40),
  /** The day a routine planned it for; never changes. Null for a workout you started without a plan. */
  planned_for: isoDate.nullable(),
  /** The day it is on now (moving its task moves it). */
  planned_date: isoDate,
  started_at: z.string().nullable(),
  done_at: z.string().nullable(),
  ...stamps,
});
export type WorkoutSession = z.infer<typeof WorkoutSession>;

export const WorkoutSet = z.object({
  id: z.uuid(),
  session_id: z.uuid(),
  exercise_id: z.uuid(),
  set_index: z.coerce.number().int().min(0).max(50),
  weight_kg: num.min(0).max(1000),
  reps: z.coerce.number().int().min(0).max(1000),
  performed_at: z.string(),
  ...stamps,
});
export type WorkoutSet = z.infer<typeof WorkoutSet>;

export const BodyMetric = z.object({ id: z.uuid(), weight_kg: num.min(20).max(400), measured_on: isoDate, ...stamps });
export type BodyMetric = z.infer<typeof BodyMetric>;

export const EXERCISES_TABLE = 'exercises';
export const ROUTINES_TABLE = 'routines';
export const WORKOUT_SESSIONS_TABLE = 'workout_sessions';
export const WORKOUT_SETS_TABLE = 'workout_sets';
export const BODY_METRICS_TABLE = 'body_metrics';
export const EXERCISE_COLUMNS = 'id, name, muscle_group, starter_key, created_at, updated_at, deleted_at';
export const ROUTINE_COLUMNS = 'id, name, plan, weekdays, sort_order, created_at, updated_at, deleted_at';
export const WORKOUT_SESSION_COLUMNS = 'id, routine_id, name, planned_for, planned_date, started_at, done_at, created_at, updated_at, deleted_at';
export const WORKOUT_SET_COLUMNS = 'id, session_id, exercise_id, set_index, weight_kg, reps, performed_at, created_at, updated_at, deleted_at';
export const BODY_METRIC_COLUMNS = 'id, weight_kg, measured_on, created_at, updated_at, deleted_at';

// ---- routines ----

/** One exercise in a routine: how many sets, and reps per set (null = as many as you can). */
export const PlanItem = z.object({ exercise_id: z.uuid(), sets: z.number().int().min(1).max(20), reps: z.number().int().min(1).max(100).nullable() });
export type PlanItem = z.infer<typeof PlanItem>;

export function planOf(routine: Pick<Routine, 'plan'>): PlanItem[] {
  try {
    const parsed = z.array(PlanItem).safeParse(JSON.parse(routine.plan));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}
export const planText = (items: readonly PlanItem[]): string => JSON.stringify(items.map(({ exercise_id, sets, reps }) => ({ exercise_id, sets, reps })));

export const WEEKDAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
export const WEEKDAY_NAME = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
/** Monday-first order for pickers and the week strip. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export const weekdaysOf = (routine: Pick<Routine, 'weekdays'>): number[] => [...new Set(routine.weekdays.split('').map(Number))].sort();
export const weekdaysText = (days: readonly number[]): string => [...new Set(days)].filter((d) => d >= 0 && d <= 6).sort().join('');
/** Day of the week for "YYYY-MM-DD", 0 = Sunday. */
export const weekdayOf = (date: string): number => new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))).getDay();

/** "Mon, Wed, Fri", "Every day", or "No days set". */
export function weekdaysLabel(days: readonly number[]): string {
  if (days.length === 0) return 'No days set';
  if (days.length === 7) return 'Every day';
  return WEEK_ORDER.filter((d) => days.includes(d)).map((d) => WEEKDAY_NAME[d]!.slice(0, 3)).join(', ');
}

/** "3 × 8" or "3 × max". */
export const targetLabel = (item: Pick<PlanItem, 'sets' | 'reps'>): string => `${item.sets} × ${item.reps ?? 'max'}`;

/** Rough length of a routine: about 2½ minutes a set, rounded to 5. */
export function routineMinutes(items: readonly PlanItem[]): number {
  const sets = items.reduce((n, i) => n + i.sets, 0);
  return Math.max(5, Math.round((sets * 2.5) / 5) * 5);
}

// ---- starter exercises ----

export interface StarterExercise { key: string; name: string; muscle_group: string }
const ex = (name: string, muscle_group: string): StarterExercise => ({ key: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, muscle_group });

/** Common exercises, so a routine can be put together without typing them all. Copied into yours on first use. */
export const STARTER_EXERCISES: readonly StarterExercise[] = [
  ex('Bench press', 'Chest'), ex('Incline dumbbell press', 'Chest'), ex('Push-ups', 'Chest'), ex('Chest fly', 'Chest'),
  ex('Overhead press', 'Shoulders'), ex('Lateral raise', 'Shoulders'), ex('Face pull', 'Shoulders'),
  ex('Pull-ups', 'Back'), ex('Lat pulldown', 'Back'), ex('Barbell row', 'Back'), ex('Seated cable row', 'Back'), ex('Deadlift', 'Back'),
  ex('Squat', 'Legs'), ex('Leg press', 'Legs'), ex('Romanian deadlift', 'Legs'), ex('Lunges', 'Legs'), ex('Leg curl', 'Legs'), ex('Leg extension', 'Legs'), ex('Calf raise', 'Legs'), ex('Hip thrust', 'Legs'),
  ex('Bicep curl', 'Arms'), ex('Hammer curl', 'Arms'), ex('Tricep pushdown', 'Arms'), ex('Dips', 'Arms'), ex('Skull crushers', 'Arms'),
  ex('Plank', 'Core'), ex('Hanging leg raise', 'Core'), ex('Crunches', 'Core'),
];

// ---- sets ----

export interface SetValue { weight_kg: number; reps: number }

const live = <T extends { deleted_at: string | null }>(rows: readonly T[]) => rows.filter((r) => r.deleted_at === null);

/** The sets you did for an exercise in your most recent other workout that had it, in order. */
export function lastSets(exerciseId: string, sets: readonly WorkoutSet[], sessions: readonly WorkoutSession[], notSessionId?: string): SetValue[] {
  const sessionIds = new Set(live(sessions).map((s) => s.id));
  const mine = live(sets).filter((s) => s.exercise_id === exerciseId && s.session_id !== notSessionId && sessionIds.has(s.session_id));
  if (mine.length === 0) return [];
  const latest = mine.reduce((a, b) => (a.performed_at > b.performed_at ? a : b)).session_id;
  return mine.filter((s) => s.session_id === latest).sort((a, b) => a.set_index - b.set_index).map(({ weight_kg, reps }) => ({ weight_kg, reps }));
}

/** The rows to show for an exercise: last time's numbers set by set, then the plan's reps. Logging is then one tap a set. */
export function prefill(item: Pick<PlanItem, 'sets' | 'reps'>, last: readonly SetValue[]): SetValue[] {
  const count = Math.max(item.sets, 1);
  return Array.from({ length: count }, (_, i) => {
    const from = last[i] ?? last[last.length - 1];
    return { weight_kg: from?.weight_kg ?? 0, reps: from?.reps ?? item.reps ?? 10 };
  });
}

export const formatKg = (kg: number): string => (Number.isInteger(kg) ? String(kg) : String(Math.round(kg * 100) / 100));

/** "50 kg × 8, 8, 7", "18, 15, 12" (no weight), or "50 × 8, 47.5 × 8" when the weight changed. */
export function setsLabel(sets: readonly SetValue[]): string {
  if (sets.length === 0) return '';
  const weights = new Set(sets.map((s) => s.weight_kg));
  if (weights.size === 1) {
    const w = sets[0]!.weight_kg;
    const reps = sets.map((s) => s.reps).join(', ');
    return w === 0 ? reps : `${formatKg(w)} kg × ${reps}`;
  }
  return sets.map((s) => `${formatKg(s.weight_kg)} × ${s.reps}`).join(', ');
}

/** Parses typed kilograms ("52.5", "52,5"). Null unless 0–1000 in steps no finer than 0.01. */
export function parseKg(text: string): number | null {
  const clean = text.trim().replace(',', '.').replace(/\s*kg$/i, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const kg = Number(clean);
  return kg <= 1000 ? kg : null;
}

// ---- the week ----

export type DayState = 'done' | 'planned' | 'missed' | 'rest' | 'today';
export interface WeekDay { date: string; weekday: number; state: DayState; isToday: boolean }

/** Monday of the week that holds `date`. */
export const weekStart = (date: string): string => addDays(date, -((weekdayOf(date) + 6) % 7));

/** Monday to Sunday of this week: done, planned, missed or rest, from your routines and workouts. */
export function weekStrip(routines: readonly Routine[], sessions: readonly WorkoutSession[], today: string): WeekDay[] {
  const planned = new Set(live(routines).filter((r) => planOf(r).length > 0).flatMap(weekdaysOf));
  const doneDays = new Set(live(sessions).filter((s) => s.done_at).map((s) => s.planned_date));
  const plannedDays = new Set(live(sessions).filter((s) => !s.done_at).map((s) => s.planned_date));
  const monday = weekStart(today);
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(monday, i);
    const weekday = weekdayOf(date);
    const isPlanned = plannedDays.has(date) || planned.has(weekday);
    const state: DayState = doneDays.has(date) ? 'done' : !isPlanned ? 'rest' : date < today ? 'missed' : date === today ? 'today' : 'planned';
    return { date, weekday, state, isToday: date === today };
  });
}

/** "3 of 4 workouts" this week. */
export function weekCount(days: readonly WeekDay[]): { done: number; planned: number } {
  return { done: days.filter((d) => d.state === 'done').length, planned: days.filter((d) => d.state !== 'rest').length };
}

/** Today's workout: one already on today (moved here, started or done), else the first routine planned for today. */
export function todaysWorkout(routines: readonly Routine[], sessions: readonly WorkoutSession[], today: string): { routine: Routine | null; session: WorkoutSession | null } {
  const onToday = live(sessions).filter((s) => s.planned_date === today).sort((a, b) => Number(!!a.done_at) - Number(!!b.done_at));
  const session = onToday[0] ?? null;
  const byId = new Map(live(routines).map((r) => [r.id, r]));
  if (session) return { routine: session.routine_id ? byId.get(session.routine_id) ?? null : null, session };
  const day = weekdayOf(today);
  const routine = live(routines).filter((r) => weekdaysOf(r).includes(day) && planOf(r).length > 0).sort((a, b) => a.sort_order - b.sort_order)[0] ?? null;
  // A routine planned today whose workout was moved to another day isn't today's any more.
  if (routine && live(sessions).some((s) => s.routine_id === routine.id && s.planned_for === today && s.planned_date !== today)) return { routine: null, session: null };
  return { routine, session: null };
}

// ---- progress ----

export interface ProgressPoint { date: string; value: number }

/**
 * An exercise over time: the heaviest set of each workout (the most reps, for exercises without weight),
 * oldest first, the last `limit` workouts.
 */
export function exerciseProgress(exerciseId: string, sets: readonly WorkoutSet[], sessions: readonly WorkoutSession[], limit = 12): { points: ProgressPoint[]; unit: 'kg' | 'reps' } {
  const byId = new Map(live(sessions).map((s) => [s.id, s]));
  const mine = live(sets).filter((s) => s.exercise_id === exerciseId && byId.has(s.session_id));
  const weighted = mine.some((s) => s.weight_kg > 0);
  const best = new Map<string, number>();
  for (const s of mine) {
    const date = byId.get(s.session_id)!.planned_date;
    const value = weighted ? s.weight_kg : s.reps;
    best.set(date, Math.max(best.get(date) ?? 0, value));
  }
  const points = [...best].map(([date, value]) => ({ date, value })).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-limit);
  return { points, unit: weighted ? 'kg' : 'reps' };
}

/** Body weight by day (the latest entry of a day wins), oldest first. */
export function weightSeries(metrics: readonly BodyMetric[], limit = 12): ProgressPoint[] {
  const byDay = new Map<string, BodyMetric>();
  for (const m of live(metrics)) {
    const had = byDay.get(m.measured_on);
    if (!had || had.updated_at < m.updated_at) byDay.set(m.measured_on, m);
  }
  return [...byDay.values()].map((m) => ({ date: m.measured_on, value: m.weight_kg })).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-limit);
}

/** "+10 kg in 6 weeks", "−1.5 kg in 3 days", or "" with fewer than two points. */
export function changeLabel(points: readonly ProgressPoint[], unit: 'kg' | 'reps'): string {
  if (points.length < 2) return '';
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const diff = Math.round((last.value - first.value) * 10) / 10;
  const days = Math.round((Date.parse(last.date) - Date.parse(first.date)) / 86_400_000);
  const span = days >= 14 ? `${Math.round(days / 7)} weeks` : `${days} day${days === 1 ? '' : 's'}`;
  if (diff === 0) return `No change in ${span}`;
  return `${diff > 0 ? '+' : '−'}${formatKg(Math.abs(diff))} ${unit} in ${span}`;
}

/** The exercises you've logged, most recently used first: the chips above the progress chart. */
export function loggedExercises(exercises: readonly Exercise[], sets: readonly WorkoutSet[]): Exercise[] {
  const lastUsed = new Map<string, string>();
  for (const s of live(sets)) if ((lastUsed.get(s.exercise_id) ?? '') < s.performed_at) lastUsed.set(s.exercise_id, s.performed_at);
  return live(exercises).filter((e) => lastUsed.has(e.id)).sort((a, b) => (lastUsed.get(b.id)! < lastUsed.get(a.id)! ? -1 : 1));
}

// ---- Ink ----

/**
 * Ink's line on the Workouts card. When every set of an exercise hit its target reps last time, he suggests
 * 2.5 kg more on it (progressive overload); otherwise he keeps it simple.
 */
export function workoutCoach(input: {
  routine: Routine | null; session: WorkoutSession | null; exercises: readonly Exercise[]; sets: readonly WorkoutSet[]; sessions: readonly WorkoutSession[];
}): { mood: InkMood; line: string } {
  const { routine, session, exercises, sets, sessions } = input;
  if (session?.done_at) return { mood: 'cheer', line: `${session.name} done. Nice work.` };
  if (!routine && !session) return { mood: 'sleepy', line: 'Rest day. Recovery counts too.' };
  const name = session?.name ?? routine!.name;
  for (const item of routine ? planOf(routine) : []) {
    const last = lastSets(item.exercise_id, sets, sessions, session?.id);
    if (!item.reps || last.length < item.sets || last[0]!.weight_kg === 0) continue;
    if (last.slice(0, item.sets).every((s) => s.reps >= item.reps! && s.weight_kg === last[0]!.weight_kg)) {
      const exName = exercises.find((e) => e.id === item.exercise_id)?.name ?? 'that lift';
      return { mood: 'coach', line: `You hit every rep on ${exName.toLowerCase()} last time. Try ${formatKg(last[0]!.weight_kg + 2.5)} kg today.` };
    }
  }
  return { mood: 'coach', line: session?.started_at ? `${name} is under way. Pick up where you left off.` : `${name} today. Every set is one tap: the numbers come from last time.` };
}

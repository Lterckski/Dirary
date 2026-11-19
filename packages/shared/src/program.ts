/**
 * Luther's training program: a 7-day split with a gym version and a home version for days he can't get to the gym.
 * It's a fixed plan to read from, not a Routine: rep ranges like 8–10 and notes like "feet on chair" don't fit a plan item.
 * Day 1 is Monday, so Day 7 (full rest) is Sunday.
 */
import { stableUuid } from './links';
import type { PlanItem, Routine } from './workouts';

export type ProgramPlace = 'gym' | 'home';
export type ProgramDayKind = 'lift' | 'bjj' | 'rest';

export interface ProgramExercise {
  name: string;
  /** How to do it, or what to use at home, shown under the name. */
  how?: string;
  /** Sets × reps as written: "3×8–10", "3×12/leg", "2–3 sets each". */
  target: string;
}

export interface ProgramDay {
  day: number;
  title: string;
  /** "Push", "Squat", "Hinge + Shoulders"; empty for BJJ and rest days. */
  focus?: string;
  kind: ProgramDayKind;
  /** What to do on a BJJ or rest day, or a note under the exercises. */
  note?: string;
  exercises: ProgramExercise[];
}

const ex = (name: string, target: string, how?: string): ProgramExercise => (how ? { name, how, target } : { name, target });

const BJJ_LIGHT: ProgramDay = { day: 3, title: 'BJJ', kind: 'bjj', note: 'Lean toward technique and drilling.', exercises: [] };
const REST: ProgramDay = { day: 7, title: 'Full rest', kind: 'rest', note: 'Walking only.', exercises: [] };

export const PROGRAM: Record<ProgramPlace, readonly ProgramDay[]> = {
  gym: [
    { day: 1, title: 'Upper A', focus: 'Push', kind: 'lift', exercises: [
      ex('Incline DB Press', '3×8–10'),
      ex('Flat Barbell Bench', '3×6–8'),
      ex('Seated OHP', '3×8–10'),
      ex('Weighted Pull-Ups', '3×6–8'),
      ex('Lateral Raises', '4×15–20'),
      ex('Overhead Cable Tricep Extension', '3×10–12'),
    ] },
    { day: 2, title: 'Lower A', focus: 'Squat', kind: 'lift', exercises: [
      ex('Back Squat', '4×6–8'),
      ex('Romanian Deadlift', '3×8–10'),
      ex('Walking Lunges', '3×12/leg'),
      ex('Lying/Seated Leg Curl', '3×10–12'),
      ex('Standing Calf Raise', '4×12–15'),
      ex('Hanging Leg Raises', '3×max'),
    ] },
    BJJ_LIGHT,
    { day: 4, title: 'Upper B', focus: 'Pull', kind: 'lift', exercises: [
      ex('Lat Pulldown', '3×8–10'),
      ex('Barbell Row', '3×6–8'),
      ex('Single-Arm DB Row', '3×10/side'),
      ex('Weighted Dips', '3×8–10'),
      ex('Rear Delt Flyes', '3×15–20'),
      ex('Hammer Curls', '2×10–12'),
      ex('Incline DB Curls', '2×10–12'),
    ] },
    { day: 5, title: 'Lower B', focus: 'Hinge + Shoulders', kind: 'lift', exercises: [
      ex('Deadlift or Trap Bar', '3×5'),
      ex('Bulgarian Split Squat', '3×8–10/leg'),
      ex('Leg Curl', '3×12–15'),
      ex('Lateral Raises', '4×15–20'),
      ex('Ab Wheel Rollouts', '3×10–12'),
      ex('Neck Curls/Extensions + Farmer Carries', '2–3 sets each'),
    ] },
    { day: 6, title: 'Hard BJJ', kind: 'bjj', note: 'Skip extra HIIT while cutting. Use 20 minutes of intervals only if you miss BJJ.', exercises: [] },
    REST,
  ],
  home: [
    { day: 1, title: 'Upper A', focus: 'Push', kind: 'lift', exercises: [
      ex('Decline Push-Ups', '3×8–12', 'Feet on chair/bed'),
      ex('Slow Push-Ups', '3×8–12', '3-sec lowering, 1-sec pause at bottom'),
      ex('Pike Push-Ups', '3×8–10', 'Raise your feet as you get stronger'),
      ex('Towel Door Rows or Table Inverted Rows', '3×8–12'),
      ex('Lateral Raises', '4×15–20', 'Filled water bottles or a light backpack'),
      ex('Bodyweight Skull Crushers', '3×10–12', 'Hands on table edge, bend at elbows'),
    ] },
    { day: 2, title: 'Lower A', focus: 'Squat', kind: 'lift', exercises: [
      ex('Backpack Squats or Shrimp Squat progression', '4×8–12', '3-sec lowering on the backpack squats'),
      ex('Single-Leg RDL', '3×10/leg', 'Backpack in hand'),
      ex('Walking Lunges', '3×12/leg', 'Backpack on'),
      ex('Nordic Curl Negatives', '3×5–6', 'Feet under couch, lower slowly'),
      ex('Single-Leg Calf Raise', '4×12–15', 'On a step'),
      ex('Lying Leg Raises or Reverse Crunches', '3×max'),
    ] },
    BJJ_LIGHT,
    { day: 4, title: 'Upper B', focus: 'Pull', kind: 'lift', exercises: [
      ex('Table Inverted Rows, wide grip', '3×6–10', 'Feet elevated to make it harder'),
      ex('Prone Floor Slides', '3×8–10', 'Lie face down, hands on a towel on a smooth floor, pull your body forward'),
      ex('Single-Arm Towel Door Row', '3×10/side'),
      ex('Chair Dips', '3×8–12', 'Between two sturdy chairs, or feet elevated'),
      ex('Prone Y-T-W Raises', '3×12–15 each letter'),
      ex('Backpack Hammer Curls', '2×10–12'),
      ex('Door-Frame Curls', '2×10–12', 'Grip the frame, lean back, curl yourself in'),
    ] },
    { day: 5, title: 'Lower B', focus: 'Hinge + Shoulders', kind: 'lift', exercises: [
      ex('Single-Leg Hip Thrust', '3×10–12/leg', 'Shoulders on couch'),
      ex('Bulgarian Split Squat', '3×10–12/leg', 'Rear foot on chair/bed'),
      ex('Sliding Leg Curls', '3×12–15', 'Socks or towel on a smooth floor'),
      ex('Lateral Raises', '4×15–20', 'Bottles/backpack'),
      ex('Towel Ab Rollouts or Plank Walkouts', '3×10–12'),
      ex('Manual Neck Curls/Extensions + Bag Carries', '2–3 sets each', 'Manual resistance: push against your own hand. Carry a backpack or bag'),
    ] },
    { day: 6, title: 'Hard BJJ', kind: 'bjj', note: 'Skip extra HIIT while cutting. If you miss BJJ, do 20 minutes of intervals: burpees, jump squats, mountain climbers or shadowboxing.', exercises: [] },
    REST,
  ],
};

export const PROGRESSION: readonly string[] = [
  'Stop each set with 1–2 reps left in the tank.',
  'Once you hit the top of the rep range on every set, add weight.',
  'Sleep 7–9 hours; it matters as much as the deficit.',
];

export const PROGRAM_PLACE_LABEL: Record<ProgramPlace, string> = { gym: 'Gym', home: 'Home' };

/** Which program day a date falls on: Monday is Day 1, Sunday is Day 7. */
export function programDayOf(date: string): number {
  const weekday = new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))).getDay();
  return weekday === 0 ? 7 : weekday;
}

/** "Day 1 · Upper A (Push)" */
export const programDayTitle = (d: Pick<ProgramDay, 'day' | 'title' | 'focus'>): string => `Day ${d.day} · ${d.title}${d.focus ? ` (${d.focus})` : ''}`;

/** "3×8–10" → "3 × 8–10", to match targetLabel elsewhere. */
export const programTarget = (target: string): string => target.replace(/^(\d+(?:–\d+)?)×/, '$1 × ');

// ---- starting a program day as a workout ----
// Each lifting day becomes a hidden routine (no weekdays, so it never plans tasks) with a fixed id, and each
// exercise gets a fixed id per place, so every device makes the same rows and history builds up across weeks.
// Gym and home exercises are kept apart: bottle lateral raises shouldn't compare with dumbbell ones.

export const programRoutineId = (place: ProgramPlace, day: number): string => stableUuid(`dirary-program-routine:${place}:${day}`);
export const programExerciseId = (place: ProgramPlace, name: string): string => stableUuid(`dirary-program-exercise:${place}:${name.trim().toLowerCase()}`);

const ROUTINE_IDS = new Set((['gym', 'home'] as const).flatMap((p) => PROGRAM[p].map((d) => programRoutineId(p, d.day))));
/** The hidden routines behind program days, left out of the Routines list. */
export const isProgramRoutine = (routine: Pick<Routine, 'id'>): boolean => ROUTINE_IDS.has(routine.id);

/** "3×8–10" → 3 sets, aiming for 10; "3×max" or "2–3 sets each" → reps left open (null). */
export function programSetsReps(target: string): { sets: number; reps: number | null } {
  const m = /^(\d+)(?:–(\d+))?\s*(?:×\s*(\d+)(?:–(\d+))?)?/.exec(target);
  if (!m) return { sets: 3, reps: null };
  const sets = Math.min(20, Number(m[2] ?? m[1]));
  const reps = m[3] ? Math.min(100, Number(m[4] ?? m[3])) : null;
  return { sets, reps };
}

export interface ProgramWorkout {
  routineId: string;
  /** The workout's name: "Upper B (Pull)", or "Upper B (Pull) · Home". */
  name: string;
  exercises: { id: string; name: string }[];
  plan: PlanItem[];
}

/** What starting a lifting day logs against; null for BJJ and rest days. */
export function programWorkout(place: ProgramPlace, day: number): ProgramWorkout | null {
  const d = PROGRAM[place].find((x) => x.day === day);
  if (!d || d.kind !== 'lift') return null;
  const exercises = d.exercises.map((e) => ({ id: programExerciseId(place, e.name), name: e.name.slice(0, 60) }));
  // A day can't list the same exercise twice (plan items are keyed by exercise), so keep the first.
  const plan: PlanItem[] = [];
  d.exercises.forEach((e, i) => { const id = exercises[i]!.id; if (!plan.some((p) => p.exercise_id === id)) plan.push({ exercise_id: id, ...programSetsReps(e.target) }); });
  const title = `${d.title}${d.focus ? ` (${d.focus})` : ''}`;
  return { routineId: programRoutineId(place, day), name: place === 'home' ? `${title} · Home` : title, exercises, plan };
}

/** What the program has on a date, for screens that would otherwise say "Rest day": "Upper B (Pull)", "Hard BJJ", "Full rest". */
export function programOn(date: string): { day: number; kind: ProgramDayKind; name: string; exercises: number; note: string | null } {
  const d = PROGRAM.gym.find((x) => x.day === programDayOf(date))!;
  return { day: d.day, kind: d.kind, name: `${d.title}${d.focus ? ` (${d.focus})` : ''}`, exercises: d.exercises.length, note: d.note ?? null };
}

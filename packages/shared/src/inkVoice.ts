/**
 * Ink's voice for phone notifications: short, cheeky, a little guilt-trippy, never mean.
 * Every line is picked from a small pool by a seed, so the same nudge reads the same if it is
 * rescheduled, but changes from day to day.
 */

export type NudgeKind = 'task' | 'food' | 'workout' | 'tasksLeft' | 'allDone' | 'rest' | 'comeback1' | 'comeback2' | 'comeback3';

export interface InkNote { title: string; body: string }

export interface NudgeContext {
  /** The task's title, for 'task'. */
  task?: string;
  /** Tasks still open, for 'tasksLeft'. */
  left?: number;
  /** Today's workout, for 'workout'. */
  workout?: string;
}

const TITLES: Record<NudgeKind, readonly string[]> = {
  task: ['Ink here…', 'Woof. Reminder.', 'Ink is tapping your leg', 'Psst. It\'s Ink.'],
  food: ['Ink here…', 'Ink smells nothing logged', 'Snack check'],
  workout: ['Ink brought the leash', 'Ink here…', 'Workout o\'clock'],
  tasksLeft: ['Ink here…', 'Ink is waiting up', 'Still a few left'],
  allDone: ['Good human.', 'Ink is wagging'],
  rest: ['Rest is over', 'Up you get'],
  comeback1: ['Ink here…', 'Ink misses you'],
  comeback2: ['Ink is sitting by the door', 'Ink here…'],
  comeback3: ['These reminders don\'t seem to be working'],
};

type Line = (c: NudgeContext) => string;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const BODIES: Record<NudgeKind, readonly Line[]> = {
  task: [
    (c) => `"${c.task}" won't do itself. Ink checked.`,
    (c) => `It's time for "${c.task}". Ink will be staring until you do it.`,
    (c) => `"${c.task}". Now. Ink has been very patient.`,
    (c) => `Ink found "${c.task}" on your list. Go get it.`,
  ],
  food: [
    () => 'You can\'t hit your protein if you don\'t log it.',
    () => 'Nothing in the food log yet. Ink is not judging. (Ink is judging.)',
    () => 'Lunch happened, right? Tell Ink what it was.',
  ],
  workout: [
    (c) => `${c.workout ?? 'Your workout'} is still on for today. Ink already stretched.`,
    (c) => `Muscles don't grow from the couch. ${c.workout ?? 'Your workout'} is waiting.`,
    (c) => `${c.workout ?? 'Today\'s workout'}: not done yet. Ink is pacing.`,
  ],
  tasksLeft: [
    (c) => `${c.left} ${plural(c.left ?? 0, 'task', 'tasks')} still open. Ink won't sleep until you do them. Probably.`,
    (c) => `You've got ${c.left} ${plural(c.left ?? 0, 'thing', 'things')} left today. Ink believes in you. Mostly.`,
    (c) => `${c.left} left. Finish strong and Ink will do the happy spin.`,
  ],
  allDone: [
    () => 'Everything\'s done today. Ink is doing zoomies.',
    () => 'All clear. Treats all round.',
  ],
  rest: [
    () => 'Next set. Ink is watching.',
    () => 'Break\'s over. Ink says lift.',
  ],
  comeback1: [
    () => 'You didn\'t check in today. Ink is fine. Totally fine.',
    () => 'Ink saved your spot. Come see what\'s due.',
  ],
  comeback2: [
    () => 'It\'s been two days. Ink has started chewing your to-do list.',
    () => 'Two days without you. Ink keeps looking at your phone.',
  ],
  comeback3: [
    () => 'So Ink will stop sending them for now. She\'ll be here when you\'re back.',
  ],
};

/** A stable small number for a string, so picks are repeatable. */
export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The title and body for one nudge. `seed` is usually something like the task id plus the date. */
export function inkNote(kind: NudgeKind, context: NudgeContext = {}, seed = ''): InkNote {
  const n = seedOf(`${kind}:${seed}`);
  const titles = TITLES[kind];
  const bodies = BODIES[kind];
  return {
    title: titles[n % titles.length] as string,
    body: (bodies[(n >>> 8) % bodies.length] as Line)(context),
  };
}

export interface PlannedNudge { id: string; at: Date; note: InkNote }

export interface DayNudgeInput {
  now: Date;
  /** Tasks still open today (overdue plus due today). */
  openTasks: number;
  kcalEaten: number;
  /** Today's planned workout, null on a rest day. */
  workoutName: string | null;
  workoutDone: boolean;
}

/** Same calendar day as `base`, at hh:mm local time. */
function at(base: Date, hh: number, mm: number): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), hh, mm, 0, 0);
}

/**
 * The nudges still to come today, from what today looks like right now. Rescheduled after every change,
 * so logging lunch at 12:50 cancels the 1 PM food nudge.
 */
export function dayNudges(input: DayNudgeInput): PlannedNudge[] {
  const { now } = input;
  const date = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  const out: PlannedNudge[] = [];
  if (input.kcalEaten === 0) out.push({ id: 'ink-food', at: at(now, 13, 0), note: inkNote('food', {}, date) });
  if (input.workoutName && !input.workoutDone) {
    out.push({ id: 'ink-workout', at: at(now, 18, 0), note: inkNote('workout', { workout: input.workoutName }, date) });
  }
  if (input.openTasks > 0) out.push({ id: 'ink-tasks-left', at: at(now, 20, 30), note: inkNote('tasksLeft', { left: input.openTasks }, date) });
  return out.filter((n) => n.at.getTime() > now.getTime());
}

/**
 * The "come back" nudges, counted from the last time the app was opened: 1, 2 and 4 days later at 7 PM.
 * The last one says Ink will stop, and then she does.
 */
export function comebackNudges(lastOpened: Date): PlannedNudge[] {
  const seed = lastOpened.toISOString().slice(0, 10);
  const day = (d: number) => at(new Date(lastOpened.getFullYear(), lastOpened.getMonth(), lastOpened.getDate() + d), 19, 0);
  return [
    { id: 'ink-comeback-1', at: day(1), note: inkNote('comeback1', {}, seed) },
    { id: 'ink-comeback-2', at: day(2), note: inkNote('comeback2', {}, seed) },
    { id: 'ink-comeback-3', at: day(4), note: inkNote('comeback3', {}, seed) },
  ];
}

/**
 * The Today screen and the weekly review: rules that read across tasks, money and health.
 * Each module already works out its own numbers; this file only combines them.
 */
import { addDays } from './dates';
import { MEALS, round1, type DayTotals, type FoodLog, type HealthGoals } from './health';
import type { Category, Transaction } from './money';
import type { FixedSummary, SafeToSpend } from './plan';
import type { InkMood, TodayView } from './taskViews';
import type { ListColor, Task } from './tasks';
import { weekStart, weekStripFor, type Routine, type WeekDay, type WorkoutSession } from './workouts';

export interface DayInput {
  tasks: TodayView;
  safe: SafeToSpend;
  fixed: FixedSummary;
  food: DayTotals;
  goals: HealthGoals | null;
  /** Today's workout: null name on a rest day. */
  workout: { name: string | null; done: boolean; started: boolean };
  hour: number;
}

export type WinKey = 'tasks' | 'workout' | 'food' | 'money';
export interface DayWin {
  key: WinKey;
  label: string;
  value: string;
  /** False when there is nothing to win today (no tasks, a rest day, no targets, no budget). */
  applies: boolean;
  done: boolean;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The four things Today keeps score of. Money is "done" while today's spending stays inside the limit. */
export function dayWins(input: DayInput, formatPeso: (centavos: number) => string): DayWin[] {
  const { tasks, safe, food, goals, workout } = input;
  const left = tasks.overdue.length + tasks.dueToday.length;
  const proteinGoal = goals?.protein_target_g ?? null;
  const kcalGoal = goals?.kcal_target ?? null;
  const foodWin: DayWin = proteinGoal
    ? { key: 'food', label: 'Protein', value: `${Math.round(food.protein)} of ${Math.round(proteinGoal)} g`, applies: true, done: food.protein >= proteinGoal }
    : kcalGoal
      ? { key: 'food', label: 'Calories', value: `${Math.round(food.kcal)} of ${Math.round(kcalGoal)}`, applies: true, done: food.kcal > 0 && food.kcal <= kcalGoal + 150 && food.kcal >= kcalGoal * 0.85 }
      : { key: 'food', label: 'Food', value: food.kcal > 0 ? `${Math.round(food.kcal)} kcal` : 'Nothing yet', applies: false, done: false };
  return [
    { key: 'tasks', label: 'Tasks', value: tasks.total === 0 ? 'Free day' : `${tasks.done} of ${tasks.total}`, applies: tasks.total > 0, done: tasks.total > 0 && left === 0 },
    { key: 'workout', label: 'Workout', value: workout.name ?? 'Rest day', applies: workout.name !== null, done: workout.done },
    foodWin,
    safe.ready
      ? { key: 'money', label: 'Spending', value: safe.safeToday < 0 ? `${formatPeso(-safe.safeToday)} over` : `${formatPeso(safe.safeToday)} left`, applies: true, done: safe.safeToday >= 0 }
      : { key: 'money', label: 'Spending', value: `${formatPeso(safe.spentToday)} spent`, applies: false, done: false },
  ];
}

/** True when every task, the workout and the food target are done (whichever apply) and spending is inside today's limit. */
export function dayComplete(wins: readonly DayWin[]): boolean {
  const earned = wins.filter((w) => w.key !== 'money' && w.applies);
  return earned.length > 0 && earned.every((w) => w.done) && wins.every((w) => w.key !== 'money' || !w.applies || w.done);
}

export function greeting(hour: number): string {
  return hour < 4 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
}

/**
 * Ink's one line for the whole day. Problems come first (a late bill, overdue tasks, overspending),
 * then a finished day, then a morning summary, then whatever is most useful at this hour.
 */
export function dayCoach(input: DayInput, formatPeso: (centavos: number) => string): { mood: InkMood; line: string } {
  const { tasks, safe, fixed, food, goals, workout, hour } = input;
  const left = tasks.overdue.length + tasks.dueToday.length;
  const late = fixed.dueSoon.find((i) => i.dueIn < 0);
  if (late) return { mood: 'worried', line: `${late.expense.name} (${formatPeso(late.expense.amount_centavos)}) was due ${plural(-late.dueIn, 'day')} ago.` };
  if (tasks.overdue.length > 0) {
    const n = tasks.overdue.length;
    return { mood: 'worried', line: `${plural(n, 'overdue task')}. Clear ${n === 1 ? 'that one' : 'those'} first?` };
  }
  if (safe.ready && safe.safeToday < 0) return { mood: 'worried', line: `Over today's spending limit by ${formatPeso(-safe.safeToday)}. Tomorrow's limit will be a little smaller.` };

  const wins = dayWins(input, formatPeso);
  if (dayComplete(wins)) return { mood: 'cheer', line: 'Everything for today is done. Ink is proud of you.' };

  const eaten = MEALS.some((m) => food.meals[m].logs.length > 0);
  if (tasks.total === 0 && !workout.name && !eaten && hour >= 11) return { mood: 'sleepy', line: 'A quiet day: nothing due and no workout planned.' };

  if (hour < 11) {
    const parts = [
      left > 0 ? plural(left, 'task') : null,
      workout.name && !workout.done ? workout.name : null,
      safe.ready ? `${formatPeso(Math.max(0, safe.safeToday))} to spend` : null,
    ].filter((p): p is string => p !== null);
    if (parts.length === 0) return { mood: 'sleepy', line: 'Nothing planned yet. A slow morning is fine.' };
    const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
    return { mood: 'coach', line: `Today: ${list}.` };
  }

  const soon = fixed.dueSoon.find((i) => i.dueIn <= 1);
  if (soon) return { mood: 'coach', line: `${soon.expense.name} (${formatPeso(soon.expense.amount_centavos)}) is due ${soon.dueIn === 0 ? 'today' : 'tomorrow'}.` };
  if (workout.name && !workout.done && hour >= 17) {
    return { mood: 'coach', line: workout.started ? `${workout.name} is under way. Pick up where you left off.` : `${workout.name} is still on for today.` };
  }
  const proteinGoal = goals?.protein_target_g ?? null;
  if (proteinGoal && hour >= 15 && food.protein < proteinGoal) return { mood: 'coach', line: `${Math.round(proteinGoal - food.protein)} g of protein to go today.` };
  if (left > 0) return { mood: 'happy', line: `${plural(left, 'task')} left.${safe.ready ? ` ${formatPeso(safe.safeToday)} safe to spend.` : ''}` };
  return { mood: 'happy', line: safe.ready ? `On track. ${formatPeso(safe.safeToday)} safe to spend today.` : 'On track today.' };
}

/** The few open tasks Today shows: overdue first, then today's, in the order the Tasks tab sorts them. */
export function topTasks(view: TodayView, count = 3): Task[] {
  return [...view.overdue, ...view.dueToday].slice(0, count);
}

// ---- the week ----

/** Days in a row with at least one food log, ending today, or yesterday if nothing is logged today yet. */
export function mealStreak(logs: readonly FoodLog[], today: string): number {
  const days = new Set(logs.filter((l) => l.deleted_at === null).map((l) => l.eaten_on));
  let day = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(day)) {
    n += 1;
    day = addDays(day, -1);
  }
  return n;
}

export interface CategoryTotal { id: string | null; name: string; color: ListColor; amount: number }

export interface WeekReview {
  monday: string;
  sunday: string;
  /** Monday to Sunday. */
  days: string[];
  isThisWeek: boolean;
  tasksDone: number;
  tasksPerDay: number[];
  spent: number;
  spentLastWeek: number;
  /** Biggest first; "Other" collects spending without a category. */
  byCategory: CategoryTotal[];
  workoutDays: WeekDay[];
  workoutsDone: number;
  workoutsPlanned: number;
  /** Days this week with food logged (up to today for this week). */
  foodDays: number;
  /** Averages over the days that have food logged; null with none. */
  avgKcal: number | null;
  avgProtein: number | null;
  streak: number;
}

const counted = (t: Transaction) => t.deleted_at === null && t.status === 'confirmed' && t.direction === 'out' && t.transfer_group_id === null;

/** Everything the weekly review shows, for the week that holds `day`. */
export function weekReview(input: {
  tasks: readonly Task[]; transactions: readonly Transaction[]; categories: readonly Category[]; logs: readonly FoodLog[];
  routines: readonly Routine[]; sessions: readonly WorkoutSession[]; day: string; today: string; toLocalDate: (iso: string) => string;
}): WeekReview {
  const { tasks, transactions, categories, logs, routines, sessions, today, toLocalDate } = input;
  const monday = weekStart(input.day);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const sunday = days[6]!;
  const inWeek = (date: string) => date >= monday && date <= sunday;

  const tasksPerDay = days.map(() => 0);
  for (const t of tasks) {
    if (t.deleted_at !== null || t.status !== 'done' || !t.completed_at) continue;
    const i = days.indexOf(toLocalDate(t.completed_at));
    if (i >= 0) tasksPerDay[i]! += 1;
  }

  const lastMonday = addDays(monday, -7);
  let spent = 0;
  let spentLastWeek = 0;
  const byId = new Map(categories.filter((c) => c.deleted_at === null).map((c) => [c.id, c]));
  const totals = new Map<string | null, CategoryTotal>();
  for (const t of transactions) {
    if (!counted(t)) continue;
    const date = toLocalDate(t.occurred_at);
    if (date >= lastMonday && date < monday) spentLastWeek += t.amount_centavos;
    if (!inWeek(date)) continue;
    spent += t.amount_centavos;
    const category = t.category_id ? byId.get(t.category_id) : undefined;
    const key = category?.id ?? null;
    const row = totals.get(key) ?? { id: key, name: category?.name ?? 'Other', color: category?.color ?? 'muted', amount: 0 };
    row.amount += t.amount_centavos;
    totals.set(key, row);
  }
  const byCategory = [...totals.values()].sort((a, b) => (a.id === null ? 1 : b.id === null ? -1 : b.amount - a.amount));

  const workoutDays = weekStripFor(routines, sessions, monday, today);
  const perDay = new Map<string, { kcal: number; protein: number }>();
  for (const l of logs) {
    if (l.deleted_at !== null || !inWeek(l.eaten_on) || l.eaten_on > today) continue;
    const d = perDay.get(l.eaten_on) ?? { kcal: 0, protein: 0 };
    d.kcal += l.kcal;
    d.protein += l.protein_g;
    perDay.set(l.eaten_on, d);
  }
  const logged = [...perDay.values()];

  return {
    monday, sunday, days, isThisWeek: inWeek(today),
    tasksDone: tasksPerDay.reduce((s, n) => s + n, 0), tasksPerDay,
    spent, spentLastWeek, byCategory,
    workoutDays,
    workoutsDone: workoutDays.filter((d) => d.state === 'done').length,
    workoutsPlanned: workoutDays.filter((d) => d.state !== 'rest').length,
    foodDays: logged.length,
    avgKcal: logged.length ? Math.round(logged.reduce((s, d) => s + d.kcal, 0) / logged.length) : null,
    avgProtein: logged.length ? round1(logged.reduce((s, d) => s + d.protein, 0) / logged.length) : null,
    streak: mealStreak(logs, today),
  };
}

/** "Nov 16 – 22", or "Nov 30 – Dec 6" across months. */
export function weekLabel(monday: string): string {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const sunday = addDays(monday, 6);
  const m1 = MONTHS[Number(monday.slice(5, 7)) - 1];
  const m2 = MONTHS[Number(sunday.slice(5, 7)) - 1];
  const d1 = Number(monday.slice(8, 10));
  const d2 = Number(sunday.slice(8, 10));
  return m1 === m2 ? `${m1} ${d1} – ${d2}` : `${m1} ${d1} – ${m2} ${d2}`;
}

/** Ink's line at the top of the weekly review: the best thing about the week, said plainly. */
export function weekCoach(review: WeekReview, formatPeso: (centavos: number) => string): { mood: InkMood; line: string } {
  const { tasksDone, workoutsDone, workoutsPlanned, spent, spentLastWeek, streak, foodDays } = review;
  if (tasksDone === 0 && workoutsDone === 0 && spent === 0 && foodDays === 0) {
    return { mood: 'sleepy', line: review.isThisWeek ? 'A fresh week. Nothing logged yet.' : 'Nothing was logged this week.' };
  }
  if (workoutsPlanned > 0 && workoutsDone >= workoutsPlanned) return { mood: 'cheer', line: `Every planned workout done${tasksDone ? `, and ${plural(tasksDone, 'task')} ticked off` : ''}. Great week.` };
  if (streak >= 7) return { mood: 'cheer', line: `${streak} days of food logged in a row. Keep the streak going.` };
  if (spentLastWeek > 0 && spent < spentLastWeek && !review.isThisWeek) return { mood: 'happy', line: `You spent ${formatPeso(spentLastWeek - spent)} less than the week before.` };
  if (spentLastWeek > 0 && spent > spentLastWeek * 1.25) return { mood: 'worried', line: `Spending is ${formatPeso(spent - spentLastWeek)} above last week's.` };
  return { mood: 'happy', line: `${plural(tasksDone, 'task')} done and ${workoutsDone} of ${workoutsPlanned} workouts.` };
}

import { addDays, budgetCoach, currentGoals, currentPlan, dayCoach, dayTotals, fixedThisMonth, foodCoach, formatPeso, localDate, monthSummary, planOf, programOn, routineMinutes, safeToSpend, spentOn, todayCoach, todayView, todaysWorkout, type InkMood, type Task } from '@dirary/shared';
import { readCategories, readFixedExpenses, readFoodLogs, readHealthGoals, readMoneyPlans, readRoutines, readTasks, readTransactions, readWater, readWorkoutSessions } from '@/lib/db';
import { todaysSteps } from '@/lib/steps';

export interface WidgetData {
  /** Overdue first, then due today. */
  open: Task[];
  /** Tasks just ticked off on a widget: still listed, shown checked, for a moment before they go. */
  justDone: string[];
  done: number;
  total: number;
  mood: InkMood;
  line: string;
  /** Money: confirmed spending today, and what is left of this month's budgets (null with no budgets). */
  spentToday: number;
  budgetLeft: number | null;
  moneyMood: InkMood;
  /** Food: eaten today and the targets (null when not set). */
  kcalEaten: number;
  proteinEaten: number;
  kcalTarget: number | null;
  proteinTarget: number | null;
  foodMood: InkMood;
  /** Glasses of water today and the daily goal. */
  water: number;
  waterGoal: number;
  /** Workouts: today's (null on a rest day), whether it's done, and steps if Health Connect lets us read them. */
  workoutName: string | null;
  workoutDone: boolean;
  workoutLine: string;
  steps: number | null;
  /** The Day widget: Ink's line across all three modules, and today's safe-to-spend (null with no monthly budget). */
  dayMood: InkMood;
  dayLine: string;
  safeToday: number | null;
}

/** What the widgets show, read straight from the phone's database so it works with the app closed. */
export async function widgetData(): Promise<WidgetData> {
  const tasks = await readTasks();
  const view = todayView(tasks, localDate(), (iso) => localDate(new Date(iso)));
  const coach = todayCoach(view, false);

  const [transactions, categories] = await Promise.all([readTransactions(), readCategories()]);
  const now = new Date();
  const today = localDate(now);
  const toLocal = (iso: string) => localDate(new Date(iso));
  const month = monthSummary(transactions, categories, today.slice(0, 7), toLocal);
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  // The food tables exist only once the Phase 3a SQL has run and synced; until then the widget shows zeros.
  const [logs, goalRows] = await Promise.all([readFoodLogs(today).catch(() => []), readHealthGoals().catch(() => [])]);
  const food = dayTotals(logs, today);
  const water = (await readWater(today).catch(() => [])).filter((w) => w.drunk_on === today).length;
  const goals = currentGoals(goalRows);
  const [routines, sessions] = await Promise.all([readRoutines().catch(() => []), readWorkoutSessions(addDays(today, -1)).catch(() => [])]);
  const workout = todaysWorkout(routines, sessions, today);
  const plan = workout.routine ? planOf(workout.routine) : [];
  // Nothing planned or started: fall back to what My program has today.
  const program = programOn(today);
  const fromProgram = !workout.session && !workout.routine;
  const workoutName = workout.session?.name ?? workout.routine?.name ?? (program.kind === 'lift' ? program.name : null);
  const [fixedRows, plans] = await Promise.all([readFixedExpenses().catch(() => []), readMoneyPlans().catch(() => [])]);
  const safe = safeToSpend(currentPlan(plans), fixedRows, transactions, today, toLocal);
  const whole = (c: number) => formatPeso(Math.trunc(c / 100) * 100);
  const day = dayCoach({
    tasks: view, safe, fixed: fixedThisMonth(fixedRows, transactions, today, toLocal), food, goals, hour: now.getHours(),
    workout: { name: workoutName, done: !!workout.session?.done_at, started: !!workout.session?.started_at },
  }, whole);
  // Health Connect can stall in the background; the widget never waits on it for long.
  const steps = await within(3000, todaysSteps().then((s) => (s.kind === 'ok' ? s.steps : null)), null).catch(() => null);

  return {
    ...withJustTicked([...view.overdue, ...view.dueToday], coach.mood, coach.line), done: view.done, total: view.total,
    spentToday: spentOn(transactions, today, toLocal),
    budgetLeft: month.budgeted > 0 ? month.budgeted - month.budgetSpent : null,
    moneyMood: budgetCoach(month, now.getDate(), daysInMonth).mood,
    kcalEaten: food.kcal, proteinEaten: food.protein, kcalTarget: goals?.kcal_target ?? null, proteinTarget: goals?.protein_target_g ?? null,
    foodMood: foodCoach(food, goals, now.getHours()).mood,
    water, waterGoal: goals?.water_glasses ?? 8,
    workoutName: workoutName ?? (fromProgram && program.kind === 'bjj' ? program.name : null),
    workoutDone: !!workout.session?.done_at,
    workoutLine: fromProgram ? (program.kind === 'lift' ? `Day ${program.day} · ${program.exercises} exercises` : program.note ?? 'Recovery counts too')
      : workout.session?.done_at ? 'Done. Nice work.' : plan.length ? `${plan.length} exercise${plan.length === 1 ? '' : 's'} · about ${routineMinutes(plan)} min` : workout.session ? 'Under way' : 'Recovery counts too',
    steps,
    dayMood: day.mood, dayLine: day.line, safeToday: safe.ready ? safe.safeToday : null,
  };
}

/** Resolves with `fallback` if `work` takes longer than `ms`. */
export function within<T>(ms: number, work: Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    work.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

/** What a widget shows when the phone's data can't be read: an empty day, so it still draws. */
export const EMPTY_WIDGET_DATA: WidgetData = {
  open: [], justDone: [], done: 0, total: 0, mood: 'happy', line: 'Open Dirary to load your day.',
  spentToday: 0, budgetLeft: null, moneyMood: 'happy',
  kcalEaten: 0, proteinEaten: 0, kcalTarget: null, proteinTarget: null, foodMood: 'happy',
  water: 0, waterGoal: 8,
  workoutName: null, workoutDone: false, workoutLine: 'Open Dirary to load your day.', steps: null,
  dayMood: 'happy', dayLine: 'Open Dirary to load your day.', safeToday: null,
};

/** widgetData, but never throws and never takes more than 10 seconds, so a widget always draws. */
export async function safeWidgetData(): Promise<WidgetData> {
  return within(10_000, widgetData(), EMPTY_WIDGET_DATA).catch(() => EMPTY_WIDGET_DATA);
}

/** How long a task ticked on a widget stays on it, checked, before it leaves the list. */
export const TICK_HOLD_MS = 1600;
const ticked = new Map<string, { task: Task; index: number; until: number }>();

/** Call just before ticking a task on a widget, with where it sits in the list. */
export function holdTicked(task: Task, index: number): void {
  ticked.set(task.id, { task, index, until: Date.now() + TICK_HOLD_MS });
}

function withJustTicked(open: Task[], mood: InkMood, line: string): { open: Task[]; justDone: string[]; mood: InkMood; line: string } {
  const now = Date.now();
  for (const [id, t] of ticked) if (t.until <= now) ticked.delete(id);
  if (ticked.size === 0) return { open, justDone: [], mood, line };
  const list = open.filter((t) => !ticked.has(t.id));
  for (const t of [...ticked.values()].sort((a, b) => a.index - b.index)) list.splice(Math.min(t.index, list.length), 0, t.task);
  return { open: list, justDone: [...ticked.keys()], mood: 'cheer', line: 'Nice! One down.' };
}

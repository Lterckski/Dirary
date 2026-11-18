import { addDays, budgetCoach, currentGoals, currentPlan, dayCoach, dayTotals, fixedThisMonth, foodCoach, formatPeso, localDate, monthSummary, planOf, routineMinutes, safeToSpend, spentOn, todayCoach, todayView, todaysWorkout, type InkMood, type Task } from '@dirary/shared';
import { readCategories, readFixedExpenses, readFoodLogs, readHealthGoals, readMoneyPlans, readRoutines, readTasks, readTransactions, readWater, readWorkoutSessions } from '@/lib/db';
import { todaysSteps } from '@/lib/steps';

export interface WidgetData {
  /** Overdue first, then due today. */
  open: Task[];
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
  const [fixedRows, plans] = await Promise.all([readFixedExpenses().catch(() => []), readMoneyPlans().catch(() => [])]);
  const safe = safeToSpend(currentPlan(plans), fixedRows, transactions, today, toLocal);
  const whole = (c: number) => formatPeso(Math.trunc(c / 100) * 100);
  const day = dayCoach({
    tasks: view, safe, fixed: fixedThisMonth(fixedRows, transactions, today, toLocal), food, goals, hour: now.getHours(),
    workout: { name: workout.session?.name ?? workout.routine?.name ?? null, done: !!workout.session?.done_at, started: !!workout.session?.started_at },
  }, whole);
  const steps = await todaysSteps().then((s) => (s.kind === 'ok' ? s.steps : null)).catch(() => null);

  return {
    open: [...view.overdue, ...view.dueToday], done: view.done, total: view.total, mood: coach.mood, line: coach.line,
    spentToday: spentOn(transactions, today, toLocal),
    budgetLeft: month.budgeted > 0 ? month.budgeted - month.budgetSpent : null,
    moneyMood: budgetCoach(month, now.getDate(), daysInMonth).mood,
    kcalEaten: food.kcal, proteinEaten: food.protein, kcalTarget: goals?.kcal_target ?? null, proteinTarget: goals?.protein_target_g ?? null,
    foodMood: foodCoach(food, goals, now.getHours()).mood,
    water, waterGoal: goals?.water_glasses ?? 8,
    workoutName: workout.session?.name ?? workout.routine?.name ?? null,
    workoutDone: !!workout.session?.done_at,
    workoutLine: workout.session?.done_at ? 'Done. Nice work.' : plan.length ? `${plan.length} exercise${plan.length === 1 ? '' : 's'} · about ${routineMinutes(plan)} min` : workout.session ? 'Under way' : 'Recovery counts too',
    steps,
    dayMood: day.mood, dayLine: day.line, safeToday: safe.ready ? safe.safeToday : null,
  };
}

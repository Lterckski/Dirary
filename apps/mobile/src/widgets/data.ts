import { budgetCoach, currentGoals, dayTotals, foodCoach, localDate, monthSummary, spentOn, todayCoach, todayView, type InkMood, type Task } from '@dirary/shared';
import { readCategories, readFoodLogs, readHealthGoals, readTasks, readTransactions } from '@/lib/db';

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
  const goals = currentGoals(goalRows);

  return {
    open: [...view.overdue, ...view.dueToday], done: view.done, total: view.total, mood: coach.mood, line: coach.line,
    spentToday: spentOn(transactions, today, toLocal),
    budgetLeft: month.budgeted > 0 ? month.budgeted - month.budgetSpent : null,
    moneyMood: budgetCoach(month, now.getDate(), daysInMonth).mood,
    kcalEaten: food.kcal, proteinEaten: food.protein, kcalTarget: goals?.kcal_target ?? null, proteinTarget: goals?.protein_target_g ?? null,
    foodMood: foodCoach(food, goals, now.getHours()).mood,
  };
}

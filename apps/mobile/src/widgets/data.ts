import { localDate, todayCoach, todayView, type InkMood, type Task } from '@dirary/shared';
import { readTasks } from '@/lib/db';

export interface WidgetData {
  /** Overdue first, then due today. */
  open: Task[];
  done: number;
  total: number;
  mood: InkMood;
  line: string;
}

/** What the widgets show, read straight from the phone's database so it works with the app closed. */
export async function widgetData(): Promise<WidgetData> {
  const tasks = await readTasks();
  const view = todayView(tasks, localDate(), (iso) => localDate(new Date(iso)));
  const coach = todayCoach(view, false);
  return { open: [...view.overdue, ...view.dueToday], done: view.done, total: view.total, mood: coach.mood, line: coach.line };
}

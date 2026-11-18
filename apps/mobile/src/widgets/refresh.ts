import { createElement } from 'react';
import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { refreshDayNudges } from '@/lib/reminders';
import { widgetData, type WidgetData } from './data';
import { DayWidget, FoodTodayWidget, InkProgressWidget, TodaySpendWidget, TodayTasksWidget, WorkoutTodayWidget } from './TodayTasksWidget';

export const WIDGETS = { TodayTasks: TodayTasksWidget, InkProgress: InkProgressWidget, TodaySpend: TodaySpendWidget, FoodToday: FoodTodayWidget, WorkoutToday: WorkoutTodayWidget, Day: DayWidget } as const;
export type WidgetName = keyof typeof WIDGETS;

/** Ink's nudges for the rest of today come from the same numbers the widgets show. */
export function refreshNudgesFrom(data: WidgetData): Promise<void> {
  return refreshDayNudges({ openTasks: data.open.length, kcalEaten: data.kcalEaten, workoutName: data.workoutName, workoutDone: data.workoutDone });
}

/** Redraws every Dirary widget on the home screen. Called after any change, and reschedules Ink's nudges for today. */
export async function refreshWidgets(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const data = await widgetData();
  refreshNudgesFrom(data).catch(() => {});
  await Promise.all(
    (Object.keys(WIDGETS) as WidgetName[]).map((widgetName) =>
      requestWidgetUpdate({ widgetName, renderWidget: () => createElement(WIDGETS[widgetName], { data }), widgetNotFound: () => {} }),
    ),
  );
}

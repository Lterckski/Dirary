import { createElement } from 'react';
import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { widgetData } from './data';
import { FoodTodayWidget, InkProgressWidget, TodaySpendWidget, TodayTasksWidget } from './TodayTasksWidget';

export const WIDGETS = { TodayTasks: TodayTasksWidget, InkProgress: InkProgressWidget, TodaySpend: TodaySpendWidget, FoodToday: FoodTodayWidget } as const;
export type WidgetName = keyof typeof WIDGETS;

/** Redraws every Dirary widget on the home screen. Called after any task change. */
export async function refreshWidgets(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const data = await widgetData();
  await Promise.all(
    (Object.keys(WIDGETS) as WidgetName[]).map((widgetName) =>
      requestWidgetUpdate({ widgetName, renderWidget: () => createElement(WIDGETS[widgetName], { data }), widgetNotFound: () => {} }),
    ),
  );
}

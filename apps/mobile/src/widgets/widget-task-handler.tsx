import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { readTasks } from '@/lib/db';
import { syncTasks, toggleTask } from '@/lib/tasks-store';
import { widgetData } from './data';
import { WIDGETS, type WidgetName } from './refresh';

/** Android calls this in the background whenever a widget is added, resized, refreshed or tapped. */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const Widget = WIDGETS[props.widgetInfo.widgetName as WidgetName];
  if (!Widget) return;

  switch (props.widgetAction) {
    case 'WIDGET_CLICK': {
      const id = props.clickActionData?.id;
      if (props.clickAction === 'TOGGLE_TASK' && typeof id === 'string') {
        const task = (await readTasks()).find((t) => t.id === id);
        // toggleTask saves on the phone, redraws all widgets, reschedules reminders and syncs.
        if (task) await toggleTask(task);
      }
      props.renderWidget(<Widget data={await widgetData()} />);
      break;
    }
    case 'WIDGET_UPDATE':
      // The half-hourly refresh is also a chance to pick up changes made on the web.
      await syncTasks();
      props.renderWidget(<Widget data={await widgetData()} />);
      break;
    case 'WIDGET_ADDED':
    case 'WIDGET_RESIZED':
      props.renderWidget(<Widget data={await widgetData()} />);
      break;
    default:
      break;
  }
}

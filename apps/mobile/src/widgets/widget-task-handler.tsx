import { Vibration } from 'react-native';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { localDate } from '@dirary/shared';
import { readTasks, readWater } from '@/lib/db';
import { tapWater } from '@/lib/health-store';
import { syncTasks, toggleTask } from '@/lib/tasks-store';
import { TICK_HOLD_MS, holdTicked, safeWidgetData, within } from './data';
import { describe, logWidget } from './log';
import { WIDGETS, refreshNudgesFrom, type WidgetName } from './refresh';

/** Android calls this in the background whenever a widget is added, resized, refreshed or tapped. */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const Widget = WIDGETS[props.widgetInfo.widgetName as WidgetName];
  if (!Widget) return;
  const widget = props.widgetInfo.widgetName;
  const action = props.clickAction ? `${props.widgetAction} ${props.clickAction}` : props.widgetAction;
  try {
    await handle(props, Widget);
    await logWidget({ widget, action, ok: true });
  } catch (error) {
    await logWidget({ widget, action, ok: false, note: describe(error) });
    // Whatever went wrong, draw the widget rather than leave it blank.
    props.renderWidget(<Widget data={await safeWidgetData()} />);
  }
}

async function handle(props: WidgetTaskHandlerProps, Widget: (typeof WIDGETS)[WidgetName]) {
  switch (props.widgetAction) {
    case 'WIDGET_CLICK': {
      const id = props.clickActionData?.id;
      if (props.clickAction === 'TOGGLE_TASK' && typeof id === 'string') {
        const task = (await readTasks()).find((t) => t.id === id);
        if (task && task.status === 'todo') {
          // Widgets can't animate, so the tick shows at once (checked box, Ink cheering, a buzz), stays for
          // a moment, and then the task leaves the list.
          const before = await safeWidgetData();
          holdTicked(task, Math.max(0, before.open.findIndex((t) => t.id === id)));
          Vibration.vibrate(18);
          props.renderWidget(<Widget data={await safeWidgetData()} />);
          // toggleTask saves on the phone, redraws all widgets, reschedules reminders and syncs.
          await toggleTask(task);
          await new Promise((r) => setTimeout(r, TICK_HOLD_MS));
        } else if (task) await toggleTask(task);
      }
      if (props.clickAction === 'ADD_WATER') {
        const today = localDate();
        const water = (await readWater(today)).filter((w) => w.drunk_on === today);
        // tapWater saves on the phone, redraws all widgets and syncs.
        await tapWater(water, water.length + 1);
      }
      props.renderWidget(<Widget data={await safeWidgetData()} />);
      break;
    }
    case 'WIDGET_UPDATE':
      // The half-hourly refresh is also a chance to pick up changes made on the web.
      // Never let a slow network hold up the drawing.
      await within(10_000, syncTasks(), undefined).catch(() => {});
      const data = await safeWidgetData();
      props.renderWidget(<Widget data={data} />);
      // Keeps Ink's nudges for today right even when the app hasn't been opened.
      await refreshNudgesFrom(data).catch(() => {});
      break;
    case 'WIDGET_ADDED':
    case 'WIDGET_RESIZED':
      props.renderWidget(<Widget data={await safeWidgetData()} />);
      break;
    default:
      break;
  }
}

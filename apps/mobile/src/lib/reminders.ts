/** Local notifications for task reminders. They are scheduled on the phone, so they ring with no signal. */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { colors } from '@dirary/ui';
import type { Task } from '@dirary/shared';

const CHANNEL = 'task-reminders';
/** Android limits how many alarms an app may hold; the soonest ones matter most. */
const MAX_SCHEDULED = 50;

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let channelReady: Promise<unknown> | null = null;
function ensureChannel() {
  if (Platform.OS !== 'android') return Promise.resolve();
  channelReady ??= Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Task reminders',
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: colors.inkBlue,
  });
  return channelReady;
}

export async function hasReminderPermission(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

/** Asks once. Returns whether reminders can ring. */
export async function requestReminderPermission(): Promise<boolean> {
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

/** Replaces every scheduled reminder with the current set. Cheap enough to run after each change. */
export async function refreshReminders(tasks: readonly Task[]): Promise<void> {
  if (!(await hasReminderPermission())) return;
  await ensureChannel();
  const now = Date.now();
  const due = tasks
    .filter((t) => t.status === 'todo' && t.deleted_at === null && t.remind_at !== null && Date.parse(t.remind_at) > now)
    .sort((a, b) => Date.parse(a.remind_at as string) - Date.parse(b.remind_at as string))
    .slice(0, MAX_SCHEDULED);

  await Notifications.cancelAllScheduledNotificationsAsync();
  for (const task of due) {
    await Notifications.scheduleNotificationAsync({
      identifier: `task-${task.id}`,
      content: { title: task.title, body: 'Ink says it\'s time.', data: { taskId: task.id, url: 'dirary://tasks' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(task.remind_at as string), channelId: CHANNEL },
    });
  }
}

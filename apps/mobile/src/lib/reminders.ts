/**
 * Phone notifications, all local so they ring with no signal: task reminders, the rest timer, and Ink's
 * nudges (lunch not logged, workout not done, tasks left tonight, and "come back" after days away).
 * Every one is in Ink's voice (packages/shared/src/inkVoice.ts) and barks.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { colors } from '@dirary/ui';
import { comebackNudges, dayNudges, inkNote, localDate, type DayNudgeInput, type PlannedNudge, type Task } from '@dirary/shared';

/** Android fixes a channel's sound when it is made, so the bark needs its own channel. */
const CHANNEL = 'ink-bark-2';
const OLD_CHANNELS = ['task-reminders', 'ink-bark'];
/** The file listed under `sounds` in the expo-notifications plugin in app.json. */
const BARK = 'bark.wav';
/** Android limits how many alarms an app may hold; the soonest ones matter most. */
const MAX_SCHEDULED = 50;
const LAST_OPENED = 'ink-last-opened';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let channelReady: Promise<unknown> | null = null;
function ensureChannel() {
  if (Platform.OS !== 'android') return Promise.resolve();
  channelReady ??= (async () => {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Ink',
      description: 'Reminders, the rest timer and Ink\'s nudges. They bark.',
      importance: Notifications.AndroidImportance.HIGH,
      sound: BARK,
      vibrationPattern: [0, 120, 90, 120],
      lightColor: colors.inkBlue,
    });
    for (const old of OLD_CHANNELS) await Notifications.deleteNotificationChannelAsync(old).catch(() => {});
  })();
  return channelReady;
}

function content(title: string, body: string, data: Record<string, unknown>): Notifications.NotificationContentInput {
  return { title, body, data, sound: BARK, color: colors.inkBlue };
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

/** Cancels every scheduled notification whose id starts with `prefix`. */
async function cancelPrefixed(prefix: string) {
  for (const scheduled of await Notifications.getAllScheduledNotificationsAsync()) {
    if (scheduled.identifier.startsWith(prefix)) await Notifications.cancelScheduledNotificationAsync(scheduled.identifier);
  }
}

async function schedule(nudges: readonly PlannedNudge[], url: string) {
  for (const n of nudges) {
    await Notifications.scheduleNotificationAsync({
      identifier: n.id,
      content: content(n.note.title, n.note.body, { url }),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: n.at, channelId: CHANNEL },
    });
  }
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

  // Only task reminders are replaced; the rest timer and Ink's nudges stay.
  await cancelPrefixed('task-');
  for (const task of due) {
    const note = inkNote('task', { task: task.title }, `${task.id}:${task.remind_at}`);
    await Notifications.scheduleNotificationAsync({
      identifier: `task-${task.id}`,
      content: content(note.title, note.body, { taskId: task.id, url: '/tasks' }),
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(task.remind_at as string), channelId: CHANNEL },
    });
  }
}

/**
 * Ink's nudges for the rest of today, from what today looks like now. Runs with every widget redraw,
 * so it follows each change, and the half-hourly widget refresh keeps it right with the app closed.
 */
export async function refreshDayNudges(day: Omit<DayNudgeInput, 'now'>): Promise<void> {
  if (!(await hasReminderPermission())) return;
  await ensureChannel();
  await cancelPrefixed('ink-day-');
  const nudges = dayNudges({ ...day, now: new Date() }).map((n) => ({ ...n, id: n.id.replace('ink-', 'ink-day-') }));
  await schedule(nudges, '/');
}

/** Call when the app comes to the front: pushes the "come back" nudges out to count from now. */
export async function markOpened(): Promise<void> {
  await AsyncStorage.setItem(LAST_OPENED, localDate()).catch(() => {});
  if (!(await hasReminderPermission())) return;
  await ensureChannel();
  await cancelPrefixed('ink-comeback-');
  await schedule(comebackNudges(new Date()), '/');
}

const REST_ID = 'rest-timer';

/** Barks when rest is over, even with the phone locked or Dirary in the background. */
export async function scheduleRestAlert(seconds: number): Promise<void> {
  await cancelRestAlert();
  if (seconds <= 0 || !(await hasReminderPermission())) return;
  await ensureChannel();
  const note = inkNote('rest', {}, String(Math.floor(Date.now() / 60_000)));
  await Notifications.scheduleNotificationAsync({
    identifier: REST_ID,
    content: content(note.title, note.body, { url: '/health?tab=workouts' }),
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: Math.round(seconds), channelId: CHANNEL },
  });
}

export async function cancelRestAlert(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(REST_ID).catch(() => {});
}

/** Tapping a notification opens the screen it is about. Returns the unsubscribe function. */
export function openNotificationTaps(): () => void {
  const open = (response: Notifications.NotificationResponse | null) => {
    const url = response?.notification.request.content.data?.url;
    if (typeof url !== 'string') return;
    // Older reminders carried a dirary:// link; the router wants the path.
    const path = url.startsWith('dirary://') ? `/${url.slice('dirary://'.length)}` : url;
    router.push(path as never);
  };
  const last = Notifications.getLastNotificationResponse();
  if (last) open(last);
  const sub = Notifications.addNotificationResponseReceivedListener(open);
  return () => sub.remove();
}

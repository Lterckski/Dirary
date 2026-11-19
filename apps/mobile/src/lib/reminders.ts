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
import { comebackNudges, dayNudges, inkNote, localDate, reminderDue, SNOOZE_MINUTES, type DayNudgeInput, type PlannedNudge, type Task } from '@dirary/shared';

/** Android fixes a channel's sound when it is made, so the bark needs its own channel. */
const CHANNEL = 'ink-bark-2';
const OLD_CHANNELS = ['task-reminders', 'ink-bark'];
/** The file listed under `sounds` in the expo-notifications plugin in app.json. */
const BARK = 'bark.wav';
/** Android limits how many alarms an app may hold; the soonest ones matter most. */
const MAX_SCHEDULED = 50;
const LAST_OPENED = 'ink-last-opened';
/** Task reminders carry two buttons: remind me again in 15 minutes, or cancel. */
const TASK_CATEGORY = 'task-reminder';
const SNOOZE = 'snooze';
const CANCEL = 'cancel';
const HANDLED_ACTIONS = 'ink-handled-actions';

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
    await Notifications.setNotificationCategoryAsync(TASK_CATEGORY, [
      { identifier: SNOOZE, buttonTitle: `Remind me in ${SNOOZE_MINUTES} min`, options: { opensAppToForeground: false } },
      { identifier: CANCEL, buttonTitle: 'Cancel', options: { opensAppToForeground: false, isDestructive: true } },
    ]);
  })();
  return channelReady;
}

function content(title: string, body: string, data: Record<string, unknown>): Notifications.NotificationContentInput {
  return { title, body, data, sound: BARK, color: colors.inkBlue };
}

function taskContent(title: string, body: string, taskId: string): Notifications.NotificationContentInput {
  return { ...content(title, body, { taskId, url: '/tasks' }), categoryIdentifier: TASK_CATEGORY };
}

export async function hasReminderPermission(): Promise<boolean> {
  return (await Notifications.getPermissionsAsync()).granted;
}

/** Asks once. Returns whether reminders can ring. */
export async function requestReminderPermission(): Promise<boolean> {
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (current.canAskAgain && (await Notifications.requestPermissionsAsync()).granted);
  if (granted) await allowExactAlarms();
  return granted;
}

/**
 * Without the exact alarm permission Android delivers scheduled notifications late (Samsung by many minutes,
 * sometimes after the moment has passed). app.json declares USE_EXACT_ALARM, which Android 13+ grants at
 * install, and SCHEDULE_EXACT_ALARM, so older phones can open the "Alarms & reminders" setting.
 */
async function allowExactAlarms() {
  if (Platform.OS !== 'android') return;
  try {
    const exact = await Notifications.getExactAlarmPermissionsAsync();
    if (!exact.granted && exact.canAskAgain) await Notifications.requestExactAlarmPermissionsAsync();
  } catch {
    // Older builds without the permission declared: reminders still ring, just less precisely.
  }
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
  const now = new Date();
  const due = tasks
    .filter((t) => t.status === 'todo' && t.deleted_at === null)
    .map((task) => ({ task, at: reminderDue(task, now) }))
    .filter((r): r is { task: Task; at: Date } => r.at !== null)
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, MAX_SCHEDULED);

  // Only task reminders are replaced; the rest timer and Ink's nudges stay.
  await cancelPrefixed('task-');
  // A snoozed reminder stays until its task is done or deleted.
  const open = new Set(tasks.filter((t) => t.status === 'todo' && t.deleted_at === null).map((t) => t.id));
  for (const scheduled of await Notifications.getAllScheduledNotificationsAsync()) {
    if (scheduled.identifier.startsWith('snooze-') && !open.has(scheduled.identifier.slice('snooze-'.length))) {
      await Notifications.cancelScheduledNotificationAsync(scheduled.identifier);
    }
  }
  for (const { task, at } of due) {
    const note = inkNote('task', { task: task.title }, `${task.id}:${task.remind_at}`);
    await Notifications.scheduleNotificationAsync({
      identifier: `task-${task.id}`,
      content: taskContent(note.title, note.body, task.id),
      // An alarm clock alarm is never deferred to save battery, so the reminder rings on the minute.
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at, channelId: CHANNEL, delivery: 'alarmClock' },
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

/**
 * The buttons on a task reminder. "Remind me in 15 min" puts the same reminder back 15 minutes from now
 * (with the buttons again); "Cancel" clears it. Runs in the background task when Dirary isn't open, and from
 * the listener when it is. Android can hand the same press to both, or replay it later when the app opens,
 * so each press is handled once.
 */
export async function handleReminderAction(response: Notifications.NotificationResponse): Promise<void> {
  const { actionIdentifier, notification } = response;
  if (actionIdentifier !== SNOOZE && actionIdentifier !== CANCEL) return;
  const taskId = notification.request.content.data?.taskId;
  if (typeof taskId !== 'string') return;
  const key = `${notification.request.identifier}:${notification.date}:${actionIdentifier}`;
  const handled: string[] = JSON.parse((await AsyncStorage.getItem(HANDLED_ACTIONS).catch(() => null)) ?? '[]');
  if (handled.includes(key)) return;
  await AsyncStorage.setItem(HANDLED_ACTIONS, JSON.stringify([key, ...handled].slice(0, 20))).catch(() => {});

  await Notifications.dismissNotificationAsync(notification.request.identifier).catch(() => {});
  const snoozeId = `snooze-${taskId}`;
  if (actionIdentifier === CANCEL) {
    await Notifications.cancelScheduledNotificationAsync(snoozeId).catch(() => {});
    return;
  }
  await ensureChannel();
  const { title, body } = notification.request.content;
  await Notifications.scheduleNotificationAsync({
    identifier: snoozeId,
    content: taskContent(title ?? 'Ink', body ?? '', taskId),
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: Date.now() + SNOOZE_MINUTES * 60_000,
      channelId: CHANNEL,
      delivery: 'alarmClock',
    },
  });
}

/** Tapping a notification opens the screen it is about. Returns the unsubscribe function. */
export function openNotificationTaps(): () => void {
  const open = (response: Notifications.NotificationResponse | null) => {
    if (!response) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) {
      void handleReminderAction(response);
      return;
    }
    const url = response.notification.request.content.data?.url;
    if (typeof url !== 'string') return;
    // Older reminders carried a dirary:// link; the router wants the path.
    const path = url.startsWith('dirary://') ? `/${url.slice('dirary://'.length)}` : url;
    router.push(path as never);
  };
  // Only a plain tap opens a screen on launch; a button press was handled when it was pressed.
  const last = Notifications.getLastNotificationResponse();
  if (last?.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) open(last);
  const sub = Notifications.addNotificationResponseReceivedListener(open);
  return () => sub.remove();
}

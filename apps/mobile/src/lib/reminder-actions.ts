/**
 * Handles the buttons on task reminders while Dirary is in the background or closed. Android starts the
 * JavaScript in the background for the press, so this has to be defined when the bundle loads (index.js).
 */
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { handleReminderAction } from './reminders';

const REMINDER_ACTIONS = 'ink-reminder-actions';

TaskManager.defineTask<Notifications.NotificationTaskPayload>(REMINDER_ACTIONS, async ({ data }) => {
  if (data && 'actionIdentifier' in data) await handleReminderAction(data);
});

export function registerReminderActions(): void {
  Notifications.registerTaskAsync(REMINDER_ACTIONS).catch(() => {});
}

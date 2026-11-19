// Entry point. Loads the app, then registers the background handlers: home-screen widgets, and the
// "Remind me in 15 min" / "Cancel" buttons on task reminders.
import 'expo-router/entry';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { registerReminderActions } from './src/lib/reminder-actions';
import { widgetTaskHandler } from './src/widgets/widget-task-handler';

registerWidgetTaskHandler(widgetTaskHandler);
registerReminderActions();

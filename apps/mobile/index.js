// Entry point. Loads the app, then registers the background handler that draws home-screen widgets.
import 'expo-router/entry';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './src/widgets/widget-task-handler';

registerWidgetTaskHandler(widgetTaskHandler);

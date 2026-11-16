import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { InkTestWidget } from './InkTestWidget';

const WIDGETS = { InkTest: InkTestWidget } as const;

/** Android calls this in the background whenever a widget is added, resized, updated or tapped. */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  const Widget = WIDGETS[props.widgetInfo.widgetName as keyof typeof WIDGETS];
  if (!Widget) return;
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(<Widget />);
      break;
    default:
      break;
  }
}

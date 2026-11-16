import { FlexWidget, ImageWidget, TextWidget } from 'react-native-android-widget';
import { colors } from '@dirary/ui';
import { timeLabel } from '@dirary/shared';
import type { WidgetData } from './data';

const INK = {
  happy: require('../../assets/mascot/ink-happy.png'),
  coach: require('../../assets/mascot/ink-coach.png'),
  cheer: require('../../assets/mascot/ink-cheer.png'),
  sleepy: require('../../assets/mascot/ink-sleepy.png'),
  worried: require('../../assets/mascot/ink-worried.png'),
} as const;
const EDGE: Record<number, string> = { 0: colors.inkBlue, 1: colors.inkBlue, 2: colors.amber, 3: colors.red };
const MAX_ROWS = 4;

/** 4×2 widget: today's tasks, tick-off without opening the app, and a + button. */
export function TodayTasksWidget({ data }: { data: WidgetData }) {
  const rows = data.open.slice(0, MAX_ROWS);
  const more = data.open.length - rows.length;
  return (
    <FlexWidget
      clickAction="OPEN_URI" clickActionData={{ uri: 'dirary://tasks' }}
      style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'column', backgroundColor: colors.surface, borderRadius: 28, padding: 14, flexGap: 6 }}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 10 }}>
        <FlexWidget style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.inkBlue, alignItems: 'center', justifyContent: 'center' }}>
          <ImageWidget image={INK[data.mood]} imageWidth={32} imageHeight={32} />
        </FlexWidget>
        <FlexWidget style={{ flex: 1 }}>
          <TextWidget text={data.open.length > 0 ? `Today · ${data.open.length} left` : data.total > 0 ? 'Today · all done' : 'Today'} maxLines={1} truncate="END" style={{ fontSize: 17, fontWeight: '800', color: colors.text }} />
        </FlexWidget>
        <FlexWidget
          clickAction="OPEN_URI" clickActionData={{ uri: 'dirary://tasks?add=1' }}
          style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: colors.inkBlue, alignItems: 'center', justifyContent: 'center' }}>
          <TextWidget text="+" style={{ fontSize: 24, fontWeight: '700', color: colors.onInkBlue }} />
        </FlexWidget>
      </FlexWidget>

      {rows.length === 0 ? (
        <FlexWidget style={{ width: 'match_parent', flex: 1, justifyContent: 'center' }}>
          <TextWidget text={data.line} maxLines={2} truncate="END" style={{ fontSize: 14, color: colors.muted }} />
        </FlexWidget>
      ) : (
        rows.map((task) => (
          <FlexWidget key={task.id} style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 10 }}>
            <FlexWidget
              clickAction="TOGGLE_TASK" clickActionData={{ id: task.id }}
              style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
              <FlexWidget style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: (EDGE[task.priority] ?? colors.inkBlue) as `#${string}` }} />
            </FlexWidget>
            <FlexWidget style={{ flex: 1 }}>
              <TextWidget text={task.title} maxLines={1} truncate="END" style={{ fontSize: 14, fontWeight: '600', color: colors.text }} />
            </FlexWidget>
            {task.due_time ? <TextWidget text={timeLabel(task.due_time)} style={{ fontSize: 12, fontWeight: '600', color: colors.muted }} /> : null}
          </FlexWidget>
        ))
      )}
      {more > 0 ? <TextWidget text={`+${more} more`} style={{ fontSize: 12, color: colors.muted }} /> : null}
    </FlexWidget>
  );
}

/** 2×2 widget: Ink reacts as the day fills up. */
export function InkProgressWidget({ data }: { data: WidgetData }) {
  const allDone = data.total > 0 && data.open.length === 0;
  return (
    <FlexWidget
      clickAction="OPEN_URI" clickActionData={{ uri: 'dirary://tasks' }}
      style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.inkBlue, borderRadius: 28, padding: 12, flexGap: 2 }}>
      <ImageWidget image={INK[allDone ? 'cheer' : data.mood]} imageWidth={84} imageHeight={84} />
      <TextWidget text={data.total === 0 ? 'Free day' : `${data.done} of ${data.total}`} style={{ fontSize: 22, fontWeight: '800', color: colors.onInkBlue }} />
      <TextWidget text={data.total === 0 ? 'nothing due' : 'done today'} style={{ fontSize: 12, fontWeight: '700', color: colors.onInkBlue }} />
    </FlexWidget>
  );
}

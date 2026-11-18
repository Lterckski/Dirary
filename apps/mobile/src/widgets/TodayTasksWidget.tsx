import { FlexWidget, ImageWidget, TextWidget } from 'react-native-android-widget';
import { colors } from '@dirary/ui';
import { formatKcal, formatPeso, timeLabel } from '@dirary/shared';
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

/** 2×2 widget: what you've spent today and what's left of this month's budgets. Tap to open Money. */
export function TodaySpendWidget({ data }: { data: WidgetData }) {
  const over = data.budgetLeft !== null && data.budgetLeft < 0;
  return (
    <FlexWidget
      clickAction="OPEN_URI" clickActionData={{ uri: 'dirary://money' }}
      style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'column', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: 28, padding: 14 }}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 8 }}>
        <FlexWidget style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.inkBlue, alignItems: 'center', justifyContent: 'center' }}>
          <ImageWidget image={INK[data.moneyMood]} imageWidth={28} imageHeight={28} />
        </FlexWidget>
        <TextWidget text="Spent today" style={{ fontSize: 13, fontWeight: '600', color: colors.muted }} />
      </FlexWidget>
      <TextWidget text={formatPeso(data.spentToday)} maxLines={1} style={{ fontSize: 28, fontWeight: '800', color: colors.text, adjustsFontSizeToFit: true }} />
      <TextWidget
        text={data.budgetLeft === null ? 'No budget set' : over ? `${formatPeso(-data.budgetLeft)} over budget` : `${formatPeso(data.budgetLeft)} left this month`}
        maxLines={1} truncate="END" style={{ fontSize: 12, fontWeight: '600', color: over ? colors.red : colors.muted }} />
    </FlexWidget>
  );
}

/** 2×2 widget: calories and protein left today, and a + that opens the food search. Tap anywhere else to open Health. */
export function FoodTodayWidget({ data }: { data: WidgetData }) {
  const kcalLeft = data.kcalTarget === null ? null : Math.round(data.kcalTarget - data.kcalEaten);
  const proteinLeft = data.proteinTarget === null ? null : Math.max(0, Math.round(data.proteinTarget - data.proteinEaten));
  const over = kcalLeft !== null && kcalLeft < 0;
  return (
    <FlexWidget
      clickAction="OPEN_URI" clickActionData={{ uri: 'dirary://health' }}
      style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'column', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: 28, padding: 14 }}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <FlexWidget style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.inkBlue, alignItems: 'center', justifyContent: 'center' }}>
          <ImageWidget image={INK[data.foodMood]} imageWidth={28} imageHeight={28} />
        </FlexWidget>
        <FlexWidget
          clickAction="OPEN_URI" clickActionData={{ uri: 'dirary://health?log=1' }}
          style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.inkBlue, alignItems: 'center', justifyContent: 'center' }}>
          <TextWidget text="+" style={{ fontSize: 22, fontWeight: '800', color: colors.onInkBlue }} />
        </FlexWidget>
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'column' }}>
        <TextWidget text={formatKcal(kcalLeft === null ? data.kcalEaten : Math.abs(kcalLeft))} maxLines={1} style={{ fontSize: 28, fontWeight: '800', color: over ? colors.red : colors.text, adjustsFontSizeToFit: true }} />
        <TextWidget text={kcalLeft === null ? 'kcal eaten today' : over ? 'kcal over today' : 'kcal left today'} maxLines={1} style={{ fontSize: 12, fontWeight: '600', color: colors.muted }} />
      </FlexWidget>
      <TextWidget
        text={proteinLeft === null ? `${Math.round(data.proteinEaten)} g protein` : proteinLeft === 0 ? 'Protein target hit' : `${proteinLeft} g protein to go`}
        maxLines={1} truncate="END" style={{ fontSize: 12, fontWeight: '700', color: colors.tongue }} />
    </FlexWidget>
  );
}

/** 2×2 widget: today's workout (or a rest day) and today's steps. Tap to open Workouts. */
export function WorkoutTodayWidget({ data }: { data: WidgetData }) {
  const mood = data.workoutDone ? 'cheer' : data.workoutName ? 'coach' : 'sleepy';
  return (
    <FlexWidget
      clickAction="OPEN_URI" clickActionData={{ uri: 'dirary://health?tab=workouts' }}
      style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'column', justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: 28, padding: 14 }}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 8 }}>
        <FlexWidget style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.inkBlue, alignItems: 'center', justifyContent: 'center' }}>
          <ImageWidget image={INK[mood]} imageWidth={28} imageHeight={28} />
        </FlexWidget>
        <TextWidget text="Today" style={{ fontSize: 13, fontWeight: '600', color: colors.muted }} />
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'column' }}>
        <TextWidget text={data.workoutName ?? 'Rest day'} maxLines={1} truncate="END" style={{ fontSize: 22, fontWeight: '800', color: data.workoutDone ? colors.inkBlue : colors.text, adjustsFontSizeToFit: true }} />
        <TextWidget text={data.workoutLine} maxLines={1} truncate="END" style={{ fontSize: 12, fontWeight: '600', color: colors.muted }} />
      </FlexWidget>
      <TextWidget text={data.steps === null ? ' ' : `${formatKcal(data.steps)} steps`} maxLines={1} style={{ fontSize: 12, fontWeight: '700', color: colors.inkBlue }} />
    </FlexWidget>
  );
}

/** One quick-add button on the Day widget. */
function AddButton({ label, uri }: { label: string; uri: string }) {
  return (
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri }}
      style={{ flex: 1, height: 40, borderRadius: 20, backgroundColor: colors.raised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexGap: 4 }}>
      <TextWidget text="+" style={{ fontSize: 17, fontWeight: '800', color: colors.inkBlue }} />
      <TextWidget text={label} maxLines={1} style={{ fontSize: 13, fontWeight: '700', color: colors.text }} />
    </FlexWidget>
  );
}

/** One figure on the Day widget. */
function Stat({ label, value, color = colors.text, uri }: { label: string; value: string; color?: string; uri: string }) {
  return (
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri }}
      style={{ flex: 1, flexDirection: 'column', padding: 10, borderRadius: 16, backgroundColor: colors.raised, flexGap: 2 }}>
      <TextWidget text={label} maxLines={1} style={{ fontSize: 11, fontWeight: '600', color: colors.muted }} />
      <TextWidget text={value} maxLines={1} truncate="END" style={{ fontSize: 15, fontWeight: '800', color: color as `#${string}` }} />
    </FlexWidget>
  );
}

const DAY_ROWS = 3;

/** 4×4 widget: the whole day at a glance. Ink's line, the top tasks to tick, money, food and the workout, and quick adds. */
export function DayWidget({ data }: { data: WidgetData }) {
  const rows = data.open.slice(0, DAY_ROWS);
  const more = data.open.length - rows.length;
  const kcalLeft = data.kcalTarget === null ? null : Math.round(data.kcalTarget - data.kcalEaten);
  const whole = (c: number) => formatPeso(Math.trunc(c / 100) * 100);
  return (
    <FlexWidget
      clickAction="OPEN_URI" clickActionData={{ uri: 'dirary://' }}
      style={{ height: 'match_parent', width: 'match_parent', flexDirection: 'column', backgroundColor: colors.surface, borderRadius: 28, padding: 14, flexGap: 10 }}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 10 }}>
        <FlexWidget style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.inkBlue, alignItems: 'center', justifyContent: 'center' }}>
          <ImageWidget image={INK[data.dayMood]} imageWidth={40} imageHeight={40} />
        </FlexWidget>
        <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
          <TextWidget text={data.open.length > 0 ? `Today · ${data.open.length} left` : data.total > 0 ? 'Today · all done' : 'Today'} maxLines={1} style={{ fontSize: 16, fontWeight: '800', color: colors.text }} />
          <TextWidget text={data.dayLine} maxLines={2} truncate="END" style={{ fontSize: 12, color: colors.muted }} />
        </FlexWidget>
      </FlexWidget>

      <FlexWidget style={{ width: 'match_parent', flex: 1, flexDirection: 'column', flexGap: 2 }}>
        {rows.length === 0 ? (
          <TextWidget text={data.total > 0 ? 'Everything due today is done.' : 'Nothing due today.'} style={{ fontSize: 14, color: colors.muted }} />
        ) : (
          rows.map((task) => (
            <FlexWidget key={task.id} style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 8 }}>
              <FlexWidget clickAction="TOGGLE_TASK" clickActionData={{ id: task.id }} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
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

      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', flexGap: 8 }}>
        <Stat uri="dirary://money"
          label={data.safeToday === null ? 'Spent today' : data.safeToday < 0 ? 'Over today' : 'Safe today'}
          value={data.safeToday === null ? whole(data.spentToday) : whole(Math.abs(data.safeToday))}
          color={data.safeToday !== null && data.safeToday < 0 ? colors.red : colors.text} />
        <Stat uri="dirary://health"
          label={kcalLeft === null ? 'Eaten' : kcalLeft < 0 ? 'kcal over' : 'kcal left'}
          value={formatKcal(kcalLeft === null ? data.kcalEaten : Math.abs(kcalLeft))}
          color={kcalLeft !== null && kcalLeft < 0 ? colors.red : colors.text} />
        <Stat uri="dirary://health?tab=workouts"
          label={data.workoutDone ? 'Workout done' : 'Workout'}
          value={data.workoutName ?? 'Rest day'}
          color={data.workoutDone ? colors.inkBlue : colors.text} />
      </FlexWidget>

      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', flexGap: 8 }}>
        <AddButton label="Task" uri="dirary://tasks?add=1" />
        <AddButton label="Expense" uri="dirary://money?add=1" />
        <AddButton label="Food" uri="dirary://health?log=1" />
      </FlexWidget>
    </FlexWidget>
  );
}

// The React Compiler (on for the whole app in app.json) rewrites components in a way the widget library
// can't draw, which left every home-screen widget blank. Widgets are plain functions, so opt them out.
'use no memo';

import { FlexWidget, ImageWidget, TextWidget } from 'react-native-android-widget';
import { colors } from '@dirary/ui';
import { formatKcal, formatPeso, timeLabel, type Task } from '@dirary/shared';
import type { WidgetData } from './data';
import { EDGE, INK, Ring, TickBox, accent, big, glowCard, label, strong } from './glow';

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
        rows.map((task) => {
          // Just ticked: a filled box with a check and a dimmed title, held for a moment before it goes.
          const done = data.justDone.includes(task.id);
          const edge = (EDGE[task.priority] ?? colors.inkBlue) as `#${string}`;
          return (
            <FlexWidget key={task.id} style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 10 }}>
              <FlexWidget
                clickAction="TOGGLE_TASK" clickActionData={{ id: task.id }}
                style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
                <FlexWidget style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 2, borderColor: done ? colors.inkBlue : edge, ...(done ? { backgroundColor: colors.inkBlue } : {}), alignItems: 'center', justifyContent: 'center' }}>
                  {done ? <TextWidget text="✓" style={{ fontSize: 14, fontWeight: '800', color: colors.onInkBlue }} /> : null}
                </FlexWidget>
              </FlexWidget>
              <FlexWidget style={{ flex: 1 }}>
                <TextWidget text={task.title} maxLines={1} truncate="END" style={{ fontSize: 14, fontWeight: '600', color: done ? colors.faint : colors.text }} />
              </FlexWidget>
              {done ? <TextWidget text="Done" style={{ fontSize: 12, fontWeight: '700', color: colors.inkBlue }} />
                : task.due_time ? <TextWidget text={timeLabel(task.due_time)} style={{ fontSize: 12, fontWeight: '600', color: colors.muted }} /> : null}
            </FlexWidget>
          );
        })
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

/** Adds a glass of water right from the home screen, without opening the app. */
function WaterButton({ data }: { data: WidgetData }) {
  const full = data.water >= data.waterGoal;
  return (
    <FlexWidget
      clickAction="ADD_WATER"
      accessibilityLabel={`Add a glass of water. ${data.water} of ${data.waterGoal} today.`}
      style={{ height: 30, paddingHorizontal: 10, borderRadius: 15, backgroundColor: full ? colors.inkBlue : colors.raised, alignItems: 'center', justifyContent: 'center' }}>
      <TextWidget text={`+💧 ${data.water}/${data.waterGoal}`} maxLines={1} style={{ fontSize: 12, fontWeight: '800', color: full ? colors.onInkBlue : colors.text }} />
    </FlexWidget>
  );
}

/** 2×2 widget: calories and protein left today, a + that opens the food search, and a water button that logs a glass in place. Tap anywhere else to open Health. */
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
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexGap: 6 }}>
        <FlexWidget style={{ flex: 1 }}>
          <TextWidget
            text={proteinLeft === null ? `${Math.round(data.proteinEaten)} g protein` : proteinLeft === 0 ? 'Protein hit' : `${proteinLeft} g protein to go`}
            maxLines={1} truncate="END" style={{ fontSize: 12, fontWeight: '700', color: colors.tongue }} />
        </FlexWidget>
        <WaterButton data={data} />
      </FlexWidget>
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

/** One task on the Day and Today's tasks widgets: tick box in the urgency colour, title, due time. */
function TaskRow({ task, done }: { task: Task; done: boolean }) {
  return (
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 8 }}>
      <TickBox id={task.id} edge={EDGE[task.priority] ?? colors.inkBlue} done={done} />
      <FlexWidget style={{ flex: 1 }}>
        <TextWidget text={task.title} maxLines={1} truncate="END" style={{ ...label(14, done ? colors.faint : colors.text) }} />
      </FlexWidget>
      {done ? <TextWidget text="Done" style={strong(12, colors.inkBlue)} />
        : task.due_time ? <TextWidget text={timeLabel(task.due_time)} style={label(12)} /> : null}
    </FlexWidget>
  );
}

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const dateLabel = (d = new Date()) => `${DAYS[d.getDay()]} · ${MONTHS[d.getMonth()]} ${d.getDate()}`;

/** One quick-add button on the Day widget, filled in its module's colour. */
function AddButton({ text, color, uri }: { text: string; color: `#${string}`; uri: string }) {
  return (
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri }}
      style={{ flex: 1, height: 40, borderRadius: 20, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <TextWidget text={`+ ${text}`} maxLines={1} style={strong(13, colors.onInkBlue)} />
    </FlexWidget>
  );
}

/** One figure on the Day widget: a small accent tab, the number, and what it is. */
function Stat({ caption, value, color, uri }: { caption: string; value: string; color: `#${string}`; uri: string }) {
  return (
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri }}
      style={{ flex: 1, flexDirection: 'column', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 16, backgroundColor: colors.raised, flexGap: 3 }}>
      <FlexWidget style={{ width: 18, height: 4, borderRadius: 2, backgroundColor: color }} />
      <TextWidget text={value} maxLines={1} truncate="END" style={big(18)} />
      <TextWidget text={caption} maxLines={1} style={strong(10, color)} />
    </FlexWidget>
  );
}

const DAY_ROWS = 3;

/** 4×4 widget: the whole day at a glance. Ink in a ring that fills as tasks get done, her line, the top tasks to tick, money, food and the workout, and quick adds. */
export function DayWidget({ data }: { data: WidgetData }) {
  const rows = data.open.slice(0, DAY_ROWS);
  const more = data.open.length - rows.length;
  const kcalLeft = data.kcalTarget === null ? null : Math.round(data.kcalTarget - data.kcalEaten);
  const whole = (c: number) => formatPeso(Math.trunc(c / 100) * 100);
  const money = accent('money'), food = accent('food'), workout = accent('workout');
  return (
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: 'dirary://' }} style={{ ...glowCard('tasks', 16), flexGap: 10 }}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 12 }}>
        <Ring size={84} stroke={8} pct={data.total ? data.done / data.total : 0} color={colors.inkBlue}>
          <ImageWidget image={INK[data.dayMood]} imageWidth={62} imageHeight={62} />
        </Ring>
        <FlexWidget style={{ flex: 1, flexDirection: 'column', flexGap: 2 }}>
          <TextWidget text={dateLabel()} style={strong(11, colors.muted)} />
          {data.total === 0 ? <TextWidget text="Free day" style={big(30)} /> : (
            <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              <TextWidget text={`${data.done}`} style={big(32)} />
              <TextWidget text={`/${data.total}`} style={big(32, colors.inkBlue)} />
              <TextWidget text=" done" style={big(32)} />
            </FlexWidget>
          )}
          <TextWidget text={data.dayLine} maxLines={2} truncate="END" style={label(12)} />
        </FlexWidget>
      </FlexWidget>

      <FlexWidget style={{ width: 'match_parent', flex: 1, flexDirection: 'column', flexGap: 2 }}>
        {rows.length === 0 ? (
          <TextWidget text={data.total > 0 ? 'Everything due today is done.' : 'Nothing due today.'} style={label(14)} />
        ) : rows.map((task) => <TaskRow key={task.id} task={task} done={data.justDone.includes(task.id)} />)}
        {more > 0 ? <TextWidget text={`+${more} more`} style={label(12, colors.faint)} /> : null}
      </FlexWidget>

      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', flexGap: 8 }}>
        <Stat uri="dirary://money" color={data.safeToday !== null && data.safeToday < 0 ? colors.red : money}
          caption={data.safeToday === null ? 'spent today' : data.safeToday < 0 ? 'over today' : 'safe today'}
          value={data.safeToday === null ? whole(data.spentToday) : whole(Math.abs(data.safeToday))} />
        <Stat uri="dirary://health" color={kcalLeft !== null && kcalLeft < 0 ? colors.red : food}
          caption={kcalLeft === null ? 'kcal eaten' : kcalLeft < 0 ? 'kcal over' : 'kcal left'}
          value={formatKcal(kcalLeft === null ? data.kcalEaten : Math.abs(kcalLeft))} />
        <Stat uri="dirary://health?tab=workouts" color={workout}
          caption={data.workoutDone ? 'workout done' : data.workoutName ? 'workout' : 'recovery'}
          value={data.workoutName ?? 'Rest day'} />
      </FlexWidget>

      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', flexGap: 8 }}>
        <AddButton text="Task" color={colors.inkBlue} uri="dirary://tasks?add=1" />
        <AddButton text="Expense" color={money} uri="dirary://money?add=1" />
        <AddButton text="Food" color={food} uri="dirary://health?log=1" />
      </FlexWidget>
    </FlexWidget>
  );
}

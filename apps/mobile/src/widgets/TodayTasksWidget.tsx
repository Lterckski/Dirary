// The React Compiler (on for the whole app in app.json) rewrites components in a way the widget library
// can't draw, which left every home-screen widget blank. Widgets are plain functions, so opt them out.
'use no memo';

import { FlexWidget, ImageWidget, TextWidget } from 'react-native-android-widget';
import { colors, widgetGlow } from '@dirary/ui';
import { formatKcal, formatPeso, timeLabel, type Task } from '@dirary/shared';
import type { WidgetData } from './data';
import { Bar, EDGE, INK, Ring, RoundButton, TickBox, accent, big, glowCard, label, strong } from './glow';

const MAX_ROWS = 4;

/** 4×2 widget: today's tasks, tick-off without opening the app, and a + button. Ink's ring fills as tasks get done. */
export function TodayTasksWidget({ data }: { data: WidgetData }) {
  const rows = data.open.slice(0, MAX_ROWS);
  const more = data.open.length - rows.length;
  const left = data.open.length - data.justDone.length;
  return (
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: 'dirary://tasks' }} style={{ ...glowCard('tasks', 14), flexGap: 6 }}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 10 }}>
        <Ring size={44} stroke={5} pct={data.total ? data.done / data.total : 0} color={colors.inkBlue}>
          <ImageWidget image={INK[data.mood]} imageWidth={32} imageHeight={32} />
        </Ring>
        <FlexWidget style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', flexGap: 6 }}>
          <TextWidget text={left > 0 ? `${left} left` : data.total > 0 ? 'All done' : 'Today'} maxLines={1} style={big(22)} />
          {data.total > 0 ? <TextWidget text={`· ${data.done} done`} maxLines={1} style={label(12)} /> : null}
        </FlexWidget>
        <RoundButton text="+" color={colors.inkBlue} uri="dirary://tasks?add=1" />
      </FlexWidget>

      {rows.length === 0 ? (
        <FlexWidget style={{ width: 'match_parent', flex: 1, justifyContent: 'center' }}>
          <TextWidget text={data.line} maxLines={2} truncate="END" style={label(14)} />
        </FlexWidget>
      ) : rows.map((task) => <TaskRow key={task.id} task={task} done={data.justDone.includes(task.id)} />)}
      {more > 0 ? <TextWidget text={`+${more} more`} style={label(12, colors.faint)} /> : null}
    </FlexWidget>
  );
}

/** 2×2 widget: Ink in a big ring that fills as the day's tasks get done, and cheers when they all are. */
export function InkProgressWidget({ data }: { data: WidgetData }) {
  const allDone = data.total > 0 && data.open.length === data.justDone.length;
  return (
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: 'dirary://tasks' }}
      style={{ ...glowCard('tasks', 10), alignItems: 'center', justifyContent: 'center', flexGap: 4 }}>
      <Ring size={118} stroke={10} pct={data.total ? data.done / data.total : 0} color={colors.inkBlue}>
        <ImageWidget image={INK[allDone ? 'cheer' : data.total === 0 ? 'sleepy' : data.mood]} imageWidth={86} imageHeight={86} />
      </Ring>
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end', flexGap: 4 }}>
        <TextWidget text={data.total === 0 ? 'Free day' : `${data.done} of ${data.total}`} style={big(20)} />
        <TextWidget text={data.total === 0 ? '' : allDone ? 'all done' : 'done'} style={label(11)} />
      </FlexWidget>
    </FlexWidget>
  );
}

/** 2×2 widget: what you've spent today, big, and what's still safe to spend, with a bar of today's share. Tap to open Money. */
export function TodaySpendWidget({ data }: { data: WidgetData }) {
  const money = accent('money');
  const safe = data.safeToday;
  const overBudget = data.budgetLeft !== null && data.budgetLeft < 0;
  const over = safe !== null ? safe < 0 : overBudget;
  const line = safe !== null
    ? safe < 0 ? `${formatPeso(-safe)} over today` : `${formatPeso(safe)} safe today`
    : data.budgetLeft === null ? 'No budget set' : overBudget ? `${formatPeso(-data.budgetLeft)} over budget` : `${formatPeso(data.budgetLeft)} left this month`;
  // How much of today's safe amount is already gone.
  const share = safe === null ? null : over ? 1 : data.spentToday / Math.max(1, data.spentToday + safe);
  return (
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: 'dirary://money' }} style={{ ...glowCard('money', 14), justifyContent: 'space-between' }}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', flexGap: 8 }}>
        <FlexWidget style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: money, alignItems: 'center', justifyContent: 'center' }}>
          <ImageWidget image={INK[data.moneyMood]} imageWidth={26} imageHeight={26} />
        </FlexWidget>
        <TextWidget text="Spent today" style={label(12)} />
      </FlexWidget>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', flexGap: 4 }}>
        <TextWidget text={formatPeso(data.spentToday)} maxLines={1} style={{ ...big(36), adjustsFontSizeToFit: true }} />
        <TextWidget text={line} maxLines={1} truncate="END" style={strong(12, over ? colors.red : money)} />
      </FlexWidget>
      {share === null ? <TextWidget text=" " style={label(8)} />
        : <Bar pct={share} color={over ? colors.red : money} to={over ? undefined : widgetGlow.money.accentTo} />}
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
      style={{ height: 30, paddingHorizontal: 10, borderRadius: 15, backgroundColor: full ? accent('workout') : colors.raised, alignItems: 'center', justifyContent: 'center' }}>
      <TextWidget text={`💧 ${data.water}/${data.waterGoal}`} maxLines={1} style={strong(12, full ? colors.onInkBlue : colors.text)} />
    </FlexWidget>
  );
}

/** 2×2 widget: calories left inside a ring that fills as you eat, a + that opens the food search, protein to go, and a water button that logs a glass in place. Tap anywhere else to open Health. */
export function FoodTodayWidget({ data }: { data: WidgetData }) {
  const food = accent('food');
  const kcalLeft = data.kcalTarget === null ? null : Math.round(data.kcalTarget - data.kcalEaten);
  const proteinLeft = data.proteinTarget === null ? null : Math.max(0, Math.round(data.proteinTarget - data.proteinEaten));
  const over = kcalLeft !== null && kcalLeft < 0;
  return (
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: 'dirary://health' }} style={{ ...glowCard('food', 12), justifyContent: 'space-between' }}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', justifyContent: 'space-between' }}>
        <Ring size={96} stroke={9} pct={over ? 1 : data.kcalTarget ? data.kcalEaten / data.kcalTarget : 0} color={over ? colors.red : food}>
          <TextWidget text={formatKcal(kcalLeft === null ? data.kcalEaten : Math.abs(kcalLeft))} maxLines={1} style={big(20, over ? colors.red : colors.text)} />
          <TextWidget text={kcalLeft === null ? 'kcal eaten' : over ? 'kcal over' : 'kcal left'} style={label(10)} />
        </Ring>
        <RoundButton text="+" color={food} uri="dirary://health?log=1" size={36} radius={18} fontSize={22} />
      </FlexWidget>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexGap: 6 }}>
        <FlexWidget style={{ flex: 1 }}>
          <TextWidget
            text={proteinLeft === null ? `${Math.round(data.proteinEaten)} g protein` : proteinLeft === 0 ? 'Protein hit' : `${proteinLeft} g protein to go`}
            maxLines={2} truncate="END" style={strong(11, colors.tongue)} />
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

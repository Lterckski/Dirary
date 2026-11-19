/** Today: one screen that answers "how's my day going?" across tasks, money and health. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, View } from 'react-native';
import { Press } from '@/components/press';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Path, Svg } from 'react-native-svg';
import { colors, radius, space } from '@dirary/ui';
import {
  amountInTask, dayCoach, dayComplete, dayTotals, dayWins, dueLabel, fixedThisMonth, formatKcal, formatPeso, glassesOn, greeting, localDate,
  planOf, programOn, routineMinutes, safeToSpend, taskWithoutAmount, todayView, todaysWorkout, topTasks, weekReview, weekStrip,
  type Account, type Category, type DayWin, type Task,
} from '@dirary/shared';

import { Confetti } from '@/components/confetti';
import { Mascot, MascotPaws } from '@/components/mascot';
import { TransactionEditor } from '@/components/money-editor';
import { Bar } from '@/components/motion-bits';
import { TaskRow } from '@/components/task-bits';
import { Button, Card, TAB_BAR_CLEARANCE, Text, styles } from '@/components/ui';
import { WeekDots } from '@/components/week-dots';
import { WeekReviewScreen } from '@/components/week-review';
import { addTo } from '@/lib/add-to';
import { isBillTask } from '@/lib/bill-tasks';
import { readAccounts, readCategories } from '@/lib/db';
import { useHealthStore } from '@/lib/health-store';
import { useMoneyStore } from '@/lib/money-store';
import { CHECKED_MS, ENTER, LEAVE } from '@/lib/motion';
import { WidgetCheck } from '@/components/widget-check';
import { signOutAndClear, toggleTask, useTasksStore } from '@/lib/tasks-store';
import { startProgramDay, useWorkoutsStore } from '@/lib/workouts-store';
import { readProgramPlace } from '@/components/program-card';

const GREETING_NAME = 'Luther';
const LABEL = { letterSpacing: 1.4, color: colors.muted } as const;
const NUM = { fontVariant: ['tabular-nums' as const] };
const toLocal = (iso: string) => localDate(new Date(iso));
/** Whole pesos for Ink's line and the scorecard. */
const pesos = (centavos: number) => formatPeso(Math.trunc(centavos / 100) * 100);
const pct = (part: number, whole: number | null | undefined) => (whole ? Math.max(0, Math.min(100, Math.round((part / whole) * 100))) : 0);

export default function TodayScreen() {
  const tasks = useTasksStore();
  const money = useMoneyStore();
  const health = useHealthStore();
  const workouts = useWorkoutsStore();
  const insets = useSafeAreaInsets();
  const [reviewing, setReviewing] = useState(false);
  const [checkingWidgets, setCheckingWidgets] = useState(false);
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 60_000); // keeps the greeting, the date and "in 2 hours" right
    return () => clearInterval(timer);
  }, []);
  const now = new Date();
  const today = localDate(now);
  const hour = now.getHours();

  const view = useMemo(() => todayView(tasks.tasks, today, toLocal), [tasks.tasks, today]);
  const safe = useMemo(() => safeToSpend(money.plan, money.fixed, money.transactions, today, toLocal), [money.plan, money.fixed, money.transactions, today]);
  const fixed = useMemo(() => fixedThisMonth(money.fixed, money.transactions, today, toLocal), [money.fixed, money.transactions, today]);
  const food = useMemo(() => dayTotals(health.logs, today), [health.logs, today]);
  const workout = useMemo(() => todaysWorkout(workouts.routines, workouts.sessions, today), [workouts.routines, workouts.sessions, today]);
  const strip = useMemo(() => weekStrip(workouts.routines, workouts.sessions, today), [workouts.routines, workouts.sessions, today]);
  const week = useMemo(() => weekReview({
    tasks: tasks.tasks, transactions: money.transactions, categories: money.categories, logs: health.logs,
    routines: workouts.routines, sessions: workouts.sessions, day: today, today, toLocalDate: toLocal,
  }), [tasks.tasks, money.transactions, money.categories, health.logs, workouts.routines, workouts.sessions, today]);

  // No routine or workout today: fall back to what My program has on this day.
  const program = programOn(today);
  const fromProgram = !workout.session && !workout.routine;
  const workoutName = workout.session?.name ?? workout.routine?.name ?? (program.kind === 'lift' ? program.name : null);
  async function startWorkoutTile() {
    if (!fromProgram || program.kind !== 'lift') return addTo('workout');
    const started = await startProgramDay(await readProgramPlace(), program.day);
    router.navigate({ pathname: '/health', params: { tab: 'workouts', ...(started ? { session: started.id } : {}) } });
  }
  const input = { tasks: view, safe, fixed, food, goals: health.goals, hour, workout: { name: workoutName, done: !!workout.session?.done_at, started: !!workout.session?.started_at } };
  const coach = dayCoach(input, pesos);
  const wins = dayWins(input, pesos);
  const complete = dayComplete(wins);
  const loading = tasks.loading || money.loading || health.loading || workouts.loading;

  // Ticking works as on the Tasks tab: a workout's task ticks the workout, a bill's logs the payment,
  // and "Buy dog food ₱450" offers to log the ₱450.
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const waiting = useRef(new Map<string, { task: Task; timer: ReturnType<typeof setTimeout> }>());
  const [offer, setOffer] = useState<{ amount: number; note: string } | null>(null);
  const [logging, setLogging] = useState<{ amount: number; note: string; accounts: Account[]; categories: Category[] } | null>(null);
  useEffect(() => {
    if (!offer) return;
    const timer = setTimeout(() => setOffer(null), 10000);
    return () => clearTimeout(timer);
  }, [offer]);
  useEffect(() => () => {
    for (const { task, timer } of waiting.current.values()) { clearTimeout(timer); toggleTask(task); }
    waiting.current.clear();
  }, []);
  useEffect(() => {
    setTicked((cur) => {
      const keep = [...cur].filter((id) => waiting.current.has(id));
      return keep.length === cur.size ? cur : new Set(keep);
    });
  }, [tasks.tasks]);
  function toggle(task: Task) {
    if (task.status === 'done') return toggleTask(task);
    const pending = waiting.current.get(task.id);
    if (pending) {
      clearTimeout(pending.timer);
      waiting.current.delete(task.id);
      setTicked((cur) => { const next = new Set(cur); next.delete(task.id); return next; });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setTicked((cur) => new Set(cur).add(task.id));
    const timer = setTimeout(async () => {
      waiting.current.delete(task.id);
      await toggleTask(task);
      const amount = amountInTask(task.title);
      if (amount && !(await isBillTask(task))) setOffer({ amount, note: taskWithoutAmount(task.title) });
    }, CHECKED_MS);
    waiting.current.set(task.id, { task, timer });
  }
  async function logOffer() {
    if (!offer) return;
    const [accounts, categories] = await Promise.all([readAccounts(), readCategories()]);
    setOffer(null);
    setLogging({ ...offer, accounts, categories });
  }

  // Finishing the day: confetti out of the scorecard and a success buzz, once a day.
  const screenRef = useRef<ComponentRef<typeof View>>(null);
  const scoreRef = useRef<ComponentRef<typeof View>>(null);
  const [shot, setShot] = useState(0);
  const [origin, setOrigin] = useState<{ x: number; y: number; width: number } | null>(null);
  const was = useRef<boolean | null>(null);
  useEffect(() => {
    if (loading) return;
    const before = was.current;
    was.current = complete;
    if (before !== false || !complete) return;
    AsyncStorage.getItem('dirary.dayCheered').then((cheered) => {
      if (cheered === today) return;
      AsyncStorage.setItem('dirary.dayCheered', today).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      screenRef.current?.measureInWindow((sx, sy) => {
        scoreRef.current?.measureInWindow((bx, by, bw) => {
          setOrigin({ x: bx - sx + bw / 2, y: by - sy + 40, width: bw });
          setShot((n) => n + 1);
        });
      });
    }).catch(() => {});
  }, [complete, loading, today]);

  const shown = topTasks(view, 3);
  const left = view.overdue.length + view.dueToday.length;
  const more = left - shown.length;
  const nextBill = fixed.items.find((i) => !i.paid) ?? null;
  const plan = workout.routine ? planOf(workout.routine) : [];
  const glasses = glassesOn(health.water, today);
  const glassGoal = health.goals?.water_glasses ?? 8;
  const over = safe.ready && safe.safeToday < 0;
  const earned = wins.filter((w) => w.applies && w.key !== 'money');

  return (
    <View ref={screenRef} style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}>
        <View style={{ backgroundColor: colors.inkBlue, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, paddingTop: insets.top + space[4], paddingHorizontal: space[5], paddingBottom: 72, gap: space[1] }}>
          <Text variant="small" weight="bold" style={{ color: colors.onInkBlue, letterSpacing: 1.3 }}>{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</Text>
          <Text variant="title" accessibilityRole="header" style={{ color: colors.onInkBlue }}>{greeting(hour)}, {GREETING_NAME}</Text>
          <Text weight="semi" accessibilityLiveRegion="polite" style={{ color: colors.onInkBlue, marginRight: 96 }}>{loading ? 'Getting your day ready…' : coach.line}</Text>
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', right: space[6], bottom: 36 }}>
            <Mascot mood={loading ? 'happy' : complete ? 'cheer' : coach.mood} size={96} />
          </View>
        </View>

        <View style={{ paddingHorizontal: space[5], gap: space[5], marginTop: -50 }}>
          <View ref={scoreRef}>
            <Card style={{ borderRadius: 28 }}>
              <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', zIndex: 2, top: -14, right: space[6] - space[5] - 1 }}>
                <MascotPaws size={96} />
              </View>
              <View style={[styles.row, { justifyContent: 'space-between' }]}>
                <Text variant="small" weight="bold" style={LABEL}>YOUR DAY</Text>
                {!loading && <Text variant="label" muted style={NUM}>{complete ? 'All done' : `${earned.filter((w) => w.done).length} of ${earned.length} done`}</Text>}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
                {wins.map((w) => <Win key={w.key} win={w} loading={loading} />)}
              </View>
            </Card>
          </View>

          <Card>
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <Text variant="small" weight="bold" style={LABEL}>TASKS</Text>
              <Press accessibilityRole="link" accessibilityHint="Opens Tasks" onPress={() => router.navigate('/tasks')} hitSlop={12}>
                <Text variant="label" weight="semi" style={[NUM, { color: colors.inkBlue }]}>{view.total === 0 ? 'Open' : `${view.done} of ${view.total} done`}</Text>
              </Press>
            </View>
            {shown.length === 0 ? (
              <Text muted>{view.total > 0 ? 'Everything due today is done.' : 'Nothing due today.'}</Text>
            ) : (
              <View style={{ gap: space[2] }}>
                {shown.map((task) => (
                  <Animated.View key={task.id} entering={ENTER} exiting={LEAVE}>
                    <TaskRow task={task} list={tasks.lists.find((l) => l.id === task.list_id)} today={today} showDay={task.due_date !== today}
                      ticked={ticked.has(task.id)} onToggle={toggle} onOpen={() => router.navigate('/tasks')} />
                  </Animated.View>
                ))}
              </View>
            )}
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              {more > 0 ? <Text variant="label" muted>{more} more today</Text> : <View />}
              <Button label="Add a task" onPress={() => addTo('task')} />
            </View>
          </Card>

          <Card>
            <Text variant="small" weight="bold" style={LABEL}>{safe.ready ? (over ? 'OVER TODAY’S LIMIT' : 'SAFE TO SPEND TODAY') : 'SPENT TODAY'}</Text>
            <Text variant="title" style={[NUM, over && { color: colors.red }]} adjustsFontSizeToFit numberOfLines={1}>{formatPeso(safe.ready ? Math.abs(safe.safeToday) : safe.spentToday)}</Text>
            {safe.ready ? (
              <>
                <Bar pct={safe.dailyLimit === 0 ? (safe.spentToday > 0 ? 100 : 0) : pct(safe.spentToday, safe.dailyLimit)} color={over ? colors.red : colors.inkBlue} label="Today's limit used" />
                <Text variant="label" muted style={NUM}>{formatPeso(safe.spentToday)} spent of {formatPeso(safe.dailyLimit)} · {formatPeso(Math.max(0, safe.leftThisMonth))} left this month</Text>
              </>
            ) : <Text variant="label" muted>Set a monthly budget in Money to see what’s safe to spend each day.</Text>}
            {nextBill && (
              <View style={[styles.row, { padding: space[3], borderRadius: radius.md, backgroundColor: colors.raised }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text weight="semi">{nextBill.expense.name}</Text>
                  <Text variant="label" style={{ color: nextBill.dueIn < 0 ? colors.red : nextBill.dueIn <= 3 ? colors.amber : colors.muted }}>{dueLabel(nextBill)}</Text>
                </View>
                <Text weight="bold" style={NUM}>{formatPeso(nextBill.expense.amount_centavos)}</Text>
              </View>
            )}
            <View style={{ alignItems: 'flex-end' }}><Button label="Log an expense" onPress={() => addTo('expense')} /></View>
          </Card>

          <Card>
            <Text variant="small" weight="bold" style={LABEL}>FOOD</Text>
            <Text variant="title" style={NUM}>{formatKcal(food.kcal)}<Text muted>{health.goals?.kcal_target ? ` of ${formatKcal(health.goals.kcal_target)} kcal` : ' kcal'}</Text></Text>
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <Text weight="semi">Protein</Text>
              <Text variant="label" muted style={NUM}>{Math.round(food.protein)}{health.goals?.protein_target_g ? ` / ${health.goals.protein_target_g}` : ''} g</Text>
            </View>
            <Bar pct={pct(food.protein, health.goals?.protein_target_g)} color={colors.tongue} label="Protein eaten" />
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <Text weight="semi">Water</Text>
              <Text variant="label" muted style={NUM}>{glasses} of {glassGoal} glasses</Text>
            </View>
            <Bar pct={pct(glasses, glassGoal)} color={colors.inkBlue} label="Water drunk" />
            <View style={{ alignItems: 'flex-end' }}><Button label="Log food" onPress={() => addTo('food')} /></View>
          </Card>

          <Card>
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <Text variant="small" weight="bold" style={LABEL}>WORKOUT</Text>
              <Text variant="label" muted style={NUM}>{week.workoutsDone} of {week.workoutsPlanned} this week</Text>
            </View>
            <Text variant="title" style={workout.session?.done_at ? { color: colors.inkBlue } : undefined}>{workoutName ?? (program.kind === 'bjj' ? program.name : 'Rest day')}</Text>
            <Text variant="label" muted>
              {fromProgram ? (program.kind === 'lift' ? `Day ${program.day} of My program · ${program.exercises} exercises` : program.note ?? 'Recovery counts too.')
                : workout.session?.done_at ? 'Done. Nice work.' : plan.length ? `${plan.length} exercise${plan.length === 1 ? '' : 's'} · about ${routineMinutes(plan)} min` : workout.session ? 'Under way' : 'Recovery counts too.'}
            </Text>
            <WeekDots days={strip} size={30} />
            <View style={{ alignItems: 'flex-end' }}>
              <Button primary={!!workoutName && !workout.session?.done_at} label={workout.session?.done_at || !workoutName ? 'Open Workouts' : workout.session?.started_at ? 'Continue' : 'Start'} onPress={startWorkoutTile} />
            </View>
          </Card>

          <Press accessibilityRole="button" accessibilityLabel="Open the weekly review" onPress={() => setReviewing(true)} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
            <Card>
              <View style={[styles.row, { justifyContent: 'space-between' }]}>
                <Text variant="small" weight="bold" style={LABEL}>THIS WEEK</Text>
                <Text variant="label" weight="semi" style={{ color: colors.inkBlue }}>Weekly review</Text>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space[3] }}>
                <Figure label="Tasks done" value={String(week.tasksDone)} />
                <Figure label="Spent" value={pesos(week.spent)} />
                <Figure label="Workouts" value={`${week.workoutsDone} of ${week.workoutsPlanned}`} />
                <Figure label="Food streak" value={`${week.streak} day${week.streak === 1 ? '' : 's'}`} />
              </View>
            </Card>
          </Press>

          <View style={{ alignItems: 'center', gap: space[3], paddingTop: space[2] }}>
            <Text variant="label" muted style={{ textAlign: 'center' }}>Export your data or check the weekly backup from Dirary on the web, under Your data.</Text>
            <Button label="Widget check" onPress={() => setCheckingWidgets(true)} />
            <Button label="Sign out" onPress={() => { signOutAndClear(); }} />
          </View>
        </View>
      </ScrollView>

      {offer && (
        <Animated.View entering={ENTER} exiting={LEAVE} accessibilityLiveRegion="polite"
          style={{ position: 'absolute', left: space[4], right: space[4], bottom: insets.bottom + 100, flexDirection: 'row', alignItems: 'center', gap: space[3],
            paddingLeft: space[5], paddingRight: space[2], paddingVertical: space[2], borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.raised }}>
          <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>
            Log <Text variant="label" weight="bold" style={NUM}>{formatPeso(offer.amount)}</Text> for {offer.note}?
          </Text>
          <Press accessibilityRole="button" onPress={logOffer}
            style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: space[4], borderRadius: radius.pill, backgroundColor: colors.inkBlue, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
            <Text variant="label" weight="bold" style={{ color: colors.onInkBlue }}>Log it</Text>
          </Press>
          <Press accessibilityRole="button" accessibilityLabel="Not now" onPress={() => setOffer(null)} hitSlop={4} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Text weight="semi" muted>✕</Text>
          </Press>
        </Animated.View>
      )}
      {logging && (
        <TransactionEditor tx={null} direction="out" amount={logging.amount} note={logging.note}
          accounts={logging.accounts} categories={logging.categories} onClose={() => setLogging(null)} />
      )}
      {checkingWidgets && <WidgetCheck onClose={() => setCheckingWidgets(false)} />}
      {reviewing && (
        <WeekReviewScreen tasks={tasks.tasks} transactions={money.transactions} categories={money.categories} logs={health.logs}
          routines={workouts.routines} sessions={workouts.sessions} onClose={() => setReviewing(false)} />
      )}
      <Confetti shot={shot} origin={origin} />
    </View>
  );
}

function Win({ win, loading }: { win: DayWin; loading: boolean }) {
  const state = loading || !win.applies ? 'off' : win.done ? 'done' : win.key === 'money' ? 'over' : 'open';
  const say = state === 'done' ? (win.key === 'money' ? 'on track' : 'done') : state === 'over' ? 'over the limit' : state === 'open' ? 'not done yet' : '';
  return (
    <View accessible accessibilityLabel={`${win.label}: ${loading ? 'loading' : win.value}${say ? `, ${say}` : ''}`}
      style={{ flexBasis: '47%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: space[2], padding: space[3], borderRadius: radius.lg, backgroundColor: colors.raised, opacity: state === 'off' ? 0.55 : 1 }}>
      <View style={{
        width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: state === 'done' ? 0 : 2,
        borderColor: state === 'over' ? colors.red : state === 'open' ? colors.inkBlue : colors.line, backgroundColor: state === 'done' ? colors.inkBlue : 'transparent',
      }}>
        {state === 'done' && <Svg width={14} height={14} viewBox="0 0 16 16"><Path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke={colors.onInkBlue} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>}
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="small" weight="semi" muted>{win.label}</Text>
        <Text variant="label" weight="bold" numberOfLines={1} style={[NUM, state === 'over' && { color: colors.red }]}>{loading ? '…' : win.value}</Text>
      </View>
    </View>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '50%', gap: 2 }}>
      <Text variant="label" muted>{label}</Text>
      <Text variant="heading" style={NUM} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}


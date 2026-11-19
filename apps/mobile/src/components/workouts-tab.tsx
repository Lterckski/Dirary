/** Health → Workouts on the phone: today's workout, the week, your program (gym or home), steps, progress and routines. */
import { useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { TextInput, View } from 'react-native';
import { Press } from '@/components/press';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { colors, space } from '@dirary/ui';
import {
  STARTER_EXERCISES, WEEKDAY_NAME, WEEKDAY_SHORT, WEEK_ORDER, changeLabel, exerciseProgress, formatKg, lastSets, loggedExercises, localDate, parseKg, planOf,
  routineMinutes, setsLabel, targetLabel, todaysWorkout, weekCount, weekStrip, weekdaysLabel, weekdaysOf, weekdaysText, weightSeries, workoutCoach,
  isProgramRoutine,
  type Exercise, type PlanItem, type ProgressPoint, type Routine, type StarterExercise, type WorkoutSession,
} from '@dirary/shared';

import { Mascot } from '@/components/mascot';
import { Chip } from '@/components/task-bits';
import { Field, Sheet, Wrap } from '@/components/task-editor';
import { Button, Card, Text, styles } from '@/components/ui';
import { WeekDots } from '@/components/week-dots';
import { WorkoutSessionScreen } from '@/components/workout-session';
import { StepsCard } from '@/components/steps-card';
import { ExercisePicker } from '@/components/exercise-picker';
import { ProgramCard } from '@/components/program-card';
import { addExercise, logWeight, removeRoutine, saveRoutine, startProgramDay, startWorkout, useWorkoutsStore } from '@/lib/workouts-store';

const LABEL = { letterSpacing: 1.4, color: colors.muted } as const;
const NUM = { fontVariant: ['tabular-nums' as const] };
type Open = { kind: 'routine'; routine: Routine | null } | { kind: 'weight' } | { kind: 'session'; id: string } | null;

export function WorkoutsTab() {
  const store = useWorkoutsStore();
  const { exercises, sessions, sets, metrics, loading } = store;
  // Program days run on hidden routines; they're started from My program, not listed as your routines.
  const routines = useMemo(() => store.routines.filter((r) => !isProgramRoutine(r)), [store.routines]);
  const [open, setOpen] = useState<Open>(null);
  // Today's Start button starts the program day, then opens it here with ?session=.
  const { session: opening } = useLocalSearchParams<{ session?: string }>();
  useEffect(() => { if (opening) setOpen({ kind: 'session', id: opening }); }, [opening]);
  const today = localDate();
  const { routine, session } = useMemo(() => todaysWorkout(store.routines, sessions, today), [store.routines, sessions, today]);
  const coach = workoutCoach({ routine, session, exercises, sets, sessions });
  const week = useMemo(() => weekStrip(routines, sessions, today), [routines, sessions, today]);
  const count = weekCount(week);
  const plan = routine ? planOf(routine) : [];
  const name = session?.name ?? routine?.name ?? null;
  const start = async (r: Routine | null, existing: WorkoutSession | null) => setOpen({ kind: 'session', id: (await startWorkout(r, existing)).id });
  const running = open?.kind === 'session' ? sessions.find((s) => s.id === open.id) ?? null : null;

  if (loading) return null;
  return (
    <>
      <Card style={{ borderRadius: 28 }}>
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <Text variant="small" weight="bold" style={LABEL}>{name ? `TODAY · ${name.toUpperCase()}` : 'TODAY · REST DAY'}</Text>
          {plan.length > 0 && !session?.done_at && <Text variant="label" muted>About {routineMinutes(plan)} min</Text>}
        </View>
        {plan.map((item) => {
          const last = lastSets(item.exercise_id, sets, sessions, session?.id);
          return (
            <View key={item.exercise_id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52, paddingVertical: space[2], paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text weight="semi">{exercises.find((e) => e.id === item.exercise_id)?.name ?? 'Exercise'}</Text>
                <Text variant="label" muted>{last.length ? `Last time: ${setsLabel(last)}` : 'First time'}</Text>
              </View>
              <Text variant="label" weight="bold" style={[NUM, { color: colors.inkBlue }]}>{targetLabel(item)}</Text>
            </View>
          );
        })}
        {session?.done_at ? (
          <Button label="See today's sets" onPress={() => setOpen({ kind: 'session', id: session.id })} />
        ) : name ? (
          <Button primary label={session?.started_at ? `Continue ${name}` : `Start ${name}`} onPress={() => start(routine, session)} />
        ) : (
          <Wrap>
            {routines.map((r) => <Chip key={r.id} label={`Start ${r.name}`} onPress={() => start(r, null)} />)}
            <Chip dashed label="Start an empty workout" onPress={() => start(null, null)} />
          </Wrap>
        )}
        <View style={styles.row}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.inkBlue, alignItems: 'center', justifyContent: 'center' }}><Mascot mood={coach.mood} size={48} /></View>
          <Text style={{ flex: 1 }} accessibilityLiveRegion="polite">{coach.line}</Text>
        </View>
      </Card>

      <Card style={{ borderRadius: 28 }}>
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <Text variant="small" weight="bold" style={LABEL}>THIS WEEK</Text>
          <Text variant="label" muted style={NUM}>{count.done} of {count.planned} workout{count.planned === 1 ? '' : 's'}</Text>
        </View>
        <WeekDots days={week} />
      </Card>

      <ProgramCard sessions={sessions} onStart={async (place, day) => { const s = await startProgramDay(place, day); if (s) setOpen({ kind: 'session', id: s.id }); }} />

      <StepsCard />

      <ProgressCard exercises={exercises} sets={sets} sessions={sessions} metrics={metrics} onLogWeight={() => setOpen({ kind: 'weight' })} />

      <Card style={{ borderRadius: 28 }}>
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <Text variant="small" weight="bold" style={LABEL}>ROUTINES</Text>
          <Chip label="New routine" onPress={() => setOpen({ kind: 'routine', routine: null })} />
        </View>
        {routines.length === 0 && <Text muted>Make a routine, pick its days, and each one shows up in Tasks as well.</Text>}
        {routines.map((r) => (
          <Press key={r.id} accessibilityRole="button" accessibilityHint="Edit this routine" onPress={() => setOpen({ kind: 'routine', routine: r })}
            style={({ pressed }) => ({ minHeight: 56, paddingVertical: space[2], paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, justifyContent: 'center', gap: 2, opacity: pressed ? 0.8 : 1 })}>
            <Text weight="semi">{r.name}</Text>
            <Text variant="label" muted>{weekdaysLabel(weekdaysOf(r))} · {planOf(r).length} exercise{planOf(r).length === 1 ? '' : 's'}</Text>
          </Press>
        ))}
      </Card>

      {open?.kind === 'routine' && <RoutineSheet routine={open.routine} exercises={exercises} count={routines.length} onClose={() => setOpen(null)} />}
      {open?.kind === 'weight' && <WeightSheet last={weightSeries(metrics).at(-1)?.value ?? null} onClose={() => setOpen(null)} />}
      {running && <WorkoutSessionScreen session={running} store={store} onClose={() => setOpen(null)} />}
    </>
  );
}

function ProgressCard({ exercises, sets, sessions, metrics, onLogWeight }: Pick<ReturnType<typeof useWorkoutsStore>, 'exercises' | 'sets' | 'sessions' | 'metrics'> & { onLogWeight: () => void }) {
  const logged = useMemo(() => loggedExercises(exercises, sets), [exercises, sets]);
  const [pick, setPick] = useState<string | null>(null);
  const shown = pick === 'weight' || logged.some((e) => e.id === pick) ? pick! : logged[0]?.id ?? 'weight';
  const series = shown === 'weight' ? { points: weightSeries(metrics), unit: 'kg' as const } : exerciseProgress(shown, sets, sessions);
  const last = series.points.at(-1);
  const label = shown === 'weight' ? 'Body weight' : logged.find((e) => e.id === shown)?.name ?? '';
  return (
    <Card style={{ borderRadius: 28 }}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text variant="small" weight="bold" style={LABEL}>PROGRESS</Text>
        <Chip label="Log weight" onPress={onLogWeight} />
      </View>
      <Wrap>
        {logged.slice(0, 5).map((e) => <Chip key={e.id} label={e.name} active={shown === e.id} onPress={() => setPick(e.id)} />)}
        <Chip label="Body weight" active={shown === 'weight'} onPress={() => setPick('weight')} />
      </Wrap>
      {last ? (
        <>
          <View style={[styles.row, { alignItems: 'baseline', gap: space[2] }]}>
            <Text variant="heading" style={NUM}>{formatKg(last.value)} {series.unit}</Text>
            <Text variant="label" weight="semi" style={{ color: colors.inkBlue }}>{changeLabel(series.points, series.unit)}</Text>
          </View>
          <LineChart points={series.points} label={`${label}: from ${formatKg(series.points[0]!.value)} to ${formatKg(last.value)} ${series.unit}`} />
        </>
      ) : (
        <Text muted>{shown === 'weight' ? 'Log your weight now and then to see it change here.' : 'Finish a workout to see your progress here.'}</Text>
      )}
    </Card>
  );
}

/** A small line chart: gridlines with values, one point per day, the latest one filled. */
export function LineChart({ points, label }: { points: readonly ProgressPoint[]; label: string }) {
  const W = 300, H = 128, L = 34, R = 292, T = 10, B = 104;
  const values = points.map((p) => p.value);
  let lo = Math.min(...values), hi = Math.max(...values);
  if (hi - lo < 1) { lo -= 1; hi += 1; }
  const step = niceStep((hi - lo) / 3);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const x = (i: number) => (points.length === 1 ? (L + R) / 2 : L + (i * (R - L)) / (points.length - 1));
  const y = (v: number) => B - ((v - lo) / (hi - lo)) * (B - T);
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  const every = Math.ceil(points.length / 5);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        {ticks.map((v) => (
          <G key={v}>
            <Line x1={L} x2={R} y1={y(v)} y2={y(v)} stroke={colors.line} strokeWidth={1} />
            <SvgText x={L - 6} y={y(v) + 4} fontSize={11} fill={colors.muted} textAnchor="end">{formatKg(v)}</SvgText>
          </G>
        ))}
        <Path d={points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')} fill="none" stroke={colors.inkBlue} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => <Circle key={p.date} cx={x(i)} cy={y(p.value)} r={i === points.length - 1 ? 5 : 3.5} fill={i === points.length - 1 ? colors.inkBlue : colors.surface} stroke={colors.inkBlue} strokeWidth={2} />)}
        {points.map((p, i) => (i % every === 0 || i === points.length - 1) && (
          <SvgText key={`t${p.date}`} x={x(i)} y={H - 4} fontSize={11} fill={colors.muted} textAnchor={points.length > 1 && i === points.length - 1 ? 'end' : i === 0 && points.length > 1 ? 'start' : 'middle'}>
            {new Date(`${p.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 0.1)));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

function RoutineSheet({ routine, exercises, count, onClose }: { routine: Routine | null; exercises: readonly Exercise[]; count: number; onClose: () => void }) {
  const [name, setName] = useState(routine?.name ?? '');
  const [days, setDays] = useState<number[]>(routine ? weekdaysOf(routine) : []);
  const [items, setItems] = useState<PlanItem[]>(routine ? planOf(routine) : []);
  const [known, setKnown] = useState<Exercise[]>([...exercises]);
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const nameOf = (id: string) => known.find((e) => e.id === id)?.name ?? 'Exercise';
  const change = (i: number, patch: Partial<PlanItem>) => setItems((all) => all.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  async function save() {
    if (!name.trim()) return setProblem('Give the routine a name, like “Push day”.');
    if (items.length === 0) return setProblem('Add at least one exercise.');
    onClose();
    await saveRoutine({ name: name.trim().slice(0, 40), plan: items, weekdays: weekdaysText(days) }, routine, count);
  }
  const numberInput = (label: string, value: string, onText: (t: string) => void, placeholder?: string) => (
    <TextInput accessibilityLabel={label} style={[styles.input, { width: 60, textAlign: 'center' }]} value={value} onChangeText={onText} keyboardType="number-pad" placeholder={placeholder} placeholderTextColor={colors.faint} />
  );

  return (
    <Sheet title={routine ? 'Edit routine' : 'New routine'} onClose={onClose}>
      <Field label="Name"><TextInput accessibilityLabel="Routine name" style={styles.input} value={name} maxLength={40} onChangeText={setName} placeholder="Push day" placeholderTextColor={colors.faint} /></Field>
      <Field label="Days">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {WEEK_ORDER.map((d) => {
            const on = days.includes(d);
            return (
              <Press key={d} accessibilityRole="button" accessibilityLabel={WEEKDAY_NAME[d]} accessibilityState={{ selected: on }} onPress={() => setDays((all) => (on ? all.filter((x) => x !== d) : [...all, d]))}
                style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: on ? colors.inkBlue : colors.line, backgroundColor: on ? colors.inkBlue : colors.raised }}>
                <Text weight="bold" style={{ color: on ? colors.onInkBlue : colors.text }}>{WEEKDAY_SHORT[d]}</Text>
              </Press>
            );
          })}
        </View>
        <Text variant="label" muted>Each planned day shows up in Tasks, in a Workouts list.</Text>
      </Field>
      <Field label="Exercises">
        {items.map((it, i) => (
          <View key={it.exercise_id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 52 }}>
            <Text weight="semi" style={{ flex: 1 }} numberOfLines={2}>{nameOf(it.exercise_id)}</Text>
            {numberInput('Sets', String(it.sets), (t) => change(i, { sets: Math.max(1, Math.min(20, Number(t) || 1)) }))}
            <Text muted>×</Text>
            {numberInput('Reps, blank for as many as you can', it.reps === null ? '' : String(it.reps), (t) => change(i, { reps: t.trim() ? Math.max(1, Math.min(100, Number(t) || 1)) : null }), 'max')}
            <Press accessibilityRole="button" accessibilityLabel={`Remove ${nameOf(it.exercise_id)}`} onPress={() => setItems((all) => all.filter((_, j) => j !== i))} hitSlop={6} style={{ width: 36, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Text weight="semi" muted>✕</Text>
            </Press>
          </View>
        ))}
        {adding ? (
          <ExercisePicker exercises={known} onCancel={() => setAdding(false)} onPick={(ex) => {
            setKnown((all) => (all.some((e) => e.id === ex.id) ? all : [...all, ex]));
            if (!items.some((it) => it.exercise_id === ex.id)) setItems((all) => [...all, { exercise_id: ex.id, sets: 3, reps: 10 }]);
            setAdding(false);
          }} />
        ) : (
          <Press accessibilityRole="button" onPress={() => setAdding(true)} style={{ minHeight: 48, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Text weight="semi" muted>+ Add an exercise</Text>
          </Press>
        )}
      </Field>
      {problem && <Text variant="label" style={{ color: colors.red }} accessibilityRole="alert">{problem}</Text>}
      <Button primary label="Save" onPress={save} />
      {routine && (
        <Press accessibilityRole="button" onPress={() => { onClose(); removeRoutine(routine); }} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Text weight="semi" style={{ color: colors.red }}>Delete routine</Text>
        </Press>
      )}
    </Sheet>
  );
}

function WeightSheet({ last, onClose }: { last: number | null; onClose: () => void }) {
  const [kg, setKg] = useState(last ? formatKg(last) : '');
  const [problem, setProblem] = useState<string | null>(null);
  async function save() {
    const value = parseKg(kg);
    if (!value || value < 20 || value > 400) return setProblem('Enter your weight in kilograms, like 68.5.');
    onClose();
    await logWeight(Math.round(value * 10) / 10);
  }
  return (
    <Sheet title="Log your weight" onClose={onClose}>
      <Field label="Weight today (kg)"><TextInput accessibilityLabel="Weight in kilograms" style={[styles.input, { width: 140 }]} value={kg} onChangeText={setKg} keyboardType="decimal-pad" selectTextOnFocus autoFocus /></Field>
      {problem && <Text variant="label" style={{ color: colors.red }} accessibilityRole="alert">{problem}</Text>}
      <Button primary label="Save" onPress={save} />
    </Sheet>
  );
}


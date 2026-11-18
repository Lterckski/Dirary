/** A workout in progress, full screen: one exercise at a time, sets prefilled from last time, and a rest timer. */
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';
import { colors, space } from '@dirary/ui';
import { formatKg, lastSets, parseKg, planOf, prefill, setsLabel, targetLabel, type PlanItem, type WorkoutSession } from '@dirary/shared';

import { Chip } from '@/components/task-bits';
import { Button, Text, styles } from '@/components/ui';
import { ExercisePicker } from '@/components/exercise-picker';
import { PopUp } from '@/components/pop-up';
import { cancelRestAlert, scheduleRestAlert } from '@/lib/reminders';
import { finishWorkout, logSet, unlogSet, type useWorkoutsStore } from '@/lib/workouts-store';

const REST_SECONDS = 90;
const NUM = { fontVariant: ['tabular-nums' as const] };
type Store = ReturnType<typeof useWorkoutsStore>;

export function WorkoutSessionScreen({ session, store, onClose }: { session: WorkoutSession; store: Store; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const routine = store.routines.find((r) => r.id === session.routine_id) ?? null;
  const logged = store.sets.filter((s) => s.session_id === session.id);
  const [extra, setExtra] = useState<PlanItem[]>([]);
  const items = useMemo(() => {
    const list: PlanItem[] = routine ? planOf(routine) : [];
    for (const s of logged) if (!list.some((i) => i.exercise_id === s.exercise_id)) list.push({ exercise_id: s.exercise_id, sets: 1, reps: null });
    for (const e of extra) if (!list.some((i) => i.exercise_id === e.exercise_id)) list.push(e);
    return list;
  }, [routine, logged, extra]);
  const [at, setAt] = useState(0);
  const [adding, setAdding] = useState(items.length === 0);
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const elapsed = useClock(session.started_at);
  const item = items[Math.min(at, Math.max(0, items.length - 1))];
  const next = items[at + 1];
  const nameOf = (id: string) => store.exercises.find((e) => e.id === id)?.name ?? 'Exercise';

  const rest = (end: number | null) => {
    setRestEnd(end);
    if (end) scheduleRestAlert((end - Date.now()) / 1000).catch(() => {});
    else cancelRestAlert().catch(() => {});
  };
  async function finish() {
    rest(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onClose();
    await finishWorkout(session);
  }

  return (
    <PopUp onClose={onClose} navigationBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top + space[3] }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[5] }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to Health" onPress={onClose} hitSlop={4}
            style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={20} height={20} viewBox="0 0 24 24"><Path d="M15 5l-7 7 7 7" fill="none" stroke={colors.text} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text variant="small" weight="bold" style={{ letterSpacing: 1.4, color: colors.muted }}>{session.name.toUpperCase()}</Text>
            <Text weight="semi" style={NUM} accessibilityLabel={`Time so far ${elapsed}`}>{elapsed}</Text>
          </View>
          {session.done_at ? <Text muted>Done</Text> : <Button primary label="Finish" onPress={finish} />}
        </View>

        <ScrollView contentContainerStyle={{ padding: space[5], gap: space[4], paddingBottom: insets.bottom + space[8] }} keyboardShouldPersistTaps="handled">
          {items.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
              {items.map((i, n) => <Chip key={i.exercise_id} label={nameOf(i.exercise_id)} active={n === at} onPress={() => setAt(n)} />)}
            </ScrollView>
          )}

          {item && <ExerciseCard key={item.exercise_id} store={store} session={session} item={item} index={at} total={items.length} name={nameOf(item.exercise_id)} onLogged={() => rest(Date.now() + REST_SECONDS * 1000)} />}

          {restEnd && <RestTimer end={restEnd} onChange={rest} />}

          {next && (
            <Pressable accessibilityRole="button" onPress={() => setAt(at + 1)}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 })}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="label" muted>Up next</Text>
                <Text weight="semi">{nameOf(next.exercise_id)} · {targetLabel(next)}</Text>
              </View>
              <Svg width={20} height={20} viewBox="0 0 24 24"><Path d="M9 5l7 7-7 7" fill="none" stroke={colors.muted} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
            </Pressable>
          )}

          {adding ? (
            <ExercisePicker exercises={store.exercises} onCancel={items.length ? () => setAdding(false) : undefined}
              onPick={(ex) => { setExtra((all) => [...all, { exercise_id: ex.id, sets: 3, reps: 10 }]); setAt(items.length); setAdding(false); }} />
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setAdding(true)} style={{ minHeight: 52, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
              <Text weight="semi" muted>+ Add an exercise</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </PopUp>
  );
}

function ExerciseCard({ store, session, item, index, total, name, onLogged }: {
  store: Store; session: WorkoutSession; item: PlanItem; index: number; total: number; name: string; onLogged: () => void;
}) {
  const last = useMemo(() => lastSets(item.exercise_id, store.sets, store.sessions, session.id), [item.exercise_id, store.sets, store.sessions, session.id]);
  const logged = store.sets.filter((s) => s.session_id === session.id && s.exercise_id === item.exercise_id);
  const [rows, setRows] = useState(() => prefill(item, last).map((v) => ({ kg: formatKg(v.weight_kg), reps: String(v.reps) })));
  const count = Math.max(rows.length, ...logged.map((s) => s.set_index + 1));
  const edit = (i: number, field: 'kg' | 'reps', value: string) => setRows((all) => {
    const copy = [...all];
    while (copy.length <= i) copy.push(copy[copy.length - 1] ?? { kg: '0', reps: '10' });
    copy[i] = { ...copy[i]!, [field]: value };
    return copy;
  });
  async function tick(i: number) {
    const done = logged.find((s) => s.set_index === i);
    Haptics.selectionAsync().catch(() => {});
    if (done) return unlogSet(done);
    const row = rows[i] ?? rows[rows.length - 1] ?? { kg: '0', reps: '10' };
    const kg = parseKg(row.kg) ?? 0;
    const reps = Math.round(Number(row.reps));
    if (!Number.isFinite(reps) || reps < 0 || reps > 1000) return;
    onLogged();
    await logSet(session, item.exercise_id, i, kg, reps);
  }

  const field = (label: string, value: string, unit: string, done: boolean, onText: (t: string) => void, kind: 'decimal-pad' | 'number-pad') => (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, minHeight: 48, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: done ? 'transparent' : colors.line, backgroundColor: done ? 'transparent' : colors.raised }}>
      <TextInput accessibilityLabel={label} value={value} editable={!done} onChangeText={onText} keyboardType={kind} selectTextOnFocus
        style={[NUM, { minWidth: 44, textAlign: 'right', color: done ? colors.faint : colors.text, fontSize: 18, fontWeight: '700', paddingVertical: 10 }]} />
      <Text variant="label" muted>{unit}</Text>
    </View>
  );

  return (
    <View style={{ borderRadius: 28, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: space[5], gap: space[3] }}>
      <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'baseline' }]}>
        <Text variant="title" style={{ flexShrink: 1 }} accessibilityRole="header">{name}</Text>
        {total > 1 && <Text variant="label" muted>{index + 1} of {total}</Text>}
      </View>
      <Text variant="label" muted>{last.length ? `Last time: ${setsLabel(last)}` : 'First time. Pick a weight you can do with good form.'}</Text>
      {Array.from({ length: count }, (_, i) => {
        const done = logged.find((s) => s.set_index === i);
        const row = rows[i] ?? rows[rows.length - 1] ?? { kg: '0', reps: '10' };
        return (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 56 }}>
            <Text variant="label" weight="semi" muted style={{ width: 44 }}>Set {i + 1}</Text>
            {field(`Set ${i + 1} weight in kilograms`, done ? formatKg(done.weight_kg) : row.kg, 'kg', !!done, (t) => edit(i, 'kg', t), 'decimal-pad')}
            <Text style={{ color: colors.faint }}>×</Text>
            {field(`Set ${i + 1} reps`, done ? String(done.reps) : row.reps, 'reps', !!done, (t) => edit(i, 'reps', t), 'number-pad')}
            <View style={{ flex: 1 }} />
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !!done }} accessibilityLabel={`Set ${i + 1} done`} onPress={() => tick(i)} hitSlop={4}
              style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 30, height: 30, borderRadius: 10, borderWidth: done ? 0 : 2.5, borderColor: colors.inkBlue, backgroundColor: done ? colors.inkBlue : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {done && <Svg width={16} height={16} viewBox="0 0 16 16"><Path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke={colors.onInkBlue} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>}
              </View>
            </Pressable>
          </View>
        );
      })}
      <Pressable accessibilityRole="button" onPress={() => setRows((all) => [...all, all[all.length - 1] ?? { kg: '0', reps: '10' }])}
        style={{ minHeight: 44, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="label" weight="semi" muted>+ Add a set</Text>
      </Pressable>
    </View>
  );
}

function RestTimer({ end, onChange }: { end: number; onChange: (end: number | null) => void }) {
  const [nowMs, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((end - nowMs) / 1000));
  useEffect(() => {
    if (left !== 0) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    const t = setTimeout(() => onChange(null), 1500);
    return () => clearTimeout(t);
  }, [left === 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const C = 2 * Math.PI * 52;
  return (
    <View style={{ alignItems: 'center', gap: space[3], borderRadius: 28, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: space[5] }}>
      <Text variant="small" weight="bold" style={{ letterSpacing: 1.4, color: colors.muted }}>{left === 0 ? 'NEXT SET' : 'REST'}</Text>
      <View style={{ width: 132, height: 132, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={132} height={132} viewBox="0 0 132 132" style={{ position: 'absolute' }}>
          <Circle cx={66} cy={66} r={52} fill="none" stroke={colors.line} strokeWidth={10} />
          <Circle cx={66} cy={66} r={52} fill="none" stroke={colors.inkBlue} strokeWidth={10} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, left / REST_SECONDS))} transform="rotate(-90 66 66)" />
        </Svg>
        <Text variant="title" style={NUM} accessibilityRole="timer">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        <Chip label="+30 s" onPress={() => onChange(end + 30_000)} />
        <Chip label="Skip rest" onPress={() => onChange(null)} />
      </View>
    </View>
  );
}

function useClock(since: string | null): string {
  const [nowMs, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!since) return '0:00';
  const s = Math.max(0, Math.floor((nowMs - Date.parse(since)) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
}



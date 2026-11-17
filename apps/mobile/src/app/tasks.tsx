import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space } from '@dirary/ui';
import {
  GROUPINGS, GROUPING_LABEL, PRIORITIES, PRIORITY_LABEL, RECURRENCE_LABEL, TaskDraft, addDays, amountInTask, dayLabel, formatPeso, taskWithoutAmount, defaultReminder, doneView, groupTasks, listView, localDate, parseQuickAdd,
  remindAt, timeLabel, todayCoach, todayView, upcomingView, type Account, type Category, type Grouping, type Priority, type Task,
} from '@dirary/shared';

import { Mascot } from '@/components/mascot';
import { Confetti } from '@/components/confetti';
import { Chip, Group, Segmented, TaskRow } from '@/components/task-bits';
import { CHECKED_MS, EASE_OUT, ENTER, LEAVE, MOVE } from '@/lib/motion';
import { ListsEditor, TaskEditor } from '@/components/task-editor';
import { TransactionEditor } from '@/components/money-editor';
import { isBillTask } from '@/lib/bill-tasks';
import { readAccounts, readCategories } from '@/lib/db';
import { Button, Card, Text, styles } from '@/components/ui';
import { requestReminderPermission } from '@/lib/reminders';
import { addList, addTask, removeList, removeTask, renameList, toggleTask, updateTask, useTasksStore } from '@/lib/tasks-store';
import { useAddRequest } from '@/lib/add-bus';

type View_ = 'today' | 'upcoming' | 'inbox' | 'done' | string; // any other string is a list id
const FIXED_VIEWS = ['today', 'upcoming', 'inbox', 'done'];
const toLocal = (iso: string) => localDate(new Date(iso));


export default function TasksScreen() {
  const { tasks, lists, loading, message } = useTasksStore();
  const params = useLocalSearchParams<{ add?: string }>();
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const [view, setView] = useState<View_>('today');
  const [text, setText] = useState('');
  // Urgency picked with the chips under the box. "!high" typed in the text wins, as on the web.
  const [urgency, setUrgency] = useState<Priority>(0);
  const [editing, setEditing] = useState<Task | null>(null);
  const [managing, setManaging] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [, setTick] = useState(0);
  const [grouping, setGroupingState] = useState<Grouping>('time');
  const today = localDate();

  // The chosen grouping is remembered on this phone.
  useEffect(() => {
    AsyncStorage.getItem('dirary.todayGrouping').then((saved) => {
      if ((GROUPINGS as readonly string[]).includes(saved ?? '')) setGroupingState(saved as Grouping);
    }).catch(() => {});
  }, []);
  const setGrouping = (g: Grouping) => {
    setGroupingState(g);
    AsyncStorage.setItem('dirary.todayGrouping', g).catch(() => {});
  };

  // Redraw once a minute so "in 3 hours" and the date stay right.
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), 60_000);
    return () => clearInterval(timer);
  }, []);
  // The floating + button: show the box if the Done tab hid it, then put the cursor there.
  useAddRequest('tasks', () => {
    setView((v) => (v === 'done' ? 'today' : v));
    setTimeout(() => input.current?.focus(), 300);
  });
  // The widget's + button opens the app with ?add=1: put the cursor in the box.
  useEffect(() => {
    if (params.add) setTimeout(() => input.current?.focus(), 300);
  }, [params.add]);

  const listIds = useMemo(() => new Set(lists.map((l) => l.id)), [lists]);
  const listById = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists]);
  const activeList = listById.get(view);
  useEffect(() => {
    if (!FIXED_VIEWS.includes(view) && !loading && !listIds.has(view)) setView('today');
  }, [view, loading, listIds]);

  const todayData = useMemo(() => todayView(tasks, today, toLocal), [tasks, today]);
  const coach = todayCoach(todayData, justCompleted);

  // Words in the text ("tomorrow 5pm !high every week") set the date, time, urgency and repeat.
  const read = parseQuickAdd(text, new Date(), lists);
  const priority: Priority = read.priority || urgency;
  const fallbackDate = view === 'today' ? today : view === 'upcoming' ? addDays(today, 1) : null;
  const dueDate = read.due_date ?? (read.due_time ? today : fallbackDate);
  const understood = [
    read.due_date || read.due_time ? [dueDate ? dayLabel(dueDate, today) : null, read.due_time ? timeLabel(read.due_time) : null].filter(Boolean).join(', ') : null,
    priority ? `${PRIORITY_LABEL[priority]} urgency` : null,
    read.recurrence ? RECURRENCE_LABEL[read.recurrence].toLowerCase() : null,
    read.list_id ? `in ${listById.get(read.list_id)?.name}` : null,
  ].filter(Boolean);

  async function add() {
    const draft = TaskDraft.safeParse({
      title: read.title, notes: null, due_date: dueDate, due_time: read.due_time, priority, list_id: read.list_id ?? activeList?.id ?? null,
      remind_at: remindAt(dueDate, read.due_time, defaultReminder(read.due_time)), recurrence_rule: read.recurrence,
    });
    if (!draft.success) return;
    setText('');
    setUrgency(0);
    if (draft.data.remind_at) await requestReminderPermission();
    await addTask(draft.data);
  }

  // Ticking a task: it shows as checked for a moment, then folds away as it is saved as done.
  // Ticking it again during that moment cancels. Leaving the screen saves anything still waiting.
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  // Ticking "Buy dog food ₱450" offers to log the ₱450; Log it opens the expense form, filled in.
  const [offer, setOffer] = useState<{ amount: number; note: string } | null>(null);
  const [logging, setLogging] = useState<{ amount: number; note: string; accounts: Account[]; categories: Category[] } | null>(null);
  useEffect(() => {
    if (!offer) return;
    const timer = setTimeout(() => setOffer(null), 10000);
    return () => clearTimeout(timer);
  }, [offer]);
  const insets = useSafeAreaInsets();
  async function logOffer() {
    if (!offer) return;
    const [accounts, categories] = await Promise.all([readAccounts(), readCategories()]);
    setOffer(null);
    setLogging({ ...offer, accounts, categories });
  }
  const waiting = useRef(new Map<string, { task: Task; timer: ReturnType<typeof setTimeout> }>());
  const lastDone = useRef(0);
  const untick = (id: string) => setTicked((cur) => { const next = new Set(cur); next.delete(id); return next; });
  useEffect(() => () => {
    for (const { task, timer } of waiting.current.values()) { clearTimeout(timer); toggleTask(task); }
    waiting.current.clear();
  }, []);
  // Saving is asynchronous here, so a row stays "ticked" until the saved change reaches the list; that way
  // it never flashes back to unchecked, and it still carries its fold-away animation as it leaves.
  useEffect(() => {
    setTicked((cur) => {
      const keep = [...cur].filter((id) => waiting.current.has(id));
      return keep.length === cur.size ? cur : new Set(keep);
    });
  }, [tasks]);

  function toggle(task: Task) {
    if (task.status === 'done') return toggleTask(task);
    const pending = waiting.current.get(task.id);
    if (pending) {
      clearTimeout(pending.timer);
      waiting.current.delete(task.id);
      untick(task.id);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setJustCompleted(true);
    setTimeout(() => setJustCompleted(false), 2500);
    setTicked((cur) => new Set(cur).add(task.id));
    const timer = setTimeout(async () => {
      waiting.current.delete(task.id);
      lastDone.current = Date.now();
      await toggleTask(task);
      const amount = amountInTask(task.title);
      if (amount && !(await isBillTask(task))) setOffer({ amount, note: taskWithoutAmount(task.title) });
    }, CHECKED_MS);
    waiting.current.set(task.id, { task, timer });
  }

  // New tasks (from the box or another device) slide in; the ones there on open don't.
  const known = useRef<Set<string> | null>(null);
  const fresh = useRef(new Set<string>());
  if (!loading) {
    if (!known.current) known.current = new Set(tasks.map((t) => t.id));
    for (const t of tasks) {
      if (known.current.has(t.id)) continue;
      known.current.add(t.id);
      fresh.current.add(t.id);
      setTimeout(() => fresh.current.delete(t.id), 800);
    }
  }

  // Finishing the last task due today: confetti out of the progress bar, a bigger buzz, the bar pops.
  const screenRef = useRef<ComponentRef<typeof View>>(null);
  const barRef = useRef<ComponentRef<typeof View>>(null);
  const [shot, setShot] = useState(0);
  const [origin, setOrigin] = useState<{ x: number; y: number; width: number } | null>(null);
  const barPop = useSharedValue(1);
  const barStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: barPop.value }] }));
  const remaining = todayData.overdue.length + todayData.dueToday.length;
  const before = useRef(remaining);
  useEffect(() => {
    const was = before.current;
    before.current = remaining;
    if (!(was > 0 && remaining === 0 && todayData.total > 0 && Date.now() - lastDone.current < 2000)) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    barPop.value = withSequence(withTiming(1.8, { duration: 140, easing: EASE_OUT, reduceMotion: ReduceMotion.System }), withSpring(1, { damping: 8, stiffness: 260, reduceMotion: ReduceMotion.System }));
    screenRef.current?.measureInWindow((sx, sy) => {
      barRef.current?.measureInWindow((bx, by, bw, bh) => {
        setOrigin({ x: bx - sx + bw / 2, y: by - sy + bh / 2, width: bw });
        setShot((n) => n + 1);
      });
    });
  }, [remaining, todayData.total, barPop]);

  const row = (task: Task, showDay: boolean) => {
    const isTicked = ticked.has(task.id);
    return (
      // The row folds away when it leaves (only after a tick, never on a view switch); the rows below glide up into its place.
      <Animated.View
        key={task.id}
        layout={MOVE}
        entering={fresh.current.has(task.id) ? ENTER : undefined}
        exiting={isTicked ? LEAVE : undefined}>
        <TaskRow task={task} list={task.list_id ? listById.get(task.list_id) : undefined} today={today} showDay={showDay} ticked={isTicked} onToggle={toggle} onOpen={setEditing} />
      </Animated.View>
    );
  };
  const empty = (line: string) => (
    <Card style={{ alignItems: 'center', paddingVertical: space[8] }}>
      <Mascot mood="sleepy" size={128} />
      <Text muted style={{ textAlign: 'center' }}>{line}</Text>
    </Card>
  );

  let body;
  if (loading) body = <Text muted>Loading your tasks…</Text>;
  else if (view === 'today') {
    const { overdue, dueToday, doneToday, total, done } = todayData;
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    body = (
      <>
        <Card>
          <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'baseline' }]}>
            <Text variant="hero" style={{ fontVariant: ['tabular-nums'] }}>
              {done}<Text variant="heading" muted> of {total} done</Text>
            </Text>
            <Text weight="bold" style={{ color: colors.inkBlue, fontVariant: ['tabular-nums'] }}>{percent}%</Text>
          </View>
          <Animated.View
            ref={barRef}
            accessibilityRole="progressbar" accessibilityLabel="Tasks done today" accessibilityValue={{ min: 0, max: 100, now: percent }}
            style={[{ height: 12, borderRadius: radius.pill, backgroundColor: colors.line, overflow: 'hidden' }, barStyle]}>
            <View style={{ width: `${percent}%`, height: 12, borderRadius: radius.pill, backgroundColor: colors.inkBlue }} />
          </Animated.View>
          <View style={styles.row}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.inkBlue, alignItems: 'center', justifyContent: 'center' }}>
              <Mascot mood={coach.mood} size={52} />
            </View>
            <Text style={{ flex: 1 }} accessibilityLiveRegion="polite">{coach.line}</Text>
          </View>
        </Card>
        {overdue.length > 0 && <Group title="Overdue" red>{overdue.map((t) => row(t, true))}</Group>}
        {dueToday.length > 0 && (
          <View style={[styles.row, { justifyContent: 'space-between', marginBottom: -space[2] }]}>
            <Text variant="small" weight="semi" style={{ color: colors.faint, letterSpacing: 1, paddingLeft: 4 }}>TODAY</Text>
            <Segmented label="Group by" options={GROUPINGS} labels={GROUPING_LABEL} value={grouping} onChange={setGrouping} />
          </View>
        )}
        {groupTasks(dueToday, grouping, lists).map((g) => <Group key={g.key} title={g.title} sub>{g.tasks.map((t) => row(t, false))}</Group>)}
        {doneToday.length > 0 && (
          <Pressable accessibilityRole="button" onPress={() => setView('done')} style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 4 }}>
            <Text variant="label" muted>{doneToday.length} done today · <Text variant="label" weight="semi" style={{ color: colors.inkBlue }}>View</Text></Text>
          </Pressable>
        )}
      </>
    );
  } else if (view === 'upcoming') {
    const groups = upcomingView(tasks, today);
    body = groups.length === 0
      ? empty('Nothing coming up in the next two weeks.')
      : groups.map((g) => <Group key={g.date} title={dayLabel(g.date, today)}>{g.tasks.map((t) => row(t, false))}</Group>);
  } else if (view === 'done') {
    const groups = doneView(tasks, today, toLocal);
    body = groups.length === 0
      ? empty('Nothing finished in the last 30 days yet. Tick a task and it lands here.')
      : (
        <>
          {groups.map((g) => <Group key={g.date} title={dayLabel(g.date, today)}>{g.tasks.map((t) => row(t, false))}</Group>)}
          <Text variant="label" muted>Showing the last 30 days. Untick a task to move it back.</Text>
        </>
      );
  } else {
    const { open, done } = listView(tasks, view === 'inbox' ? null : view, listIds);
    body = open.length === 0
      ? empty(done.length > 0 ? 'All done here. Finished tasks are in the Done tab.' : view === 'inbox' ? 'Your Inbox is empty. Tasks without a list land here.' : 'No tasks in this list yet.')
      : <Group title="To do">{open.map((t) => row(t, true))}</Group>;
  }

  return (
    <View ref={screenRef} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }} style={{ marginHorizontal: -space[5] }}>
          <View style={{ width: space[5] - space[2] }} />
          <Chip label="Today" active={view === 'today'} onPress={() => setView('today')} count={todayData.overdue.length + todayData.dueToday.length} />
          <Chip label="Upcoming" active={view === 'upcoming'} onPress={() => setView('upcoming')} />
          <Chip label="Inbox" active={view === 'inbox'} onPress={() => setView('inbox')} />
          {lists.map((l) => <Chip key={l.id} label={l.name} dot={l.color} active={view === l.id} onPress={() => setView(l.id)} />)}
          <Chip label="Done" active={view === 'done'} onPress={() => setView('done')} />
          <Chip dashed label="Edit lists" onPress={() => setManaging(true)} />
          <View style={{ width: space[5] - space[2] }} />
        </ScrollView>

        {view !== 'done' && <View style={{ gap: space[2] }}>
          <View style={styles.row}>
            <TextInput
              ref={input} accessibilityLabel="New task" style={[styles.input, { flex: 1 }]} value={text} maxLength={200}
              placeholder={activeList ? `Add to ${activeList.name}` : 'Add a task'} placeholderTextColor={colors.faint}
              onChangeText={setText} onSubmitEditing={add} returnKeyType="done" submitBehavior="submit" />
            <Button primary label="Add" disabled={!text.trim()} onPress={add} />
          </View>
          <View accessibilityRole="radiogroup" accessibilityLabel="Urgency" style={[styles.row, { flexWrap: 'wrap', gap: space[2] }]}>
            <Text variant="label" muted style={{ paddingLeft: 4 }}>Urgency</Text>
            {PRIORITIES.map((p) => (
              <Chip key={p} label={PRIORITY_LABEL[p]} active={priority === p} dot={p === 3 ? 'red' : p === 2 ? 'amber' : undefined}
                onPress={() => { setUrgency(p); if (read.priority && p !== read.priority) setText((t) => t.replace(/\s*!(?:high|h|medium|med|m|low|l|[123])\b/i, '')); }} />
            ))}
          </View>
          <Text variant="label" style={{ color: colors.faint, paddingLeft: 4 }}>
            {understood.length > 0
              ? <>Adds “{read.title}” · <Text variant="label" weight="semi" style={{ color: colors.inkBlue }}>{understood.join(' · ')}</Text></>
              : 'Try “Submit lab report tomorrow 5pm !high #school”.'}
          </Text>
        </View>}

        {!!message && <Text variant="label" style={{ color: colors.amber }} accessibilityLiveRegion="polite">{message}</Text>}
        {body}
      </ScrollView>

      {editing && (
        <TaskEditor
          task={editing} lists={lists}
          onClose={() => setEditing(null)}
          onSave={async (draft) => {
            const target = editing;
            setEditing(null);
            if (draft.remind_at) await requestReminderPermission();
            await updateTask(target, draft);
          }}
          onDelete={() => { removeTask(editing); setEditing(null); }}
        />
      )}
      {managing && (
        <ListsEditor
          lists={lists} onClose={() => setManaging(false)}
          onAdd={(name, color) => addList(name, color, lists.length)} onRename={renameList} onDelete={removeList}
        />
      )}
      {offer && (
        <Animated.View entering={ENTER} exiting={LEAVE} accessibilityLiveRegion="polite"
          style={{ position: 'absolute', left: space[4], right: space[4], bottom: insets.bottom + 100, flexDirection: 'row', alignItems: 'center', gap: space[3],
            paddingLeft: space[5], paddingRight: space[2], paddingVertical: space[2], borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.raised }}>
          <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>
            Log <Text variant="label" weight="bold" style={{ fontVariant: ['tabular-nums'] }}>{formatPeso(offer.amount)}</Text> for {offer.note}?
          </Text>
          <Pressable accessibilityRole="button" onPress={logOffer}
            style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: space[4], borderRadius: radius.pill, backgroundColor: colors.inkBlue, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
            <Text variant="label" weight="bold" style={{ color: colors.onInkBlue }}>Log it</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Not now" onPress={() => setOffer(null)} hitSlop={4}
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Text weight="semi" muted>✕</Text>
          </Pressable>
        </Animated.View>
      )}
      {logging && (
        <TransactionEditor tx={null} direction="out" amount={logging.amount} note={logging.note}
          accounts={logging.accounts} categories={logging.categories} onClose={() => setLogging(null)} />
      )}
      <Confetti shot={shot} origin={origin} />
    </View>
  );
}

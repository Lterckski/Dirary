import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, space } from '@dirary/ui';
import {
  LIST_COLORS, PRIORITIES, PRIORITY_LABEL, RECURRENCES, RECURRENCE_LABEL, REMINDERS, REMINDER_LABEL, TaskDraft, asRecurrence, dayLabel, localDate,
  remindAt, reminderOf, timeLabel, type List, type ListColor, type Priority, type Recurrence, type Reminder, type Task,
} from '@dirary/shared';

import { Chip } from '@/components/task-bits';
import { Button, Text, styles } from '@/components/ui';

const pad = (n: number) => String(n).padStart(2, '0');

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={styles.screen}>
        <View style={[styles.row, { justifyContent: 'space-between', paddingHorizontal: space[5], paddingTop: space[4] }]}>
          <Text variant="heading">{title}</Text>
          <Button label="Close" onPress={onClose} />
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="label" weight="semi" muted>{label}</Text>
      {children}
    </View>
  );
}

const Wrap = ({ children }: { children: ReactNode }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>{children}</View>;

export function TaskEditor({ task, lists, onClose, onSave, onDelete }: { task: Task; lists: List[]; onClose: () => void; onSave: (draft: TaskDraft) => void; onDelete: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [date, setDate] = useState<string | null>(task.due_date);
  const [time, setTime] = useState<string | null>(task.due_time ? task.due_time.slice(0, 5) : null);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [listId, setListId] = useState<string | null>(task.list_id && lists.some((l) => l.id === task.list_id) ? task.list_id : null);
  const [repeat, setRepeat] = useState<Recurrence | null>(asRecurrence(task.recurrence_rule));
  const [reminder, setReminder] = useState<Reminder>(reminderOf(task));
  const [problem, setProblem] = useState<string | null>(null);
  const today = localDate();

  function pickDate() {
    if (Platform.OS !== 'android') return;
    const [y, m, d] = (date ?? today).split('-').map(Number) as [number, number, number];
    DateTimePickerAndroid.open({
      mode: 'date', value: new Date(y, m - 1, d),
      onChange: (event, picked) => { if (event.type === 'set' && picked) setDate(localDate(picked)); },
    });
  }
  function pickTime() {
    if (Platform.OS !== 'android') return;
    const [hh, mm] = (time ?? '09:00').split(':').map(Number) as [number, number];
    const value = new Date();
    value.setHours(hh, mm, 0, 0);
    DateTimePickerAndroid.open({
      mode: 'time', value, is24Hour: false,
      onChange: (event, picked) => {
        if (event.type !== 'set' || !picked) return;
        setTime(`${pad(picked.getHours())}:${pad(picked.getMinutes())}`);
        if (!date) setDate(today);
        if (reminder === 'none') setReminder('at');
      },
    });
  }

  function save() {
    // Repeats and reminders need a date to hang on; a repeat with no date starts today.
    const dueDate = date ?? (repeat ? today : null);
    const draft = TaskDraft.safeParse({
      title, notes: notes.trim() || null, due_date: dueDate, due_time: dueDate ? time : null, priority, list_id: listId,
      remind_at: remindAt(dueDate, dueDate ? time : null, reminder), recurrence_rule: repeat,
    });
    if (!draft.success) return setProblem('Give the task a title.');
    onSave(draft.data);
  }

  const canRemind = date !== null || repeat !== null;

  return (
    <Sheet title="Edit task" onClose={onClose}>
      <Field label="Title">
        <TextInput accessibilityLabel="Title" style={styles.input} value={title} maxLength={200} onChangeText={setTitle} placeholderTextColor={colors.faint} />
      </Field>
      <Field label="Notes">
        <TextInput accessibilityLabel="Notes" style={[styles.input, { minHeight: 88, paddingTop: 12, textAlignVertical: 'top' }]} value={notes} maxLength={2000} multiline onChangeText={setNotes} />
      </Field>
      <Field label="Due">
        <Wrap>
          <Chip label={date ? dayLabel(date, today) : 'Set date'} active={!!date} onPress={pickDate} />
          <Chip label={time ? timeLabel(time) : 'Set time'} active={!!time} onPress={pickTime} />
          {(date || time) && <Chip dashed label="Clear" onPress={() => { setDate(null); setTime(null); }} />}
        </Wrap>
      </Field>
      <Field label="Urgency">
        <Wrap>{PRIORITIES.map((p) => <Chip key={p} label={PRIORITY_LABEL[p]} active={priority === p} onPress={() => setPriority(p)} />)}</Wrap>
      </Field>
      <Field label="List">
        <Wrap>
          <Chip label="Inbox" active={listId === null} onPress={() => setListId(null)} />
          {lists.map((l) => <Chip key={l.id} label={l.name} dot={l.color} active={listId === l.id} onPress={() => setListId(l.id)} />)}
        </Wrap>
      </Field>
      <Field label="Repeat">
        <Wrap>
          <Chip label="Doesn't repeat" active={repeat === null} onPress={() => setRepeat(null)} />
          {RECURRENCES.map((r) => <Chip key={r} label={RECURRENCE_LABEL[r]} active={repeat === r} onPress={() => setRepeat(r)} />)}
        </Wrap>
      </Field>
      <Field label="Reminder">
        {canRemind ? (
          <Wrap>{REMINDERS.map((r) => <Chip key={r} label={REMINDER_LABEL[r]} active={reminder === r} onPress={() => setReminder(r)} />)}</Wrap>
        ) : (
          <Text variant="label" muted>Set a date first.</Text>
        )}
        {canRemind && !time && reminder !== 'none' && <Text variant="label" muted>With no time set, it goes off at 9:00 AM.</Text>}
      </Field>
      {problem && <Text variant="label" style={{ color: colors.red }} accessibilityRole="alert">{problem}</Text>}
      <Button primary label="Save" onPress={save} />
      <Pressable accessibilityRole="button" onPress={onDelete} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
        <Text weight="semi" style={{ color: colors.red }}>Delete task</Text>
      </Pressable>
    </Sheet>
  );
}

const COLOR_NAMES: Record<ListColor, string> = { inkBlue: 'Ink blue', tongue: 'Pink', amber: 'Amber', red: 'Red', muted: 'Grey' };

export function ListsEditor({ lists, onClose, onAdd, onRename, onDelete }: {
  lists: List[]; onClose: () => void; onAdd: (name: string, color: ListColor) => void; onRename: (list: List, name: string) => void; onDelete: (list: List) => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<ListColor>('inkBlue');
  function add() {
    const clean = name.trim();
    if (!clean) return;
    onAdd(clean, color);
    setName('');
  }
  return (
    <Sheet title="Lists" onClose={onClose}>
      {lists.length === 0 && <Text muted>No lists yet. Try School, Work or Personal.</Text>}
      {lists.map((l) => (
        <View key={l.id} style={styles.row}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors[l.color] }} />
          <TextInput
            accessibilityLabel={`Name of list ${l.name}`} style={[styles.input, { flex: 1 }]} defaultValue={l.name} maxLength={40}
            onEndEditing={(e) => { const next = e.nativeEvent.text.trim(); if (next && next !== l.name) onRename(l, next); }} />
          <Pressable accessibilityRole="button" accessibilityLabel={`Delete list ${l.name}`} onPress={() => onDelete(l)} style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: space[2] }}>
            <Text weight="semi" style={{ color: colors.red }}>Delete</Text>
          </Pressable>
        </View>
      ))}
      {lists.length > 0 && <Text variant="label" muted>Deleting a list keeps its tasks. They move to the Inbox.</Text>}
      <Field label="New list">
        <TextInput accessibilityLabel="New list name" style={styles.input} value={name} maxLength={40} placeholder="School" placeholderTextColor={colors.faint} onChangeText={setName} onSubmitEditing={add} />
      </Field>
      <Field label="Colour">
        <Wrap>{LIST_COLORS.map((c) => <Chip key={c} label={COLOR_NAMES[c]} dot={c} active={color === c} onPress={() => setColor(c)} />)}</Wrap>
      </Field>
      <Button primary label="Add list" disabled={!name.trim()} onPress={add} />
    </Sheet>
  );
}

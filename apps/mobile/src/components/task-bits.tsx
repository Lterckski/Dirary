import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';
import { colors, radius, space, type ColorToken } from '@dirary/ui';
import { PRIORITY_LABEL, RECURRENCE_LABEL, asRecurrence, dayLabel, fromNow, timeLabel, type List, type Task } from '@dirary/shared';

import { Text } from '@/components/ui';

const URGENCY_COLOR: Record<number, string> = { 0: colors.inkBlue, 1: colors.inkBlue, 2: colors.amber, 3: colors.red };
const URGENCY_TEXT: Record<number, string> = { 1: colors.muted, 2: colors.amber, 3: colors.red };

export function Chip({ label, active, onPress, dot, count, dashed }: { label: string; active?: boolean; onPress: () => void; dot?: ColorToken; count?: number; dashed?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 44, paddingHorizontal: space[4], borderRadius: radius.pill,
        borderWidth: 1, borderStyle: dashed ? 'dashed' : 'solid', borderColor: active ? colors.inkBlue : colors.line,
        backgroundColor: active ? colors.inkBlue : dashed ? 'transparent' : colors.raised, opacity: pressed ? 0.7 : 1,
      })}>
      {dot && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors[dot], borderWidth: active ? 2 : 0, borderColor: colors.onInkBlue }} />}
      <Text variant="label" weight={active ? 'bold' : 'semi'} style={{ color: active ? colors.onInkBlue : dashed ? colors.muted : colors.text }}>{label}</Text>
      {count ? (
        <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: colors.night }}>
          <Text variant="small" weight="semi" style={{ fontVariant: ['tabular-nums'] }}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function Group({ title, red, sub, children }: { title: string; red?: boolean; sub?: boolean; children: ReactNode }) {
  return (
    <View style={{ gap: space[2] }}>
      <Text variant="small" weight="semi" style={{ color: red ? colors.red : sub ? colors.muted : colors.faint, letterSpacing: 1, paddingLeft: 4 }}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function Pill({ label, color, outlined }: { label: string; color: string; outlined?: boolean }) {
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1, borderColor: outlined ? color : 'transparent', backgroundColor: outlined ? 'transparent' : colors.raised }}>
      <Text variant="small" weight={outlined ? 'bold' : 'semi'} style={{ color, fontVariant: ['tabular-nums'] }}>{label}</Text>
    </View>
  );
}

export function TaskRow({ task, list, today, showDay, onToggle, onOpen }: {
  task: Task; list: List | undefined; today: string; showDay: boolean; onToggle: (t: Task) => void; onOpen: (t: Task) => void;
}) {
  const done = task.status === 'done';
  const repeat = asRecurrence(task.recurrence_rule);
  const meta = [list?.name, repeat ? RECURRENCE_LABEL[repeat] : null, task.remind_at ? 'Reminder set' : null].filter(Boolean).join(' · ');
  const when = [showDay && task.due_date ? dayLabel(task.due_date, today) : null, task.due_time ? timeLabel(task.due_time) : null].filter(Boolean).join(', ');
  const away = done ? null : fromNow(task.due_date, task.due_time);
  const late = !done && ((task.due_date !== null && task.due_date < today) || !!away?.endsWith('ago'));
  const due = [when, away].filter(Boolean).join(' · ');
  const edge = URGENCY_COLOR[task.priority] ?? colors.inkBlue;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6, paddingRight: space[3], paddingLeft: 4, borderRadius: radius.lg, borderWidth: 1, borderColor: done ? 'transparent' : colors.line, backgroundColor: done ? 'transparent' : colors.surface }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        accessibilityLabel={`${task.title}, mark ${done ? 'not done' : 'done'}`}
        onPress={() => onToggle(task)}
        hitSlop={4}
        style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 26, height: 26, borderRadius: radius.sm, borderWidth: 2.5, borderColor: done ? colors.inkBlue : edge, backgroundColor: done ? colors.inkBlue : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {done && (
            <Svg width={16} height={16} viewBox="0 0 16 16">
              <Path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke={colors.onInkBlue} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          )}
        </View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${task.title}`} onPress={() => onOpen(task)} style={{ flex: 1, minHeight: 48, justifyContent: 'center', paddingVertical: 6, gap: 4 }}>
        <Text weight={done ? 'medium' : 'semi'} style={done ? { color: colors.faint, textDecorationLine: 'line-through' } : undefined}>{task.title}</Text>
        {done ? !!list && <Text variant="label" style={{ color: colors.faint }}>{list.name}</Text> : !!meta && <Text variant="label" muted>{meta}</Text>}
        {!done && (task.priority > 0 || !!due) && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
            {task.priority > 0 && <Pill outlined label={PRIORITY_LABEL[task.priority]} color={URGENCY_TEXT[task.priority] ?? colors.muted} />}
            {!!due && <Pill label={due} color={late ? colors.red : colors.muted} />}
          </View>
        )}
      </Pressable>
    </View>
  );
}

/** A small "Group by" switch. */
export function Segmented<T extends string>({ label, options, labels, value, onChange }: { label: string; options: readonly T[]; labels: Record<T, string>; value: T; onChange: (v: T) => void }) {
  return (
    <View accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', padding: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={option} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`${label} ${labels[option]}`}
            onPress={() => onChange(option)} hitSlop={{ top: 8, bottom: 8 }}
            style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: active ? colors.raised : 'transparent', borderWidth: 1, borderColor: active ? colors.line : 'transparent' }}>
            <Text variant="label" weight="semi" style={{ color: active ? colors.text : colors.muted }}>{labels[option]}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

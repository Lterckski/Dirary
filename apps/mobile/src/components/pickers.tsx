/**
 * Date and time pickers drawn in Dirary's style, in place of Android's own dialogs (which follow the phone's
 * theme, not ours). Each is a panel that rises from the bottom over a dimmed screen. They match the web
 * pickers: dates "YYYY-MM-DD", times "HH:MM" (24-hour).
 */
import * as Haptics from 'expo-haptics';
import { useState, type ReactNode } from 'react';
import { Modal, View } from 'react-native';
import { Press } from '@/components/press';
import Animated, { FadeInDown, ReduceMotion } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space } from '@dirary/ui';
import { addDays, localDate, timeLabel } from '@dirary/shared';

import { Segmented } from '@/components/motion-bits';
import { Button, Text } from '@/components/ui';
import { EASE_OUT } from '@/lib/motion';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (y: number, m: number, d: number) => localDate(new Date(y, m, d));
const tick = () => { void Haptics.selectionAsync(); };

const RISE = FadeInDown.duration(260).easing(EASE_OUT).withInitialValues({ transform: [{ translateY: 40 }] }).reduceMotion(ReduceMotion.System);

/** The dimmed screen and the panel that rises from the bottom. Tapping the dim area or Back closes it. */
function PickerPanel({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Press accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} pressScale={1} haptic={false} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' }} />
        <Animated.View entering={RISE} accessibilityViewIsModal accessibilityLabel={label}
          style={{ backgroundColor: colors.surface, borderTopLeftRadius: radius.widget, borderTopRightRadius: radius.widget, borderWidth: 1, borderBottomWidth: 0, borderColor: colors.line, paddingHorizontal: space[5], paddingTop: space[3], paddingBottom: insets.bottom + space[5], gap: space[4] }}>
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line }} />
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

function Arrow({ dir, label, onPress }: { dir: 'left' | 'right'; label: string; onPress: () => void }) {
  return (
    <Press accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={4}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, backgroundColor: pressed ? colors.line : colors.raised, alignItems: 'center', justifyContent: 'center' })}>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <Path d={dir === 'left' ? 'M14.5 6l-6 6 6 6' : 'M9.5 6l6 6-6 6'} />
      </Svg>
    </Press>
  );
}

/** An equal-width shortcut button; several share one row. */
function Pill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Press accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minHeight: 44, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
        borderColor: on ? colors.inkBlue : colors.line, backgroundColor: on ? colors.inkBlue : colors.raised, opacity: pressed ? 0.7 : 1 })}>
      <Text variant="label" weight={on ? 'bold' : 'semi'} style={{ color: on ? colors.onInkBlue : colors.text }}>{label}</Text>
    </Press>
  );
}

function ClearLink({ onPress }: { onPress: () => void }) {
  return (
    <Press accessibilityRole="button" onPress={onPress} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: space[2] }}>
      <Text variant="label" weight="semi" muted>Clear</Text>
    </Press>
  );
}

/** A month calendar. Tapping a day picks it and closes. */
export function DatePickerSheet({ value, onPick, onClear, onClose }: { value: string | null; onPick: (date: string) => void; onClear?: () => void; onClose: () => void }) {
  const today = localDate();
  const start = value ?? today;
  const [month, setMonth] = useState({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 });
  const first = new Date(month.y, month.m, 1).getDay();
  const days = Array.from({ length: 42 }, (_, i) => toIso(month.y, month.m, i - first + 1));
  const weeks = Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7));
  const shift = (n: number) => setMonth(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));
  const pick = (iso: string) => { tick(); onPick(iso); onClose(); };
  const quick: [string, string][] = [['Today', today], ['Tomorrow', addDays(today, 1)], ['Next week', addDays(today, 7)]];

  return (
    <PickerPanel label="Choose a date" onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Arrow dir="left" label="Previous month" onPress={() => shift(-1)} />
        <Text variant="heading" accessibilityRole="header">
          {MONTHS[month.m]} <Text variant="heading" style={{ color: colors.muted }}>{month.y}</Text>
        </Text>
        <Arrow dir="right" label="Next month" onPress={() => shift(1)} />
      </View>
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: 'row' }}>
          {WEEKDAYS.map((d, i) => <Text key={i} variant="small" weight="bold" style={{ flex: 1, textAlign: 'center', color: colors.faint }}>{d}</Text>)}
        </View>
        {weeks.map((week) => (
          <View key={week[0]} style={{ flexDirection: 'row' }}>
            {week.map((iso) => {
              const on = iso === value;
              const isToday = iso === today;
              const out = Number(iso.slice(5, 7)) - 1 !== month.m;
              return (
                <View key={iso} style={{ flex: 1, alignItems: 'center' }}>
                  <Press accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => pick(iso)}
                    accessibilityLabel={new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    style={({ pressed }) => ({
                      width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: on ? colors.inkBlue : pressed ? colors.raised : 'transparent',
                      borderWidth: isToday && !on ? 2 : 0, borderColor: colors.inkBlue,
                    })}>
                    <Text weight={on ? 'bold' : out ? 'medium' : 'semi'}
                      style={{ fontVariant: ['tabular-nums'], color: on ? colors.onInkBlue : isToday ? colors.inkBlue : out ? colors.faint : colors.text }}>
                      {Number(iso.slice(8, 10))}
                    </Text>
                  </Press>
                </View>
              );
            })}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: space[2], borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space[4] }}>
        {quick.map(([name, iso]) => <Pill key={name} label={name} on={iso === value} onPress={() => pick(iso)} />)}
      </View>
      {onClear && value && <View style={{ alignItems: 'center', marginTop: -space[2] }}><ClearLink onPress={() => { onClear(); onClose(); }} /></View>}
    </PickerPanel>
  );
}

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = ['00', '15', '30', '45'] as const;
type Minute = (typeof MINUTES)[number];
const PRESETS: [string, string][] = [['9 AM', '09:00'], ['Noon', '12:00'], ['5 PM', '17:00'], ['8 PM', '20:00']];

/** Common times, an hour grid, quarter-hour minutes and AM/PM. Changes apply on Done; tapping outside cancels. */
export function TimePickerSheet({ value, onPick, onClear, onClose }: { value: string | null; onPick: (time: string) => void; onClear?: () => void; onClose: () => void }) {
  const [draft, setDraft] = useState<string | null>(value);
  const h24 = draft ? Number(draft.slice(0, 2)) : null;
  const minute = draft ? draft.slice(3, 5) : '00';
  const pm = h24 === null ? new Date().getHours() >= 12 : h24 >= 12;
  const hour12 = h24 === null ? null : h24 % 12 || 12;
  const set = (h: number, m: string, isPm: boolean) => { tick(); setDraft(`${pad((h % 12) + (isPm ? 12 : 0))}:${m}`); };
  const done = (time: string | null) => { if (time) onPick(time); onClose(); };

  return (
    <PickerPanel label="Choose a time" onClose={onClose}>
      <Text variant="title" style={{ color: draft ? colors.text : colors.faint }}>{draft ? timeLabel(draft) : 'Pick a time'}</Text>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        {PRESETS.map(([name, hhmm]) => <Pill key={hhmm} label={name} on={draft === hhmm} onPress={() => { tick(); done(hhmm); }} />)}
      </View>
      <View style={{ gap: space[2] }}>
        <Text variant="small" weight="bold" style={{ color: colors.faint, letterSpacing: 1 }}>HOUR</Text>
        {[HOURS.slice(0, 6), HOURS.slice(6)].map((row) => (
          <View key={row[0]} style={{ flexDirection: 'row', gap: space[2] }}>
            {row.map((h) => {
              const on = hour12 === h;
              return (
                <Press key={h} accessibilityRole="button" accessibilityLabel={`${h} o'clock`} accessibilityState={{ selected: on }} onPress={() => set(h, minute, pm)}
                  style={({ pressed }) => ({ flex: 1, height: 48, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
                    borderColor: on ? colors.inkBlue : colors.line, backgroundColor: on ? colors.inkBlue : pressed ? colors.line : colors.raised })}>
                  <Text weight="bold" style={{ fontVariant: ['tabular-nums'], color: on ? colors.onInkBlue : colors.text }}>{h}</Text>
                </Press>
              );
            })}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <View style={{ flex: 1 }}>
          <Segmented<Minute> label="Minutes" value={draft && (MINUTES as readonly string[]).includes(minute) ? (minute as Minute) : null}
            options={MINUTES.map((m) => ({ value: m, label: `:${m}` }))} onChange={(m) => set(hour12 ?? 12, m, pm)} />
        </View>
        <View style={{ width: 128 }}>
          <Segmented<'am' | 'pm'> label="AM or PM" value={pm ? 'pm' : 'am'}
            options={[{ value: 'am', label: 'AM' }, { value: 'pm', label: 'PM' }]} onChange={(v) => set(hour12 ?? (v === 'pm' ? 5 : 9), minute, v === 'pm')} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space[4] }}>
        {onClear && value && <ClearLink onPress={() => { onClear(); onClose(); }} />}
        <View style={{ flex: 1 }} />
        <Button primary label="Done" disabled={!draft} onPress={() => done(draft)} />
      </View>
    </PickerPanel>
  );
}

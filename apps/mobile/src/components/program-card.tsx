/** Health → Workouts: Luther's 7-day program, with a Gym / Home switch for days he can't get to the gym. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { colors, space } from '@dirary/ui';
import { PROGRAM, PROGRAM_PLACE_LABEL, PROGRESSION, localDate, programDayOf, programDayTitle, programTarget, type ProgramPlace } from '@dirary/shared';

import { Mascot } from '@/components/mascot';
import { Segmented } from '@/components/motion-bits';
import { Press } from '@/components/press';
import { Card, Text, styles } from '@/components/ui';
import { ENTER } from '@/lib/motion';

const LABEL = { letterSpacing: 1.4, color: colors.muted } as const;
const PLACE_KEY = 'dirary.programPlace';
const PLACES = (['gym', 'home'] as const).map((p) => ({ value: p, label: PROGRAM_PLACE_LABEL[p] }));

export function ProgramCard() {
  const today = programDayOf(localDate());
  const [place, setPlace] = useState<ProgramPlace>('gym');
  const [day, setDay] = useState(today);
  // Remember Gym or Home between visits.
  useEffect(() => {
    AsyncStorage.getItem(PLACE_KEY).then((saved) => { if (saved === 'gym' || saved === 'home') setPlace(saved); }).catch(() => {});
  }, []);
  const choosePlace = (p: ProgramPlace) => { setPlace(p); AsyncStorage.setItem(PLACE_KEY, p).catch(() => {}); };

  const days = PROGRAM[place];
  const shown = days.find((d) => d.day === day) ?? days[0]!;

  return (
    <Card style={{ borderRadius: 28 }}>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text variant="small" weight="bold" style={LABEL}>MY PROGRAM</Text>
        {day !== today && (
          <Press accessibilityRole="button" onPress={() => setDay(today)} hitSlop={8}>
            <Text variant="label" weight="semi" style={{ color: colors.inkBlue }}>Back to today</Text>
          </Press>
        )}
      </View>
      <Segmented<ProgramPlace> label="Where you're training" value={place} options={PLACES} onChange={choosePlace} />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }} accessibilityRole="tablist">
        {days.map((d) => {
          const on = d.day === shown.day;
          const isToday = d.day === today;
          return (
            <Press key={d.day} accessibilityRole="tab" accessibilityState={{ selected: on }}
              accessibilityLabel={`${programDayTitle(d)}${isToday ? ', today' : ''}`} onPress={() => setDay(d.day)}
              style={{ width: 42, height: 52, alignItems: 'center', justifyContent: 'center', gap: 3 }}>
              <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', borderWidth: 1,
                borderColor: on || isToday ? colors.inkBlue : colors.line, backgroundColor: on ? colors.inkBlue : d.kind === 'lift' ? colors.raised : 'transparent' }}>
                <Text weight="bold" style={{ color: on ? colors.onInkBlue : d.kind === 'lift' ? colors.text : colors.muted, fontVariant: ['tabular-nums'] }}>{d.day}</Text>
              </View>
              <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: isToday ? colors.inkBlue : 'transparent' }} />
            </Press>
          );
        })}
      </View>

      <Animated.View key={`${place}-${shown.day}`} entering={ENTER} style={{ gap: space[2] }}>
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <Text variant="heading" accessibilityRole="header" style={{ flex: 1 }}>{programDayTitle(shown)}</Text>
          {shown.day === today && <Text variant="small" weight="bold" style={{ color: colors.inkBlue, letterSpacing: 1.2 }}>TODAY</Text>}
        </View>
        {shown.exercises.map((e, i) => (
          <View key={`${i}-${e.name}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52, paddingVertical: space[2], paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text weight="semi">{e.name}</Text>
              {e.how && <Text variant="label" muted>{e.how}</Text>}
            </View>
            <Text variant="label" weight="bold" style={{ color: colors.inkBlue, fontVariant: ['tabular-nums'], textAlign: 'right', maxWidth: 110 }}>{programTarget(e.target)}</Text>
          </View>
        ))}
        {shown.note && (
          <View style={styles.row}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.inkBlue, alignItems: 'center', justifyContent: 'center' }}>
              <Mascot mood={shown.kind === 'rest' ? 'sleepy' : 'coach'} size={48} />
            </View>
            <Text style={{ flex: 1 }}>{shown.note}</Text>
          </View>
        )}
      </Animated.View>

      <View style={{ gap: space[2], paddingTop: space[2], borderTopWidth: 1, borderTopColor: colors.line }}>
        <Text variant="small" weight="bold" style={LABEL}>PROGRESSION</Text>
        {PROGRESSION.map((line) => (
          <View key={line} style={{ flexDirection: 'row', gap: space[2] }}>
            <Text muted>•</Text>
            <Text variant="label" muted style={{ flex: 1 }}>{line}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

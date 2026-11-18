import { View } from 'react-native';
import { Path, Svg } from 'react-native-svg';
import { colors } from '@dirary/ui';
import { WEEKDAY_NAME, WEEKDAY_SHORT, type WeekDay } from '@dirary/shared';

import { Text } from '@/components/ui';

const SAY = { done: 'done', planned: 'planned', missed: 'missed', rest: 'rest day', today: 'planned today' } as const;

/** Monday to Sunday: a filled dot for a workout done, a ring for today, dashed for planned, red for missed. */
export function WeekDots({ days, size = 34 }: { days: readonly WeekDay[]; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {days.map((d) => (
        <View key={d.date} style={{ alignItems: 'center', gap: 6 }} accessible accessibilityLabel={`${WEEKDAY_NAME[d.weekday]}: ${SAY[d.state]}`}>
          <Text variant="small" weight="semi" style={{ color: d.isToday ? colors.text : colors.muted }}>{WEEKDAY_SHORT[d.weekday]}</Text>
          <View style={{
            width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center',
            backgroundColor: d.state === 'done' ? colors.inkBlue : 'transparent',
            borderWidth: d.state === 'today' ? 2.5 : d.state === 'planned' || d.state === 'missed' ? 2 : 0,
            borderStyle: d.state === 'planned' ? 'dashed' : 'solid',
            borderColor: d.state === 'today' ? colors.inkBlue : d.state === 'missed' ? colors.red : colors.line,
          }}>
            {d.state === 'done' && <Svg width={size * 0.47} height={size * 0.47} viewBox="0 0 16 16"><Path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke={colors.onInkBlue} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>}
            {d.state === 'rest' && <Text style={{ color: colors.faint }}>·</Text>}
          </View>
        </View>
      ))}
    </View>
  );
}

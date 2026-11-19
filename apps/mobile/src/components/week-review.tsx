/** The weekly review on the phone: tasks done, money by category, workouts and the food streak, Monday to Sunday. */
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Press } from '@/components/press';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Path, Svg } from 'react-native-svg';
import { colors, radius, space } from '@dirary/ui';
import {
  WEEKDAY_NAME, WEEKDAY_SHORT, addDays, formatKcal, formatPeso, localDate, weekCoach, weekLabel, weekReview, weekStart, weekdayOf,
  type Category, type FoodLog, type Routine, type Task, type Transaction, type WorkoutSession,
} from '@dirary/shared';

import { Mascot } from '@/components/mascot';
import { Bar } from '@/components/motion-bits';
import { Card, Text, styles } from '@/components/ui';
import { WeekDots } from '@/components/week-dots';
import { PopUp } from '@/components/pop-up';

const LABEL = { letterSpacing: 1.4, color: colors.muted } as const;
const NUM = { fontVariant: ['tabular-nums' as const] };
const toLocal = (iso: string) => localDate(new Date(iso));

export function WeekReviewScreen(props: {
  tasks: readonly Task[]; transactions: readonly Transaction[]; categories: readonly Category[]; logs: readonly FoodLog[];
  routines: readonly Routine[]; sessions: readonly WorkoutSession[]; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const today = localDate();
  const thisMonday = weekStart(today);
  const [monday, setMonday] = useState(thisMonday);
  const review = useMemo(() => weekReview({ ...props, day: monday, today, toLocalDate: toLocal }), [props, monday, today]);
  const coach = weekCoach(review, formatPeso);
  const maxTasks = Math.max(1, ...review.tasksPerDay);
  const maxCat = Math.max(1, ...review.byCategory.map((c) => c.amount));
  const diff = review.spent - review.spentLastWeek;
  // The phone keeps the last 30 days of food logs, so it reviews this week and the three before it.
  const atOldest = monday <= addDays(thisMonday, -21);
  const daysSoFar = review.isThisWeek ? review.days.filter((d) => d <= today).length : 7;

  return (
    <PopUp onClose={props.onClose} navigationBarTranslucent>
      <View style={[styles.screen, { paddingTop: insets.top + space[3] }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[5] }}>
          <Round label="Back to Today" onPress={props.onClose} d="M15 5l-7 7 7 7" />
          <View style={{ alignItems: 'center' }}>
            <Text variant="small" weight="bold" style={LABEL}>{review.isThisWeek ? 'THIS WEEK' : monday === addDays(thisMonday, -7) ? 'LAST WEEK' : 'WEEKLY REVIEW'}</Text>
            <Text variant="heading" accessibilityRole="header">{weekLabel(monday)}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <Round label="Previous week" onPress={() => setMonday(addDays(monday, -7))} d="M14 6l-6 6 6 6" small disabled={atOldest} />
            <Round label="Next week" onPress={() => setMonday(addDays(monday, 7))} d="M10 6l6 6-6 6" small disabled={review.isThisWeek} />
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: space[5], gap: space[5], paddingBottom: insets.bottom + space[8] }}>
          <Card>
            <View style={[styles.row, { alignItems: 'center' }]}>
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.inkBlue, alignItems: 'center', justifyContent: 'center' }}>
                <Mascot mood={coach.mood} size={56} />
              </View>
              <Text weight="semi" style={{ flex: 1 }} accessibilityLiveRegion="polite">{coach.line}</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space[3] }}>
              <Figure label="Tasks done" value={String(review.tasksDone)} />
              <Figure label="Spent" value={formatPeso(review.spent)} />
              <Figure label="Workouts" value={`${review.workoutsDone} of ${review.workoutsPlanned}`} />
              <Figure label="Food streak" value={`${review.streak} day${review.streak === 1 ? '' : 's'}`} />
            </View>
          </Card>

          <Card>
            <Text variant="small" weight="bold" style={LABEL}>TASKS DONE</Text>
            <View style={{ height: 140, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
              {review.days.map((d, i) => {
                const n = review.tasksPerDay[i] ?? 0;
                return (
                  <View key={d} accessible accessibilityLabel={`${WEEKDAY_NAME[weekdayOf(d)]}: ${n} done`} style={{ flex: 1, alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
                    <Text variant="small" weight="bold" muted style={NUM}>{n || ' '}</Text>
                    <View style={{ width: 26, height: `${Math.max(3, Math.round((n / maxTasks) * 72))}%`, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: colors.inkBlue }} />
                    <Text variant="small" weight="semi" style={{ color: d === today ? colors.text : colors.muted }}>{WEEKDAY_SHORT[weekdayOf(d)]}</Text>
                  </View>
                );
              })}
            </View>
          </Card>

          <Card>
            <Text variant="small" weight="bold" style={LABEL}>MONEY SPENT</Text>
            <Text variant="title" style={NUM}>{formatPeso(review.spent)}</Text>
            {review.spentLastWeek > 0 && (review.isThisWeek
              ? <Text variant="label" muted style={NUM}>{formatPeso(review.spentLastWeek)} in all of last week</Text>
              : <Text variant="label" weight="semi" style={[NUM, { color: diff > 0 ? colors.red : colors.inkBlue }]}>{diff === 0 ? 'Same as the week before' : `${formatPeso(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than the week before`}</Text>)}
            {review.byCategory.length === 0 ? <Text muted>No spending this week.</Text> : review.byCategory.map((c) => (
              <View key={c.id ?? 'other'} style={{ gap: 6 }}>
                <View style={styles.row}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors[c.color] }} />
                  <Text style={{ flex: 1 }}>{c.name}</Text>
                  <Text weight="bold" style={NUM}>{formatPeso(c.amount)}</Text>
                </View>
                <Bar pct={Math.max(2, Math.round((c.amount / maxCat) * 100))} color={colors[c.color]} label={`${c.name} spending`} />
              </View>
            ))}
          </Card>

          <Card>
            <Text variant="small" weight="bold" style={LABEL}>WORKOUTS</Text>
            <WeekDots days={review.workoutDays} />
          </Card>

          <Card>
            <Text variant="small" weight="bold" style={LABEL}>FOOD</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space[3] }}>
              <Figure label="Days logged" value={`${review.foodDays} of ${daysSoFar}`} />
              <Figure label="Average" value={review.avgKcal === null ? '–' : `${formatKcal(review.avgKcal)} kcal`} />
              <Figure label="Protein" value={review.avgProtein === null ? '–' : `${Math.round(review.avgProtein)} g a day`} />
            </View>
            {atOldest && <Text variant="label" muted>Older weeks are in the weekly review on the web.</Text>}
            <Text variant="label" muted>{review.streak > 0 ? `${review.streak} day${review.streak === 1 ? '' : 's'} in a row with food logged, up to today.` : 'Log a meal today to start a streak.'}</Text>
          </Card>
        </ScrollView>
      </View>
    </PopUp>
  );
}

function Round({ label, onPress, d, small, disabled }: { label: string; onPress: () => void; d: string; small?: boolean; disabled?: boolean }) {
  const size = small ? 44 : 48;
  return (
    <Press accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={onPress} hitSlop={4}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : pressed ? 0.7 : 1 })}>
      <Svg width={20} height={20} viewBox="0 0 24 24"><Path d={d} fill="none" stroke={colors.text} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
    </Press>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '50%', gap: 2, borderRadius: radius.md }}>
      <Text variant="label" muted>{label}</Text>
      <Text variant="heading" style={NUM} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

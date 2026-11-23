import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, TextInput, View } from 'react-native';
import { Press } from '@/components/press';
import Animated from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, space } from '@dirary/ui';
import {
  FOOD_SOURCE_LABEL, MEALS, MEAL_LABEL, STARTER_FOODS, amountLabel, foodCategoryId, formatPeso, parseAmount, dayTotals, foodCoach, formatGrams, formatKcal, glassesOn, localDate, mealAt, nutrition,
  parseGrams, recentFoods, searchFoods, servingsOf,
  type Account, type Category, type Food, type FoodLog, type HealthGoals, type Meal, type Serving, type StarterFood,
} from '@dirary/shared';

import { Mascot } from '@/components/mascot';
import { Bar, Segmented } from '@/components/motion-bits';
import { Chip } from '@/components/task-bits';
import { Field, Sheet, Wrap } from '@/components/task-editor';
import { Button, Card, TAB_BAR_CLEARANCE, Text, styles } from '@/components/ui';
import { useAddRequest } from '@/lib/add-bus';
import { logFood, lookUpBarcode, removeFood, removeLog, saveFood, saveGoals, tapWater, updateLog, useHealthStore } from '@/lib/health-store';
import { BarcodeScanner } from '@/components/barcode-scanner';
import { FoodCamera } from '@/components/food-camera';
import { foodLensAvailable } from '../../modules/dirary-food-lens';
import { WorkoutsTab } from '@/components/workouts-tab';
import { ENTER, LEAVE } from '@/lib/motion';
import { TransactionEditor } from '@/components/money-editor';
import { readAccounts, readCategories } from '@/lib/db';
import { useOnlineFoods } from '@/lib/online-foods';

type Pick = { food: Food | null; starter: StarterFood | null };
type Open =
  | { kind: 'log'; pick: Pick; grams?: number; meal?: Meal }
  | { kind: 'edit'; log: FoodLog }
  | { kind: 'food'; food: Food | null; name?: string; barcode?: string }
  | { kind: 'scan' }
  | { kind: 'photo' }
  | { kind: 'goals' }
  | null;

const LABEL = { letterSpacing: 1.4, color: colors.muted } as const;
const NUM = { fontVariant: ['tabular-nums' as const] };
const pct = (part: number, whole: number | null | undefined) => (whole ? Math.max(0, Math.min(100, Math.round((part / whole) * 100))) : 0);
const MEAL_OPTIONS = MEALS.map((m) => ({ value: m, label: m === 'snack' ? 'Snack' : MEAL_LABEL[m] }));

/** "1 cup · 158 g", or just "120 g" when it isn't a saved serving. */
function logAmount(log: FoodLog, foods: readonly Food[]): string {
  const food = foods.find((f) => f.id === log.food_id);
  const label = amountLabel(log.grams, food ? servingsOf(food) : []);
  return label.endsWith(' g') ? label : `${label} · ${formatGrams(log.grams)} g`;
}

export default function HealthScreen() {
  const { foods, logs, goals, water, loading } = useHealthStore();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<Open>(null);
  const [tab, setTab] = useState<'food' | 'workouts'>('food');
  const [query, setQuery] = useState('');
  const [forMeal, setForMeal] = useState<Meal | null>(null);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const today = localDate();
  const hour = new Date().getHours();

  const totals = useMemo(() => dayTotals(logs, today), [logs, today]);
  const coach = foodCoach(totals, goals, hour);
  const again = useMemo(() => recentFoods(logs, foods), [logs, foods]);
  const results = useMemo(() => searchFoods(query, foods, STARTER_FOODS, 6), [query, foods]);
  const online = useOnlineFoods(query);
  // Online foods you've already saved show up under your own foods instead.
  const remote = online.results.filter((u) => !foods.some((f) => f.source_ref === u.key));
  const glasses = glassesOn(water, today);
  const glassGoal = goals?.water_glasses ?? 8;
  const kcalLeft = goals?.kcal_target ? Math.round(goals.kcal_target - totals.kcal) : null;

  useAddRequest('health', () => { setTab('food'); setTimeout(() => input.current?.focus(), 50); });
  // The Food widget's + opens Health with ?log=1; Money's "Log what you ate?" chip adds the place you paid as q.
  const params = useLocalSearchParams<{ log?: string; q?: string; tab?: string }>();
  // The Workouts widget opens Health with ?tab=workouts.
  useEffect(() => { if (params.tab === 'workouts') setTab('workouts'); }, [params.tab]);
  useEffect(() => {
    if (!params.log) return;
    setTab('food');
    if (params.q) setQuery(params.q);
    setTimeout(() => input.current?.focus(), 300);
  }, [params.log, params.q]);

  // A meal logged with what you paid offers to log the expense; "Log it" opens the expense form, filled in.
  const [paid, setPaid] = useState<{ amount: number; note: string } | null>(null);
  const [logging, setLogging] = useState<{ amount: number; note: string; accounts: Account[]; categories: Category[] } | null>(null);
  useEffect(() => {
    if (!paid) return;
    const timer = setTimeout(() => setPaid(null), 10000);
    return () => clearTimeout(timer);
  }, [paid]);
  async function logPaid() {
    if (!paid) return;
    const [accounts, categories] = await Promise.all([readAccounts(), readCategories()]);
    setPaid(null);
    setLogging({ ...paid, accounts, categories });
  }
  const [looking, setLooking] = useState<string | null>(null);

  async function scanned(code: string) {
    setOpen(null);
    setLooking('Looking up the barcode…');
    try {
      const found = await lookUpBarcode(code, foods);
      setLooking(null);
      if (found) return choose(found);
      setOpen({ kind: 'food', food: null, barcode: code });
    } catch {
      setLooking('Couldn’t reach Open Food Facts. Check your connection, or add the food from its label.');
      setTimeout(() => setLooking(null), 6000);
    }
  }

  function choose(pick: Pick, grams?: number) {
    setQuery('');
    input.current?.blur();
    setOpen({ kind: 'log', pick, grams, meal: forMeal ?? undefined });
    setForMeal(null);
  }

  return (
    <View style={styles.screen}>
      <ScrollView ref={scroller} contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE + insets.bottom }} keyboardShouldPersistTaps="handled">
        <View style={{ backgroundColor: colors.inkBlue, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, paddingTop: insets.top + space[4], paddingHorizontal: space[5], paddingBottom: 72, gap: space[3] }}>
          <View>
            <Text variant="small" weight="bold" style={{ color: colors.onInkBlue, letterSpacing: 1.3 }}>{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</Text>
            <Text variant="title" accessibilityRole="header" style={{ color: colors.onInkBlue }}>Health</Text>
          </View>
          <View style={{ width: 230, flexDirection: 'row', padding: 3, borderRadius: radius.pill, backgroundColor: colors.night }} accessibilityRole="tablist">
            {(['food', 'workouts'] as const).map((t) => (
              <Press key={t} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} onPress={() => setTab(t)}
                style={{ flex: 1, minHeight: 44, borderRadius: radius.pill, backgroundColor: tab === t ? colors.inkBlue : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                <Text weight={tab === t ? 'bold' : 'semi'} style={{ color: tab === t ? colors.onInkBlue : colors.muted }}>{t === 'food' ? 'Food' : 'Workouts'}</Text>
              </Press>
            ))}
          </View>
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', right: space[6], bottom: 36 }}>
            <Mascot mood="happy" size={88} />
          </View>
        </View>

        <View style={{ paddingHorizontal: space[5], gap: space[5], marginTop: -50 }}>
          {tab === 'workouts' ? <WorkoutsTab /> : <>
          {!loading && (
            <Card style={{ borderRadius: 28 }}>
              <View style={[styles.row, { justifyContent: 'space-between' }]}>
                <Text variant="small" weight="bold" style={LABEL}>{kcalLeft === null ? 'EATEN TODAY' : kcalLeft >= 0 ? 'CALORIES LEFT TODAY' : 'CALORIES OVER TODAY'}</Text>
                <Press accessibilityRole="button" accessibilityLabel="Set daily targets" onPress={() => setOpen({ kind: 'goals' })} hitSlop={2}
                  style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
                  <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke={colors.text} strokeWidth={2} strokeLinejoin="round" /></Svg>
                </Press>
              </View>
              <View style={[styles.row, { alignItems: 'baseline', gap: space[2] }]}>
                <Text variant="hero" style={[NUM, kcalLeft !== null && kcalLeft < 0 && { color: colors.red }]}>{formatKcal(kcalLeft === null ? totals.kcal : Math.abs(kcalLeft))}</Text>
                <Text muted style={NUM}>{kcalLeft === null ? 'kcal' : `of ${formatKcal(goals!.kcal_target!)} kcal`}</Text>
              </View>
              {kcalLeft !== null && <Bar pct={pct(totals.kcal, goals?.kcal_target)} height={12} color={kcalLeft < 0 ? colors.red : colors.inkBlue} label="Calories eaten" />}
              <View style={{ flexDirection: 'row', gap: space[4] }}>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={[styles.row, { justifyContent: 'space-between' }]}><Text variant="label" weight="semi">Protein</Text><Text variant="label" muted style={NUM}>{Math.round(totals.protein)}{goals?.protein_target_g ? ` / ${goals.protein_target_g}` : ''} g</Text></View>
                  <Bar pct={pct(totals.protein, goals?.protein_target_g)} color={colors.tongue} label="Protein eaten" />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={[styles.row, { justifyContent: 'space-between' }]}><Text variant="label" weight="semi">Eaten</Text><Text variant="label" muted style={NUM}>{formatKcal(totals.kcal)} kcal</Text></View>
                  <Bar pct={pct(totals.kcal, goals?.kcal_target)} color={colors.amber} label="Calories eaten" />
                </View>
              </View>
              <View style={styles.row}>
                <Text style={{ flex: 1 }} accessibilityLiveRegion="polite">{coach.line}</Text>
              </View>
              {!goals?.kcal_target && !goals?.protein_target_g && <View style={styles.row}><Button primary label="Set daily targets" onPress={() => setOpen({ kind: 'goals' })} /></View>}
            </Card>
          )}

          <Card style={{ borderRadius: 28 }}>
            <View style={[styles.row, { justifyContent: 'space-between' }]}>
              <Text variant="small" weight="bold" style={LABEL}>WATER</Text>
              <Text variant="label" muted style={NUM}>{glasses} of {glassGoal} glasses</Text>
            </View>
            <View accessibilityRole="none" accessibilityLabel="Glasses of water today" style={{ flexDirection: 'row' }}>
              {Array.from({ length: Math.max(glassGoal, glasses) }, (_, i) => i + 1).map((n) => (
                <Press key={n} accessibilityRole="button" accessibilityState={{ selected: n <= glasses }} accessibilityLabel={n <= glasses ? `Glass ${n}, drunk. Tap to undo` : `Glass ${n}`}
                  onPress={() => tapWater(water, n)} style={{ flex: 1, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                  <Svg width={22} height={28} viewBox="0 0 22 28"><Path d="M11 2C11 2 3 12 3 18a8 8 0 0 0 16 0C19 12 11 2 11 2z" fill={n <= glasses ? colors.inkBlue : 'none'} stroke={colors.inkBlue} strokeWidth={2} strokeLinejoin="round" /></Svg>
                </Press>
              ))}
            </View>
          </Card>

          <View style={{ gap: space[2] }}>
            {forMeal && (
              <View style={[styles.row, { gap: space[2] }]}>
                <Text variant="label" muted>Adding to {MEAL_LABEL[forMeal].toLowerCase()}.</Text>
                <Press accessibilityRole="button" onPress={() => setForMeal(null)} hitSlop={8}><Text variant="label" weight="semi" style={{ color: colors.inkBlue }}>Cancel</Text></Press>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: space[3] }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52, paddingHorizontal: space[4], borderRadius: 18, borderWidth: 1, borderColor: query ? colors.inkBlue : colors.line, backgroundColor: colors.surface }}>
              <Svg width={20} height={20} viewBox="0 0 24 24"><Circle cx={11} cy={11} r={7} fill="none" stroke={colors.muted} strokeWidth={2} /><Path d="M20 20l-4-4" stroke={colors.muted} strokeWidth={2} strokeLinecap="round" /></Svg>
              <TextInput ref={input} accessibilityLabel="Search foods" value={query} onChangeText={setQuery} placeholder="Search foods: rice, adobo, egg" placeholderTextColor={colors.faint}
                style={{ flex: 1, minHeight: 48, color: colors.text, fontSize: 16 }} returnKeyType="search" autoCorrect={false}
                onSubmitEditing={() => { const r = results[0]; if (r) choose({ food: r.food, starter: r.starter }); }} />
            </View>
            {foodLensAvailable && (
            <Press accessibilityRole="button" accessibilityLabel="Snap your food" onPress={() => { input.current?.blur(); setOpen({ kind: 'photo' }); }}
              style={({ pressed }) => ({ width: 52, height: 52, borderRadius: 18, backgroundColor: colors.inkBlue, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
              <Svg width={24} height={24} viewBox="0 0 24 24"><Path d="M4 8h3l2-3h6l2 3h3v11H4z" fill="none" stroke={colors.onInkBlue} strokeWidth={2} strokeLinejoin="round" /><Circle cx={12} cy={13} r={3.5} fill="none" stroke={colors.onInkBlue} strokeWidth={2} /></Svg>
            </Press>
            )}
            <Press accessibilityRole="button" accessibilityLabel="Scan a barcode" onPress={() => { input.current?.blur(); setOpen({ kind: 'scan' }); }}
              style={({ pressed }) => ({ width: 52, height: 52, borderRadius: 18, backgroundColor: colors.inkBlue, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
              <Svg width={24} height={24} viewBox="0 0 24 24"><Path d="M3 7V4h3M18 4h3v3M21 17v3h-3M6 20H3v-3M7 8v8M10 8v8M13 8v8M17 8v8" fill="none" stroke={colors.onInkBlue} strokeWidth={2} strokeLinecap="round" /></Svg>
            </Press>
            </View>
            {looking && <Text variant="label" muted accessibilityLiveRegion="polite">{looking}</Text>}
            {query.trim() !== '' && (
              <Animated.View entering={ENTER} style={{ borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.raised, padding: 6 }}>
                {results.map((r) => (
                  <Press key={r.food?.id ?? r.starter!.key} accessibilityRole="button" onPress={() => choose({ food: r.food, starter: r.starter })}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48, paddingHorizontal: space[3], borderRadius: 14, backgroundColor: pressed ? colors.surface : 'transparent' })}>
                    <Text weight="semi" style={{ flex: 1 }} numberOfLines={1}>{r.name}</Text>
                    <Text variant="small" weight="bold" style={{ color: r.source === 'own' ? colors.inkBlue : colors.muted, letterSpacing: 0.8 }}>{FOOD_SOURCE_LABEL[r.source].toUpperCase()}</Text>
                  </Press>
                ))}
                {remote.map((u) => (
                  <Press key={u.key} accessibilityRole="button" onPress={() => choose({ food: null, starter: u })}
                    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 48, paddingHorizontal: space[3], borderRadius: 14, backgroundColor: pressed ? colors.surface : 'transparent' })}>
                    <Text weight="semi" style={{ flex: 1 }} numberOfLines={2}>{u.name}</Text>
                    <Text variant="small" weight="bold" style={{ color: colors.muted, letterSpacing: 0.8 }}>{u.source === 'off' ? 'OFF' : FOOD_SOURCE_LABEL[u.source].toUpperCase()}</Text>
                  </Press>
                ))}
                {(online.searching || online.problem) && <Text variant="label" style={{ color: colors.faint, paddingHorizontal: space[3], paddingVertical: space[2] }}>{online.problem ?? 'Searching online…'}</Text>}
                <Press accessibilityRole="button" onPress={() => { const name = query.trim(); setQuery(''); input.current?.blur(); setOpen({ kind: 'food', food: null, name }); }}
                  style={({ pressed }) => ({ minHeight: 48, justifyContent: 'center', paddingHorizontal: space[3], borderRadius: 14, backgroundColor: pressed ? colors.surface : 'transparent' })}>
                  <Text weight="semi" muted numberOfLines={1}>+ New food “{query.trim()}”</Text>
                </Press>
              </Animated.View>
            )}
          </View>

          {again.length > 0 && (
            <View style={{ gap: space[2] }}>
              <Text variant="small" weight="bold" style={LABEL}>AGAIN?</Text>
              <Wrap>{again.map((r) => <Chip key={r.food.id} label={`+ ${r.food.name} · ${r.label}`} onPress={() => choose({ food: r.food, starter: null }, r.grams)} />)}</Wrap>
            </View>
          )}

          <Card style={{ borderRadius: 28, gap: space[5] }}>
            {MEALS.map((meal) => {
              const m = totals.meals[meal];
              return (
                <View key={meal} style={{ gap: space[2] }}>
                  <View style={[styles.row, { justifyContent: 'space-between' }]}>
                    <Text weight="bold" accessibilityRole="header">{MEAL_LABEL[meal]}</Text>
                    <Text variant="label" muted style={NUM}>{m.logs.length ? `${formatKcal(m.kcal)} kcal` : '—'}</Text>
                  </View>
                  {m.logs.map((log) => (
                    <Press key={log.id} accessibilityRole="button" accessibilityHint="Change the amount or meal" onPress={() => setOpen({ kind: 'edit', log })}
                      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, paddingVertical: space[2], paddingHorizontal: 14, borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, opacity: pressed ? 0.8 : 1 })}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text weight="semi" numberOfLines={2}>{log.name}</Text>
                        <Text variant="label" muted>{logAmount(log, foods)} · {Math.round(log.protein_g)} g protein</Text>
                      </View>
                      <Text weight="bold" style={NUM}>{formatKcal(log.kcal)}</Text>
                    </Press>
                  ))}
                  {m.logs.length === 0 && (
                    <Press accessibilityRole="button" onPress={() => { setForMeal(meal); scroller.current?.scrollTo({ y: 380, animated: true }); input.current?.focus(); }}
                      style={({ pressed }) => ({ minHeight: 52, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
                      <Text weight="semi" muted>+ Add {meal === 'snack' ? 'a snack' : meal}</Text>
                    </Press>
                  )}
                </View>
              );
            })}
          </Card>
          </>}
        </View>
      </ScrollView>

      {open?.kind === 'log' && <LogSheet onPaid={(amount, note) => setPaid({ amount, note })} pick={open.pick} grams={open.grams} meal={open.meal ?? mealAt(hour)} totals={totals} goals={goals}
        onEditFood={open.pick.food ? () => setOpen({ kind: 'food', food: open.pick.food }) : undefined} onClose={() => setOpen(null)} />}
      {open?.kind === 'edit' && <EditLogSheet log={open.log} food={foods.find((f) => f.id === open.log.food_id) ?? null} onClose={() => setOpen(null)} />}
      {open?.kind === 'scan' && <BarcodeScanner onCode={scanned} onClose={() => setOpen(null)} />}
      {open?.kind === 'photo' && <FoodCamera onClose={() => setOpen(null)} onPick={(search) => { setOpen(null); setQuery(search); input.current?.focus(); }} />}
      {open?.kind === 'food' && <FoodSheet food={open.food} name={open.name} barcode={open.barcode} onClose={() => setOpen(null)}
        onSaved={(food) => setOpen({ kind: 'log', pick: { food, starter: null }, meal: forMeal ?? undefined })} />}
      {open?.kind === 'goals' && <GoalsSheet goals={goals} onClose={() => setOpen(null)} />}
      {paid && (
        <Animated.View entering={ENTER} exiting={LEAVE} accessibilityLiveRegion="polite"
          style={{ position: 'absolute', left: space[4], right: space[4], bottom: insets.bottom + 100, flexDirection: 'row', alignItems: 'center', gap: space[3],
            paddingLeft: space[5], paddingRight: space[2], paddingVertical: space[2], borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.raised }}>
          <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>
            Log <Text variant="label" weight="bold" style={NUM}>{formatPeso(paid.amount)}</Text> for {paid.note}?
          </Text>
          <Press accessibilityRole="button" onPress={logPaid}
            style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: space[4], borderRadius: radius.pill, backgroundColor: colors.inkBlue, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
            <Text variant="label" weight="bold" style={{ color: colors.onInkBlue }}>Log it</Text>
          </Press>
          <Press accessibilityRole="button" accessibilityLabel="Not now" onPress={() => setPaid(null)} hitSlop={4} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Text weight="semi" muted>✕</Text>
          </Press>
        </Animated.View>
      )}
      {logging && (
        <TransactionEditor tx={null} direction="out" amount={logging.amount} note={logging.note} categoryId={foodCategoryId(logging.categories) ?? undefined}
          accounts={logging.accounts} categories={logging.categories} onClose={() => setLogging(null)} />
      )}
    </View>
  );
}

function GramsField({ text, setText }: { text: string; setText: (t: string) => void }) {
  const step = (d: number) => setText(String(Math.max(1, Math.round((parseGrams(text) ?? 0) + d))));
  const stepper = (label: string, d: number, glyph: string) => (
    <Press accessibilityRole="button" accessibilityLabel={label} onPress={() => step(d)}
      style={({ pressed }) => ({ width: 56, height: 64, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: pressed ? colors.line : colors.raised, alignItems: 'center', justifyContent: 'center' })}>
      <Text variant="heading">{glyph}</Text>
    </Press>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
      {stepper('10 grams less', -10, '−')}
      <View style={{ flex: 1, height: 64, borderRadius: 20, borderWidth: 2, borderColor: colors.inkBlue, backgroundColor: colors.night, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <TextInput accessibilityLabel="Grams" value={text} onChangeText={setText} keyboardType="decimal-pad" selectTextOnFocus
          style={{ minWidth: 80, textAlign: 'right', color: colors.text, fontSize: 34, fontFamily: 'BricolageGrotesque_800ExtraBold', fontVariant: ['tabular-nums'], padding: 0 }} />
        <Text weight="semi" muted style={{ fontSize: 18 }}>g</Text>
      </View>
      {stepper('10 grams more', 10, '+')}
    </View>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <View style={{ flex: 1, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.night, gap: 2 }}>
      <Text variant="small" weight="bold" style={LABEL}>{label}</Text>
      <Text variant="heading" style={[NUM, color ? { color } : null]}>{value}</Text>
      {sub && <Text variant="small" muted>{sub}</Text>}
    </View>
  );
}

/** Pick an amount (grams or a serving) and a meal, see what it adds up to, and log it. */
function LogSheet({ pick, grams: startGrams, meal: startMeal, totals, goals, onPaid, onEditFood, onClose }: {
  pick: Pick; grams?: number; meal: Meal; totals: ReturnType<typeof dayTotals>; goals: HealthGoals | null; onPaid: (amount: number, note: string) => void; onEditFood?: () => void; onClose: () => void;
}) {
  const [price, setPrice] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const source = pick.food ?? pick.starter;
  const servings: Serving[] = pick.food ? servingsOf(pick.food) : pick.starter?.servings ?? [];
  const [gramsText, setGramsText] = useState(String(startGrams ?? servings[0]?.grams ?? 100));
  const [meal, setMeal] = useState<Meal>(startMeal);
  const [naming, setNaming] = useState(false);
  const [servingName, setServingName] = useState('');
  if (!source) return null;
  const grams = parseGrams(gramsText);
  const n = grams ? nutrition(source, grams) : { kcal: 0, protein: 0 };
  const kcalAfter = goals?.kcal_target ? Math.round(goals.kcal_target - totals.kcal - n.kcal) : null;
  const proteinAfter = goals?.protein_target_g ? Math.round(goals.protein_target_g - totals.protein - n.protein) : null;
  const sourceName = pick.food ? (pick.food.source === 'own' ? 'Your food' : FOOD_SOURCE_LABEL[pick.food.source]) : FOOD_SOURCE_LABEL[pick.starter!.source];

  async function add() {
    if (!grams) return;
    const label = servingName.trim();
    const addServing = naming && label && !servings.some((s) => s.label.toLowerCase() === label.toLowerCase()) ? { label: label.slice(0, 30), grams } : null;
    const amount = price.trim() ? parseAmount(price) : null;
    if (price.trim() && !amount) return setProblem('Enter what you paid, like 150, or leave it blank.');
    onClose();
    await logFood(pick, grams, meal, addServing);
    if (amount) onPaid(amount, source!.name);
  }

  return (
    <Sheet title={source.name} onClose={onClose}>
      <Text variant="label" muted>{sourceName} · {formatKcal(source.kcal_per_100g)} kcal · {source.protein_per_100g} g protein per 100 g</Text>
      {onEditFood && <View style={styles.row}><Chip dashed label="Edit food" onPress={onEditFood} /></View>}
      <GramsField text={gramsText} setText={setGramsText} />
      <Wrap>
        {servings.map((s) => <Chip key={s.label} label={`${s.label} · ${formatGrams(s.grams)} g`} active={grams === s.grams} onPress={() => { setGramsText(String(s.grams)); setNaming(false); }} />)}
        {!naming && grams && <Chip dashed label={`+ Save ${formatGrams(grams)} g as a serving`} onPress={() => setNaming(true)} />}
      </Wrap>
      {naming && (
        <Field label={`Name this serving (${grams ? formatGrams(grams) : '…'} g)`}>
          <TextInput accessibilityLabel="Serving name" style={styles.input} value={servingName} maxLength={30} placeholder="1 plate, 1 piece, 1 scoop" placeholderTextColor={colors.faint} onChangeText={setServingName} />
        </Field>
      )}
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        <Stat label="CALORIES" value={formatKcal(n.kcal)} sub={kcalAfter === null ? undefined : kcalAfter >= 0 ? `${formatKcal(kcalAfter)} left after this` : `${formatKcal(-kcalAfter)} over after this`} />
        <Stat label="PROTEIN" value={`${Math.round(n.protein)} g`} color={colors.tongue} sub={proteinAfter === null ? undefined : proteinAfter > 0 ? `${proteinAfter} g to go after this` : 'Target reached'} />
      </View>
      <Segmented<Meal> label="Meal" value={meal} options={MEAL_OPTIONS} onChange={setMeal} />
      <Field label="Paid (optional)">
        <TextInput accessibilityLabel="What you paid, in pesos" style={[styles.input, { width: 140 }]} value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="₱150" placeholderTextColor={colors.faint} />
      </Field>
      {problem && <Text variant="label" style={{ color: colors.red }} accessibilityRole="alert">{problem}</Text>}
      <Button primary label={`Add to ${meal === 'snack' ? 'snacks' : MEAL_LABEL[meal].toLowerCase()}`} disabled={!grams} onPress={add} />
    </Sheet>
  );
}

function EditLogSheet({ log, food, onClose }: { log: FoodLog; food: Food | null; onClose: () => void }) {
  const servings = food ? servingsOf(food) : [];
  const [gramsText, setGramsText] = useState(formatGrams(log.grams));
  const [meal, setMeal] = useState<Meal>(log.meal);
  const grams = parseGrams(gramsText);
  const per = food ?? { kcal_per_100g: (log.kcal / log.grams) * 100, protein_per_100g: (log.protein_g / log.grams) * 100 };
  const n = grams ? nutrition(per, grams) : { kcal: 0, protein: 0 };
  return (
    <Sheet title={log.name} onClose={onClose}>
      <GramsField text={gramsText} setText={setGramsText} />
      {servings.length > 0 && <Wrap>{servings.map((s) => <Chip key={s.label} label={`${s.label} · ${formatGrams(s.grams)} g`} active={grams === s.grams} onPress={() => setGramsText(String(s.grams))} />)}</Wrap>}
      <Text muted style={NUM}>{formatKcal(n.kcal)} kcal · {Math.round(n.protein)} g protein</Text>
      <Segmented<Meal> label="Meal" value={meal} options={MEAL_OPTIONS} onChange={setMeal} />
      <Button primary label="Save" disabled={!grams} onPress={async () => { if (!grams) return; onClose(); await updateLog(log, food, grams, meal); }} />
      <Press accessibilityRole="button" onPress={() => { onClose(); removeLog(log); }} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
        <Text weight="semi" style={{ color: colors.red }}>Remove</Text>
      </Press>
    </Sheet>
  );
}

/** Add a food of your own (from its label, or PhilFCT by hand), or change one. */
function FoodSheet({ food, name: startName, barcode, onSaved, onClose }: { food: Food | null; name?: string; barcode?: string; onSaved: (food: Food) => void; onClose: () => void }) {
  const [name, setName] = useState(food?.name ?? startName ?? '');
  const [kcal, setKcal] = useState(food ? String(food.kcal_per_100g) : '');
  const [protein, setProtein] = useState(food ? String(food.protein_per_100g) : '');
  const [servings, setServings] = useState<Serving[]>(food ? servingsOf(food) : []);
  const [newLabel, setNewLabel] = useState('');
  const [newGrams, setNewGrams] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  function addServing() {
    const g = parseGrams(newGrams);
    if (!newLabel.trim() || !g) return setProblem('Give the serving a name and its grams, like “1 plate” and 300.');
    setServings((all) => [...all, { label: newLabel.trim().slice(0, 30), grams: g }]);
    setNewLabel('');
    setNewGrams('');
    setProblem(null);
  }
  async function save() {
    const k = Number(kcal.replace(',', '.'));
    const p = Number(protein.replace(',', '.'));
    if (!name.trim()) return setProblem('Give the food a name.');
    if (!kcal.trim() || !Number.isFinite(k) || k < 0 || k > 900) return setProblem('Calories per 100 g should be between 0 and 900.');
    if (!protein.trim() || !Number.isFinite(p) || p < 0 || p > 100) return setProblem('Protein per 100 g should be between 0 and 100.');
    onSaved(await saveFood({ name: name.trim().slice(0, 80), kcal_per_100g: Math.round(k * 10) / 10, protein_per_100g: Math.round(p * 10) / 10, servings, barcode: barcode ?? null }, food));
  }

  return (
    <Sheet title={food ? 'Edit food' : 'New food'} onClose={onClose}>
      <Field label="Name">
        <TextInput accessibilityLabel="Name" style={styles.input} value={name} maxLength={80} onChangeText={setName} placeholder={barcode ? 'What’s on the pack' : undefined} placeholderTextColor={colors.faint} autoFocus={!!barcode} />
      </Field>
      {barcode && <Text variant="label" style={{ color: colors.amber }}>Barcode {barcode} isn’t on Open Food Facts yet. Add it from the label once and it’s yours the next time you scan it.</Text>}
      <Text variant="label" muted>From the nutrition label, or look it up in the Philippine Food Composition Tables (PhilFCT). Use the figures per 100 g.</Text>
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        <View style={{ flex: 1 }}><Field label="Calories per 100 g"><TextInput accessibilityLabel="Calories per 100 grams" style={styles.input} value={kcal} onChangeText={setKcal} keyboardType="decimal-pad" placeholder="157" placeholderTextColor={colors.faint} autoFocus={!!startName} /></Field></View>
        <View style={{ flex: 1 }}><Field label="Protein per 100 g"><TextInput accessibilityLabel="Protein grams per 100 grams" style={styles.input} value={protein} onChangeText={setProtein} keyboardType="decimal-pad" placeholder="17.6" placeholderTextColor={colors.faint} /></Field></View>
      </View>
      <Field label="Servings">
        {servings.length > 0 && <Wrap>{servings.map((s, i) => <Chip key={`${s.label}-${i}`} label={`${s.label} · ${formatGrams(s.grams)} g  ✕`} onPress={() => setServings((all) => all.filter((_, j) => j !== i))} />)}</Wrap>}
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <TextInput accessibilityLabel="Serving name" style={[styles.input, { flex: 1 }]} value={newLabel} maxLength={30} placeholder="1 plate" placeholderTextColor={colors.faint} onChangeText={setNewLabel} />
          <TextInput accessibilityLabel="Serving grams" style={[styles.input, { width: 96 }]} value={newGrams} keyboardType="decimal-pad" placeholder="grams" placeholderTextColor={colors.faint} onChangeText={setNewGrams} />
          <Button label="Add" onPress={addServing} />
        </View>
      </Field>
      {problem && <Text variant="label" style={{ color: colors.red }} accessibilityRole="alert">{problem}</Text>}
      <Button primary label={food ? 'Save' : 'Save and log'} onPress={save} />
      {food && (
        <Press accessibilityRole="button" onPress={() => { onClose(); removeFood(food); }} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Text weight="semi" style={{ color: colors.red }}>Delete food</Text>
        </Press>
      )}
    </Sheet>
  );
}

function GoalsSheet({ goals, onClose }: { goals: HealthGoals | null; onClose: () => void }) {
  const [kcal, setKcal] = useState(goals?.kcal_target ? String(goals.kcal_target) : '');
  const [protein, setProtein] = useState(goals?.protein_target_g ? String(goals.protein_target_g) : '');
  const [glasses, setGlasses] = useState(String(goals?.water_glasses ?? 8));
  const [problem, setProblem] = useState<string | null>(null);
  async function save() {
    const k = kcal.trim() ? Math.round(Number(kcal.replace(/,/g, ''))) : null;
    const p = protein.trim() ? Math.round(Number(protein)) : null;
    const w = Math.round(Number(glasses));
    if (k !== null && !(k >= 500 && k <= 10000)) return setProblem('Calories should be between 500 and 10,000 a day.');
    if (p !== null && !(p >= 10 && p <= 500)) return setProblem('Protein should be between 10 and 500 g a day.');
    if (!(w >= 1 && w <= 30)) return setProblem('Glasses of water should be between 1 and 30.');
    onClose();
    await saveGoals(goals, { kcal_target: k, protein_target_g: p, water_glasses: w });
  }
  return (
    <Sheet title="Daily targets" onClose={onClose}>
      <Text variant="label" muted>Your own numbers. Leave one blank to stop tracking it.</Text>
      <View style={{ flexDirection: 'row', gap: space[3] }}>
        <View style={{ flex: 1 }}><Field label="Calories (kcal)"><TextInput accessibilityLabel="Daily calories" style={styles.input} value={kcal} onChangeText={setKcal} keyboardType="number-pad" placeholder="2200" placeholderTextColor={colors.faint} /></Field></View>
        <View style={{ flex: 1 }}><Field label="Protein (g)"><TextInput accessibilityLabel="Daily protein in grams" style={styles.input} value={protein} onChangeText={setProtein} keyboardType="number-pad" placeholder="120" placeholderTextColor={colors.faint} /></Field></View>
      </View>
      <Field label="Glasses of water"><TextInput accessibilityLabel="Glasses of water a day" style={[styles.input, { width: 120 }]} value={glasses} onChangeText={setGlasses} keyboardType="number-pad" /></Field>
      {problem && <Text variant="label" style={{ color: colors.red }} accessibilityRole="alert">{problem}</Text>}
      <Button primary label="Save" onPress={save} />
    </Sheet>
  );
}

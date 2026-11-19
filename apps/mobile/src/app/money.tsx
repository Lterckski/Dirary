import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import * as Haptics from 'expo-haptics';
import Animated, { ReduceMotion, ZoomIn } from 'react-native-reanimated';
import { AppState, ScrollView, Share, TextInput, View } from 'react-native';
import { Press } from '@/components/press';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Path, Svg } from 'react-native-svg';
import { colors, radius, space } from '@dirary/ui';
import {
  isFoodSpend,
  accountBalance, budgetCoach, dayLabel, endOfDayBalances, stashProgress, stashSummary, dueLabel, findTransferPairs, fixedThisMonth, formatPeso, formatPesoShort, monthName, monthlyRecap, recapLine, localDate, monthSummary, needsReview, parseMoneyQuickAdd, recentTransactions, safeToSpend, spendCoach,
  type Institution, type MonthRecap, type Stash, type Transaction,
} from '@dirary/shared';

import { Confetti } from '@/components/confetti';
import { Mascot, MascotPaws } from '@/components/mascot';
import { Bar, ChangeTag, useChange } from '@/components/motion-bits';
import { CHECKED_MS, EASE_OUT, ENTER, LEAVE, MOVE } from '@/lib/motion';
import { AccountsEditor, BudgetEditor, ResetEditor, StashEditor, StashMoveEditor, CategoriesEditor, FixedEditor, Segmented, TransactionEditor, TransferEditor, TxRow } from '@/components/money-editor';
import { Chip, Group } from '@/components/task-bits';
import { Button, Card, TAB_BAR_CLEARANCE, Text, styles } from '@/components/ui';
import { useAddRequest } from '@/lib/add-bus';
import { router } from 'expo-router';
import { addStarterSet, addTransaction, linkTransfer, logCaptured, payFixed, removeTransaction, updateTransaction, useMoneyStore } from '@/lib/money-store';
import { Sheet } from '@/components/task-editor';
import { captureAvailable, captureCount, clearCaptures, getCaptures, isCaptureEnabled, openCaptureSettings, type Capture } from '../../modules/dirary-capture';

const toLocal = (iso: string) => localDate(new Date(iso));
/** Who the app greets. Dirary is a one-person app. */
const GREETING_NAME = 'Luther';
/** Each account card in the wallet takes its colour from where the money is kept. */
const CARD_COLOR: Record<Institution, string> = { securitybank: colors.amber, gotyme: colors.tongue, gcash: colors.inkBlue, cash: colors.text, other: colors.muted };
const LABEL = { letterSpacing: 1.4, color: colors.muted } as const;
const NUM = { fontVariant: ['tabular-nums' as const] };

type Sheet = { kind: 'tx'; tx: Transaction | null; categoryId?: string; direction?: 'in' | 'out'; accountId?: string } | { kind: 'fixed' } | { kind: 'budget' } | { kind: 'reset' } | { kind: 'stash'; stash: Stash | null } | { kind: 'stashMove'; stash: Stash; mode: 'in' | 'out' } | { kind: 'accounts' } | { kind: 'categories' } | { kind: 'transfer' } | null;

export default function MoneyScreen() {
  const { accounts, categories, transactions, fixed, plan, stashes, loading } = useMoneyStore();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<Sheet>(null);

  // After you log food spending, a chip offers to log what you ate. Never a pop-up: it goes away on its own.
  const [ate, setAte] = useState<{ query: string } | null>(null);
  const seenTx = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (loading) return;
    if (!seenTx.current) { seenTx.current = new Set(transactions.map((t) => t.id)); return; }
    for (const t of transactions) {
      if (seenTx.current.has(t.id)) continue;
      seenTx.current.add(t.id);
      const justNow = Date.now() - new Date(t.created_at).getTime() < 120_000;
      if (justNow && isFoodSpend(t, categories)) setAte({ query: (t.merchant ?? '').trim() });
    }
  }, [transactions, categories, loading]);
  useEffect(() => {
    if (!ate) return;
    const timer = setTimeout(() => setAte(null), 10000);
    return () => clearTimeout(timer);
  }, [ate]);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'in' | 'out'>('out');
  const today = localDate();
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const summary = useMemo(() => monthSummary(transactions, categories, today.slice(0, 7), toLocal), [transactions, categories, today]);
  const fixedSummary = useMemo(() => fixedThisMonth(fixed, transactions, today, toLocal), [fixed, transactions, today]);
  const safe = useMemo(() => safeToSpend(plan, fixed, transactions, today, toLocal), [plan, fixed, transactions, today]);
  // Ink speaks about today's allowance first; a category over budget takes over when there is one.
  const budgetLine = budgetCoach(summary, now.getDate(), daysInMonth);
  const coach = budgetLine.mood === 'worried' && safe.safeToday >= 0 ? budgetLine : spendCoach(safe, fixedSummary, formatPeso);
  const stash = useMemo(() => stashSummary(stashes, accounts, transactions), [stashes, accounts, transactions]);

  // A floating "−₱130" beside the big numbers whenever they change after the screen has loaded.
  const safeChange = useChange(loading ? null : safe.ready ? safe.safeToday : safe.spentToday);
  const walletChange = useChange(loading ? null : stash.stashed > 0 ? stash.spendable : stash.total);

  // New transactions slide in (the ones there on open don't); confirmed "To review" items fade and the rest glide up.
  const known = useRef<Set<string> | null>(null);
  const fresh = useRef(new Set<string>());
  const markFresh = (id: string) => { fresh.current.add(id); setTimeout(() => fresh.current.delete(id), 800); };
  if (!loading) {
    if (!known.current) known.current = new Set(transactions.map((t) => t.id));
    for (const t of transactions) if (!known.current.has(t.id)) { known.current.add(t.id); markFresh(t.id); }
  }
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  function confirm(t: Transaction) {
    setLeaving((cur) => new Set(cur).add(t.id));
    markFresh(t.id);
    updateTransaction(t, { status: 'confirmed' });
  }

  // Ticking a fixed expense: it shows as paid for a moment, then the payment is logged and the row glides down.
  const [paying, setPaying] = useState<Set<string>>(new Set());
  const payTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  function tickFixed(item: (typeof fixedSummary.items)[number]) {
    if (item.payment) return removeTransaction(item.payment);
    const id = item.expense.id;
    const timer = payTimers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      payTimers.current.delete(id);
      return setPaying((cur) => { const next = new Set(cur); next.delete(id); return next; });
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPaying((cur) => new Set(cur).add(id));
    payTimers.current.set(id, setTimeout(() => { payTimers.current.delete(id); payFixed(item.expense, accounts[0]?.id ?? null); }, CHECKED_MS));
  }
  // Saving is asynchronous, so rows keep their in-between look until the saved change reaches the list.
  useEffect(() => {
    setLeaving((cur) => (cur.size === 0 ? cur : new Set([...cur].filter((id) => transactions.some((t) => t.id === id && t.status === 'needs_review')))));
    setPaying((cur) => (cur.size === 0 ? cur : new Set([...cur].filter((id) => payTimers.current.has(id)))));
  }, [transactions]);

  // Small celebrations: every fixed expense paid for the month, or a stash reaching its goal.
  const screenRef = useRef<ComponentRef<typeof View>>(null);
  const fixedRef = useRef<ComponentRef<typeof View>>(null);
  const stashRef = useRef<ComponentRef<typeof View>>(null);
  const [party, setParty] = useState<{ shot: number; origin: { x: number; y: number; width: number } | null; amount: number }>({ shot: 0, origin: null, amount: 1 });
  const celebrate = (from: ComponentRef<typeof View> | null, amount: number) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    screenRef.current?.measureInWindow((sx, sy) => {
      from?.measureInWindow((x, y, w, h) => setParty((p) => ({ shot: p.shot + 1, origin: { x: x - sx + w / 2, y: y - sy + h / 2, width: w }, amount })));
    });
  };
  const allPaid = fixedSummary.items.length > 0 && fixedSummary.paid === fixedSummary.total;
  const reached = stash.stashes.filter((s) => stashProgress(s) === 100).map((s) => s.id).join(',');
  const seen = useRef<{ allPaid: boolean; reached: Set<string> } | null>(null);
  useEffect(() => {
    if (loading) return;
    const now = new Set(reached ? reached.split(',') : []);
    const was = seen.current;
    seen.current = { allPaid, reached: now };
    if (!was) return;
    if (allPaid && !was.allPaid) celebrate(fixedRef.current, 0.5);
    else if ([...now].some((id) => !was.reached.has(id))) celebrate(stashRef.current, 0.6);
  }, [loading, allPaid, reached]); // eslint-disable-line react-hooks/exhaustive-deps
  const safePct = safe.dailyLimit === 0 ? (safe.spentToday > 0 ? 100 : 0) : Math.min(100, Math.round((safe.spentToday / safe.dailyLimit) * 100));
  const shortcuts = categories.filter((c) => c.kind === 'expense').slice(0, 4);
  const over = safe.ready && safe.safeToday < 0;
  const recap = useMemo(() => monthlyRecap(transactions, today, toLocal), [transactions, today]);

  // The floating + button opens the add form.
  useAddRequest('money', () => setSheet({ kind: 'tx', tx: null }));
  // The Day widget's "Expense" button opens the app with ?add=1.
  const params = useLocalSearchParams<{ add?: string }>();
  useEffect(() => { if (params.add) setSheet({ kind: 'tx', tx: null }); }, [params.add]);
  const inbox = useMemo(() => needsReview(transactions), [transactions]);
  const pairs = useMemo(() => findTransferPairs(inbox), [inbox]);
  const paired = new Set(pairs.flatMap((p) => [p.out.id, p.into.id]));
  // Tapping an account card shows only that account's transactions, with its balance at the end of each day.
  const [only, setOnly] = useState<string | null>(null);
  const shown = accounts.find((a) => a.id === only) ?? null;
  const recent = useMemo(() => recentTransactions(shown ? transactions.filter((t) => t.account_id === shown.id) : transactions, shown ? 300 : 40), [transactions, shown]);
  const dayBalances = useMemo(() => (shown ? endOfDayBalances(shown, transactions, toLocal) : null), [shown, transactions]);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const ledgerY = useRef(0);
  const showLedger = () => scroller.current?.scrollTo({ y: Math.max(0, ledgerY.current - space[4]), animated: true });
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const read = parseMoneyQuickAdd(text, categories, accounts, mode);
  const incoming = read.direction === 'in';
  function pickMode(next: 'in' | 'out') {
    setMode(next);
    // A typed + means money in; switching to Spent takes it out so the switch and the text agree.
    if (next === 'out') setText((t) => t.replace(/(^|\s)\+(?=\s*(?:₱|php)?\s*\d)/i, '$1'));
  }
  const account = accounts.find((a) => a.id === read.account_id) ?? accounts[0];
  async function add() {
    if (!read.amount_centavos || !account) return;
    setText('');
    await addTransaction({ account_id: account.id, category_id: read.category_id, amount_centavos: read.amount_centavos, direction: read.direction, merchant: read.merchant, note: null, occurred_at: new Date().toISOString() });
  }

  const days: { date: string; rows: Transaction[] }[] = [];
  for (const t of recent) {
    const date = toLocal(t.occurred_at);
    const last = days[days.length - 1];
    if (last && last.date === date) last.rows.push(t);
    else days.push({ date, rows: [t] });
  }
  const row = (t: Transaction, action?: { label: string; onPress: () => void }) => (
    <Animated.View key={t.id} layout={MOVE} entering={fresh.current.has(t.id) ? ENTER : undefined} exiting={leaving.has(t.id) ? LEAVE : undefined}>
      <TxRow tx={t} account={t.account_id ? accountById.get(t.account_id) : undefined} category={t.category_id ? categoryById.get(t.category_id) : undefined} onOpen={() => setSheet({ kind: 'tx', tx: t })} action={action} />
    </Animated.View>
  );

  if (loading) return <View style={[styles.screen, { padding: space[5], paddingTop: insets.top + space[5] }]}><Text muted>Loading your money…</Text></View>;

  if (accounts.length === 0 && categories.length === 0) {
    return (
      <View style={[styles.screen, { padding: space[5], paddingBottom: TAB_BAR_CLEARANCE, justifyContent: 'center' }]}>
        <Card style={{ alignItems: 'center', paddingVertical: space[8] }}>
          <Mascot mood="coach" size={128} />
          <Text style={{ textAlign: 'center' }}>Start with your accounts and a few categories. You can rename or remove any of them later.</Text>
          <Button primary label="Add my accounts" onPress={() => { addStarterSet(); }} />
        </Card>
      </View>
    );
  }

  return (
    <View ref={screenRef} style={styles.screen}>
      <ScrollView ref={scroller} contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }} keyboardShouldPersistTaps="handled">
        <View style={{ backgroundColor: colors.inkBlue, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, paddingTop: insets.top + space[4], paddingHorizontal: space[5], paddingBottom: 72 }}>
          <Text variant="small" weight="bold" style={{ color: colors.onInkBlue, letterSpacing: 1.3 }}>{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</Text>
          <Text variant="title" accessibilityRole="header" style={{ color: colors.onInkBlue }}>Hello, {GREETING_NAME}!</Text>
          {/* Ink sits behind the first card and peeks over its top edge. */}
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', right: space[6], bottom: 36 }}>
            <Mascot mood={coach.mood} size={96} />
          </View>
        </View>

        <View style={{ paddingHorizontal: space[5], gap: space[5], marginTop: -50 }}>
        <Card style={{ borderRadius: 28 }}>
          {/* Ink's front paws over the card's top edge, right under his face. The card has a 1px border. */}
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
            style={{ position: 'absolute', zIndex: 2, top: -14, right: space[6] - space[5] - 1 }}>
            <MascotPaws size={96} />
          </View>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text variant="small" weight="bold" style={LABEL}>SAFE TO SPEND TODAY</Text>
            <Press accessibilityRole="button" accessibilityLabel="Set monthly budget" onPress={() => setSheet({ kind: 'budget' })} hitSlop={2}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
              <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke={colors.text} strokeWidth={2} strokeLinejoin="round" /></Svg>
            </Press>
          </View>
          {safe.ready ? (
            <>
              <View>
                <Text variant="hero" style={[NUM, over && { color: colors.red }]} adjustsFontSizeToFit numberOfLines={1}>{formatPeso(safe.safeToday)}</Text>
                <View pointerEvents="none" style={{ position: 'absolute', right: 0, top: 10 }}><ChangeTag change={safeChange} /></View>
              </View>
              <Text variant="label" muted style={NUM}>of {formatPeso(safe.dailyLimit)} daily limit</Text>
              <Bar pct={safePct} height={12} color={over ? colors.red : colors.inkBlue} label="Today's limit used" />
              <Text weight="bold" style={NUM}>Today spent: {formatPeso(safe.spentToday)}</Text>
              <Text variant="label" muted style={NUM}>{safe.daysLeft} day{safe.daysLeft === 1 ? '' : 's'} left · {formatPeso(safe.leftThisMonth)} for the month</Text>
            </>
          ) : (
            <>
              <View>
                <Text variant="hero" style={NUM} adjustsFontSizeToFit numberOfLines={1}>{formatPeso(safe.spentToday)}</Text>
                <View pointerEvents="none" style={{ position: 'absolute', right: 0, top: 10 }}><ChangeTag change={safeChange} /></View>
              </View>
              <Text variant="label" muted>spent today</Text>
              <View style={styles.row}><Button primary label="Set a monthly budget" onPress={() => setSheet({ kind: 'budget' })} /></View>
            </>
          )}
          <View style={styles.row}>
            <Text style={{ flex: 1 }} accessibilityLiveRegion="polite">{coach.line}</Text>
          </View>
        </Card>

        {/* The wallet: account cards tucked into a stitched pocket. */}
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 14, paddingTop: 8, flexGrow: 1 }}>
            {accounts.map((a, i) => (
              <Press key={a.id} accessibilityRole="button" accessibilityState={{ selected: only === a.id }} accessibilityLabel={`${a.name}, ${formatPeso(accountBalance(a, transactions))}. Show only ${a.name} transactions`}
                onPress={() => setOnly((cur) => (cur === a.id ? null : a.id))}
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : shown && shown.id !== a.id ? 0.45 : 1, flexGrow: 1, minWidth: 112, marginTop: (i % 2 ? 8 : 0) + (only === a.id ? -6 : 0), borderWidth: only === a.id ? 2 : 0, borderBottomWidth: 0, borderColor: colors.text, paddingTop: space[3], paddingHorizontal: 14, paddingBottom: 40, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: CARD_COLOR[a.institution], gap: 2 })}>
                <Text variant="small" weight="bold" numberOfLines={1} style={{ color: colors.onInkBlue }}>{a.name}</Text>
                <Text variant="label" weight="bold" numberOfLines={1} style={[NUM, { color: colors.onInkBlue }]}>{formatPeso(accountBalance(a, transactions))}</Text>
                {(stash.byAccount.get(a.id)?.stashed ?? 0) > 0 && <Text variant="small" numberOfLines={1} style={[NUM, { color: colors.onInkBlue, opacity: 0.8 }]}>{formatPeso(stash.byAccount.get(a.id)!.stashed)} stashed</Text>}
              </Press>
            ))}
          </ScrollView>
          <View style={{ marginTop: -28, padding: space[6], borderRadius: 28, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.raised, overflow: 'hidden', gap: 6 }}>
            <View pointerEvents="none" style={{ position: 'absolute', top: 9, left: 9, right: 9, bottom: 9, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line }} />
            <Text variant="small" weight="bold" style={LABEL}>{stash.stashed > 0 ? 'SPENDABLE' : 'BALANCE'}</Text>
            <View>
              <Text variant="title" style={NUM} adjustsFontSizeToFit numberOfLines={1}>{formatPeso(stash.stashed > 0 ? stash.spendable : stash.total)}</Text>
              <View pointerEvents="none" style={{ position: 'absolute', right: 0, top: 4 }}><ChangeTag change={walletChange} /></View>
            </View>
            {stash.stashed > 0 && <Text variant="label" muted style={NUM}>{formatPeso(stash.stashed)} in stashes · {formatPeso(stash.total)} in total</Text>}
            {shown && (
              <View style={[styles.row, { flexWrap: 'wrap', gap: space[1] }]} accessibilityLiveRegion="polite">
                <Text variant="label" muted>Showing <Text variant="label" weight="bold">{shown.name}</Text> only.</Text>
                <Press accessibilityRole="button" onPress={showLedger} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: space[1] }}><Text variant="label" weight="semi" style={{ color: colors.inkBlue }}>See its transactions</Text></Press>
                <Press accessibilityRole="button" onPress={() => setOnly(null)} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: space[1] }}><Text variant="label" weight="semi" style={{ color: colors.inkBlue }}>Show all</Text></Press>
              </View>
            )}
            <View style={[styles.row, { flexWrap: 'wrap', gap: space[2], marginTop: space[2] }]}>
              <Press accessibilityRole="button" onPress={() => setSheet({ kind: 'tx', tx: null, direction: 'in', accountId: shown?.id })}
                style={{ minHeight: 44, paddingHorizontal: space[4], borderRadius: 22, backgroundColor: colors.inkBlue, justifyContent: 'center' }}>
                <Text variant="label" weight="bold" style={{ color: colors.onInkBlue }}>{shown ? `+ Add money to ${shown.name}` : '+ Add money'}</Text>
              </Press>
              {accounts.length > 1 && <Chip label="Transfer" onPress={() => setSheet({ kind: 'transfer' })} />}
              <Chip label="Accounts" onPress={() => setSheet({ kind: 'accounts' })} />
            </View>
          </View>
        </View>

        <View ref={stashRef} collapsable={false}>
        <Card>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text variant="small" weight="bold" style={LABEL}>STASHES</Text>
            <Chip dashed label="Add" onPress={() => setSheet({ kind: 'stash', stash: null })} />
          </View>
          {stash.stashes.length === 0 ? (
            <Text variant="label" muted>Set money aside for an emergency fund, tuition or anything else. It stays in its account but stops counting as spendable.</Text>
          ) : stash.stashes.map((s) => {
            const pct = stashProgress(s);
            return (
              <View key={s.id} style={{ gap: space[2], paddingTop: space[2], borderTopWidth: 1, borderColor: colors.line }}>
                <Press accessibilityRole="button" accessibilityLabel={`Edit ${s.name}`} onPress={() => setSheet({ kind: 'stash', stash: s })} style={[styles.row, { minHeight: 44 }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text weight="semi">{s.name}</Text>
                    <Text variant="label" muted>{accountById.get(s.account_id)?.name}{s.goal_centavos ? ` · goal ${formatPeso(s.goal_centavos)}` : ''}</Text>
                  </View>
                  <Text weight="bold" style={NUM}>{formatPeso(s.amount_centavos)}</Text>
                </Press>
                {pct !== null && (
                  <Bar pct={pct} color={colors.inkBlue} label={`${s.name} goal`} />
                )}
                <View style={[styles.row, { gap: space[2] }]}>
                  <Chip label="Put in" onPress={() => setSheet({ kind: 'stashMove', stash: s, mode: 'in' })} />
                  {s.amount_centavos > 0 && <Chip label="Take out" onPress={() => setSheet({ kind: 'stashMove', stash: s, mode: 'out' })} />}
                </View>
              </View>
            );
          })}
          {stash.overdrawn.length > 0 && (
            <Text variant="label" style={{ color: colors.amber }} accessibilityRole="alert">
              More is set aside in {stash.overdrawn.map((a) => a.name).join(' and ')} than {stash.overdrawn.length === 1 ? 'it holds' : 'they hold'}. Take some out of a stash, or check that balance.
            </Text>
          )}
        </Card>
        </View>

        {shortcuts.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {shortcuts.map((c) => (
              <Press key={c.id} accessibilityRole="button" accessibilityLabel={`Add ${c.name} spending`} onPress={() => setSheet({ kind: 'tx', tx: null, categoryId: c.id })}
                style={({ pressed }) => ({ flex: 1, minHeight: 88, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: space[2], paddingHorizontal: 6, opacity: pressed ? 0.7 : 1 })}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors[c.color], alignItems: 'center', justifyContent: 'center' }}>
                  <Text variant="heading" style={{ color: colors.onInkBlue, fontSize: 17, lineHeight: 22 }}>{c.name.charAt(0)}</Text>
                </View>
                <Text variant="small" weight="bold" numberOfLines={1} style={{ letterSpacing: 0.5 }}>{c.name.toUpperCase()}</Text>
              </Press>
            ))}
          </View>
        )}

        <View style={{ gap: space[2] }}>
          <Segmented label="Money out or in" value={incoming ? 'in' : 'out'} options={[{ value: 'out', label: 'Spent' }, { value: 'in', label: 'Received' }]} onChange={pickMode} />
          <View style={styles.row}>
            <TextInput accessibilityLabel={incoming ? 'New money in' : 'New spending'} style={[styles.input, { flex: 1 }]} value={text} maxLength={160} placeholder={incoming ? '5000 allowance @gotyme' : '250 jollibee #food @gcash'} placeholderTextColor={colors.faint} onChangeText={setText} onSubmitEditing={add} returnKeyType="done" />
            <Button primary label="Add" disabled={!read.amount_centavos || !account} onPress={add} />
          </View>
          <Text variant="label" style={{ color: colors.faint, paddingLeft: 4 }}>
            {read.amount_centavos && account
              ? <>{incoming ? 'Adds' : 'Takes'} <Text variant="label" weight="semi" style={{ color: incoming ? colors.inkBlue : colors.text }}>{formatPeso(incoming ? read.amount_centavos : -read.amount_centavos, { sign: true })}</Text> {incoming ? 'to' : 'from'} {account.name}{read.merchant ? ` · ${read.merchant}` : ''} · {categoryById.get(read.category_id ?? '')?.name ?? 'no category'}</>
              : incoming ? 'Amount and where it came from, then @account. Example: 5000 allowance @gotyme.' : 'Amount, what it was, #category and @account.'}
          </Text>
        </View>

        <View ref={fixedRef} collapsable={false}>
        <Card>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text variant="small" weight="bold" style={LABEL}>FIXED THIS MONTH</Text>
            <Chip dashed label={fixedSummary.items.length > 0 ? 'Edit' : 'Add'} onPress={() => setSheet({ kind: 'fixed' })} />
          </View>
          {fixedSummary.items.length === 0 ? (
            <Text variant="label" muted>Add what you pay every month, like rent, internet or a subscription. Dirary sets that money aside before working out what's safe to spend.</Text>
          ) : (
            <>
              <Text variant="label" muted style={NUM}>{formatPeso(fixedSummary.paid)} of {formatPeso(fixedSummary.total)} paid</Text>
              {fixedSummary.items.map((item) => ({ ...item, paid: item.paid || paying.has(item.expense.id) })).map((i) => {
                const edge = i.paid || i.dueIn > 3 ? colors.inkBlue : i.dueIn < 0 ? colors.red : colors.amber;
                return (
                  // Rows glide to their new place when a paid one moves to the bottom.
                  <Animated.View key={i.expense.id} layout={MOVE} style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -space[3] }}>
                    <Press
                      accessibilityRole="checkbox" accessibilityState={{ checked: i.paid }}
                      accessibilityLabel={`${i.expense.name}, ${formatPeso(i.expense.amount_centavos)}, mark ${i.paid ? 'not paid' : 'paid'}`}
                      onPress={() => tickFixed(i)}
                      style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                      <View style={{ width: 26, height: 26, borderRadius: radius.sm, borderWidth: 2.5, borderColor: edge, backgroundColor: i.paid ? colors.inkBlue : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                        {i.paid && (
                          <Animated.View entering={paying.has(i.expense.id) ? ZoomIn.duration(180).easing(EASE_OUT).reduceMotion(ReduceMotion.System) : undefined}>
                            <Svg width={16} height={16} viewBox="0 0 16 16"><Path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke={colors.onInkBlue} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>
                          </Animated.View>
                        )}
                      </View>
                    </Press>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text weight={i.paid ? 'medium' : 'semi'} style={i.paid ? { color: colors.faint, textDecorationLine: 'line-through' } : undefined}>{i.expense.name}</Text>
                      {!i.paid && <Text variant="label" style={{ color: i.dueIn < 0 ? colors.red : i.dueIn <= 3 ? colors.amber : colors.muted }}>{dueLabel(i)}</Text>}
                    </View>
                    <Text weight="bold" style={[NUM, i.paid && { color: colors.faint }]}>{formatPeso(i.expense.amount_centavos)}</Text>
                  </Animated.View>
                );
              })}
            </>
          )}
        </Card>
        </View>

        <CaptureCard />

        {inbox.length > 0 && (
          <View style={{ gap: space[2] }}>
            <Text variant="small" weight="semi" style={{ color: colors.amber, letterSpacing: 1, paddingLeft: 4 }}>TO REVIEW · {inbox.length}</Text>
            <Text variant="label" muted>Logged from your notifications. Each one only counts once you confirm it.</Text>
            {pairs.map((p) => (
              <View key={p.out.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderRadius: radius.lg, borderWidth: 1, borderColor: colors.amber, backgroundColor: colors.surface }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text weight="semi">Looks like a transfer: {formatPeso(p.out.amount_centavos)}</Text>
                  <Text variant="label" muted>{accountById.get(p.out.account_id ?? '')?.name} → {accountById.get(p.into.account_id ?? '')?.name}</Text>
                </View>
                <Press accessibilityRole="button" onPress={() => linkTransfer(p.out, p.into)} style={{ minHeight: 44, paddingHorizontal: space[4], borderRadius: 22, backgroundColor: colors.inkBlue, justifyContent: 'center' }}>
                  <Text variant="label" weight="bold" style={{ color: colors.onInkBlue }}>Link</Text>
                </Press>
              </View>
            ))}
            {inbox.filter((t) => !paired.has(t.id)).map((t) => row(t, { label: 'Confirm', onPress: () => (t.account_id ? confirm(t) : setSheet({ kind: 'tx', tx: t })) }))}
          </View>
        )}

        <Group title="Categories this month">
          {summary.categories.length === 0 && summary.uncategorized === 0 && <Text variant="label" muted>Nothing spent yet this month.</Text>}
          {summary.categories.map((r) => {
            const pct = r.limit ? Math.min(100, Math.round((r.spent / r.limit) * 100)) : 0;
            const over = r.left !== null && r.left < 0;
            return (
              <View key={r.category.id} style={{ padding: space[4], borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, gap: space[2] }}>
                <View style={[styles.row, { justifyContent: 'space-between' }]}>
                  <View style={[styles.row, { gap: space[2], flex: 1 }]}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors[r.category.color] }} />
                    <Text weight="semi">{r.category.name}</Text>
                  </View>
                  <Text weight="bold" style={{ color: over ? colors.red : colors.text, fontVariant: ['tabular-nums'] }}>
                    {formatPeso(r.spent)}{r.limit !== null && <Text muted> of {formatPeso(r.limit)}</Text>}
                  </Text>
                </View>
                {r.limit !== null && (
                  <>
                    <Bar pct={pct} color={over ? colors.red : colors.inkBlue} label={`${r.category.name} budget used`} />
                    <Text variant="label" style={{ color: over ? colors.red : colors.muted }}>{over ? `Over by ${formatPeso(-(r.left as number))}` : `${formatPeso(r.left as number)} left`}</Text>
                  </>
                )}
              </View>
            );
          })}
          {summary.uncategorized > 0 && (
            <View style={[styles.row, { justifyContent: 'space-between', padding: space[4], borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }]}>
              <Text weight="semi" muted>No category</Text>
              <Text weight="bold" style={{ fontVariant: ['tabular-nums'] }}>{formatPeso(summary.uncategorized)}</Text>
            </View>
          )}
          <View style={styles.row}><Chip dashed label="Edit categories and budgets" onPress={() => setSheet({ kind: 'categories' })} /></View>
        </Group>

        <Recap months={recap} />

        <View onLayout={(e) => { ledgerY.current = e.nativeEvent.layout.y; }} style={{ gap: space[5] }}>
        {shown && (
          <View style={[styles.row, { justifyContent: 'space-between', flexWrap: 'wrap' }]}>
            <Text weight="bold" style={NUM}>{shown.name} · {formatPeso(accountBalance(shown, transactions))} now</Text>
            <Chip dashed label="Show all accounts" onPress={() => setOnly(null)} />
          </View>
        )}
        {shown && days.length === 0 ? (
          <Text variant="label" muted>No transactions in {shown.name} yet. Its balance is the opening balance, {formatPeso(shown.opening_balance_centavos)}.</Text>
        ) : days.length === 0 ? (
          <Card style={{ alignItems: 'center', paddingVertical: space[8] }}>
            <Text muted style={{ textAlign: 'center' }}>No transactions yet. Add one above.</Text>
          </Card>
        ) : days.map((d) => (
          <Group key={d.date} title={dayBalances?.has(d.date) ? `${dayLabel(d.date, today)} · ${formatPeso(dayBalances.get(d.date)!)} at end of day` : dayLabel(d.date, today)}>
            {d.rows.map((t) => row(t))}
          </Group>
        ))}
        </View>
        </View>
      </ScrollView>

      {sheet?.kind === 'fixed' && <FixedEditor fixed={fixed} accounts={accounts} categories={categories} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'budget' && <BudgetEditor plan={plan} fixedTotal={fixedSummary.total} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'tx' && <TransactionEditor tx={sheet.tx} categoryId={sheet.categoryId} direction={sheet.direction} accountId={sheet.accountId} onTransfer={accounts.length > 1 ? () => setSheet({ kind: 'transfer' }) : undefined} accounts={accounts} categories={categories} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'transfer' && <TransferEditor accounts={accounts} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'accounts' && <AccountsEditor accounts={accounts} onReset={() => setSheet({ kind: 'reset' })} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'reset' && <ResetEditor count={transactions.length} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'stash' && <StashEditor stash={sheet.stash} accounts={accounts} count={stashes.length} startAccount={shown?.id} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'stashMove' && <StashMoveEditor stash={sheet.stash} mode={sheet.mode} free={stash.byAccount.get(sheet.stash.account_id)?.free ?? 0} accountName={accountById.get(sheet.stash.account_id)?.name ?? 'the account'} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'categories' && <CategoriesEditor categories={categories} onClose={() => setSheet(null)} />}
      {ate && (
        <Animated.View entering={ENTER} exiting={LEAVE} accessibilityLiveRegion="polite"
          style={{ position: 'absolute', left: space[4], right: space[4], bottom: insets.bottom + 100, flexDirection: 'row', alignItems: 'center', gap: space[3],
            paddingLeft: space[5], paddingRight: space[2], paddingVertical: space[2], borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.raised }}>
          <Text variant="label" numberOfLines={1} style={{ flex: 1 }}>Log what you ate{ate.query ? ` at ${ate.query}` : ''}?</Text>
          <Press accessibilityRole="button" onPress={() => { const q = ate.query; setAte(null); router.navigate({ pathname: '/health', params: { log: String(Date.now()), q } }); }}
            style={({ pressed }) => ({ minHeight: 40, paddingHorizontal: space[4], borderRadius: radius.pill, backgroundColor: colors.inkBlue, justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
            <Text variant="label" weight="bold" style={{ color: colors.onInkBlue }}>Log food</Text>
          </Press>
          <Press accessibilityRole="button" accessibilityLabel="Not now" onPress={() => setAte(null)} hitSlop={4} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <Text weight="semi" muted>✕</Text>
          </Press>
        </Animated.View>
      )}
      <Confetti shot={party.shot} origin={party.origin} amount={party.amount} />
    </View>
  );
}

/** Money in, spent and kept for this month, with up to six months side by side. */
function Recap({ months }: { months: MonthRecap[] }) {
  const now = months[months.length - 1];
  const top = Math.max(1, ...months.flatMap((m) => [m.income, m.spent]));
  const bar = (v: number, color: string) => <View style={{ flex: 1, height: Math.max(2, Math.round((v / top) * 96)), borderTopLeftRadius: 6, borderTopRightRadius: 6, backgroundColor: color }} />;
  const figure = (label: string, value: number, color: string = colors.text) => (
    <View style={{ flex: 1, gap: 2 }}>
      <Text variant="label" muted>{label}</Text>
      <Text variant="heading" numberOfLines={1} adjustsFontSizeToFit style={[NUM, { color }]}>{formatPeso(value)}</Text>
    </View>
  );
  return (
    <Card>
      <Text variant="small" weight="bold" style={LABEL}>MONTHLY RECAP</Text>
      {now && (
        <>
          <View style={[styles.row, { alignItems: 'flex-start' }]}>
            {figure('In', now.income)}
            {figure('Spent', now.spent)}
            {figure('Kept', now.saved, now.saved < 0 ? colors.red : colors.inkBlue)}
          </View>
          <Text variant="label" muted>{monthName(now.month, true)} so far</Text>
          <View style={{ flexDirection: 'row', gap: space[2], marginTop: space[1] }}>
            {months.map((m) => (
              <View key={m.month} accessible accessibilityLabel={`${monthName(m.month, true)}: ${formatPeso(m.income)} in, ${formatPeso(m.spent)} spent, ${formatPeso(m.saved)} kept`} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                <View style={{ height: 96, width: '100%', maxWidth: 44, flexDirection: 'row', alignItems: 'flex-end', gap: 3, borderBottomWidth: 1, borderColor: colors.line }}>
                  {bar(m.income, colors.inkBlue)}
                  {bar(m.spent, colors.muted)}
                </View>
                <Text variant="small" weight="semi" muted>{monthName(m.month)}</Text>
                <Text variant="small" weight="bold" numberOfLines={1} style={[NUM, m.saved < 0 && { color: colors.red }]}>{formatPesoShort(m.saved)}</Text>
              </View>
            ))}
          </View>
          <View style={[styles.row, { flexWrap: 'wrap', gap: space[4] }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={[styles.row, { gap: 6 }]}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: colors.inkBlue }} /><Text variant="small" muted>In</Text></View>
            <View style={[styles.row, { gap: 6 }]}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: colors.muted }} /><Text variant="small" muted>Spent</Text></View>
            <Text variant="small" muted>Number below: kept</Text>
          </View>
        </>
      )}
      <Text muted={!now}>{recapLine(months, formatPeso)}</Text>
    </Card>
  );
}

/** Shows whether auto-logging is on, and how to turn it on. */
function CaptureCard() {
  const [enabled, setEnabled] = useState(() => isCaptureEnabled());
  const [count, setCount] = useState(() => captureCount());
  const [status, setStatus] = useState('');
  const [samples, setSamples] = useState<Capture[] | null>(null);

  // Re-check when coming back from Android's settings page.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') { setEnabled(isCaptureEnabled()); setCount(captureCount()); }
    });
    return () => sub.remove();
  }, []);

  if (!captureAvailable) {
    return (
      <Card>
        <Text weight="semi">Auto-logging needs a newer app build</Text>
        <Text variant="label" muted>This build was made before notification capture existed. Rebuild the app to turn it on.</Text>
      </Card>
    );
  }
  if (!enabled) {
    return (
      <Card>
        <Text weight="semi">Log spending automatically</Text>
        <Text variant="label" muted>Dirary can read transaction notifications from GCash, GoTyme and Security Bank and log them for you to review. It ignores every other app, and the notification text never leaves this phone.</Text>
        <Button primary label="Turn on notification access" onPress={openCaptureSettings} />
        <Text variant="label" muted>If Dirary is greyed out in that list: open Dirary's App info, tap ⋮, then “Allow restricted settings”.</Text>
      </Card>
    );
  }
  return (
    <Card>
      <View style={[styles.row, { justifyContent: 'space-between' }]}>
        <Text weight="semi" style={{ flex: 1 }}>Auto-logging is on</Text>
        <Text variant="label" muted style={{ fontVariant: ['tabular-nums'] }}>{count} captured</Text>
      </View>
      <Text variant="label" muted>Set Dirary's battery use to Unrestricted in Settings so Samsung doesn't stop it in the background.</Text>
      <View style={styles.row}>
        <Button label="Check now" onPress={async () => { const added = await logCaptured(); setCount(captureCount()); setStatus(added > 0 ? `Added ${added} to review.` : 'Nothing new.'); }} />
        <Button label="View samples" onPress={() => setSamples(getCaptures(Math.max(0, captureCount() - 500), 500).slice(-50).reverse())} />
      </View>
      {!!status && <Text variant="label" muted accessibilityLiveRegion="polite">{status}</Text>}
      {samples && <SamplesSheet samples={samples} onClose={() => setSamples(null)} onCleared={() => { setSamples([]); setCount(0); }} />}
    </Card>
  );
}

/**
 * The raw notifications capture mode has saved. They exist so each app's exact wording can be learned;
 * they stay on this phone unless you choose to share them.
 */
function SamplesSheet({ samples, onClose, onCleared }: { samples: Capture[]; onClose: () => void; onCleared: () => void }) {
  const asText = samples.map((s) => `[${s.packageName}] ${new Date(s.postedAt).toISOString()}\n${s.title}\n${s.text}`).join('\n\n');
  return (
    <Sheet title="Captured samples" onClose={onClose}>
      <Text variant="label" muted>The newest 50 notifications saved from your finance apps. They are stored only on this phone. Sharing them sends their full text, including amounts and names, wherever you choose.</Text>
      {samples.length === 0 && <Text muted>Nothing captured yet. Make a small payment and check back.</Text>}
      {samples.length > 0 && (
        <View style={styles.row}>
          <Button primary label="Share samples" onPress={() => { Share.share({ message: asText }).catch(() => {}); }} />
          <Button label="Delete all" onPress={() => { clearCaptures(); onCleared(); }} />
        </View>
      )}
      {samples.map((s) => (
        <View key={s.id} style={{ padding: space[3], borderRadius: radius.md, backgroundColor: colors.raised, gap: 2 }}>
          <Text variant="small" muted>{s.packageName} · {new Date(s.postedAt).toLocaleString()}</Text>
          {!!s.title && <Text variant="label" weight="semi">{s.title}</Text>}
          <Text variant="label">{s.text}</Text>
        </View>
      ))}
    </Sheet>
  );
}

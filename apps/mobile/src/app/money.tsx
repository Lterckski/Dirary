import { useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, ScrollView, Share, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Path, Svg } from 'react-native-svg';
import { colors, radius, space } from '@dirary/ui';
import {
  accountBalance, budgetCoach, dayLabel, dueLabel, findTransferPairs, fixedThisMonth, formatPeso, formatPesoShort, monthName, monthlyRecap, recapLine, localDate, monthSummary, needsReview, parseMoneyQuickAdd, recentTransactions, safeToSpend, spendCoach,
  type Institution, type MonthRecap, type Transaction,
} from '@dirary/shared';

import { Mascot } from '@/components/mascot';
import { AccountsEditor, BudgetEditor, CategoriesEditor, FixedEditor, Segmented, TransactionEditor, TransferEditor, TxRow } from '@/components/money-editor';
import { Chip, Group } from '@/components/task-bits';
import { Button, Card, TAB_BAR_CLEARANCE, Text, styles } from '@/components/ui';
import { useAddRequest } from '@/lib/add-bus';
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

type Sheet = { kind: 'tx'; tx: Transaction | null; categoryId?: string; direction?: 'in' | 'out'; accountId?: string } | { kind: 'fixed' } | { kind: 'budget' } | { kind: 'accounts' } | { kind: 'categories' } | { kind: 'transfer' } | null;

export default function MoneyScreen() {
  const { accounts, categories, transactions, fixed, plan, loading } = useMoneyStore();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<Sheet>(null);
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
  const total = accounts.reduce((sum, a) => sum + accountBalance(a, transactions), 0);
  const safePct = safe.dailyLimit === 0 ? (safe.spentToday > 0 ? 100 : 0) : Math.min(100, Math.round((safe.spentToday / safe.dailyLimit) * 100));
  const shortcuts = categories.filter((c) => c.kind === 'expense').slice(0, 4);
  const over = safe.ready && safe.safeToday < 0;
  const recap = useMemo(() => monthlyRecap(transactions, today, toLocal), [transactions, today]);

  // The floating + button opens the add form.
  useAddRequest('money', () => setSheet({ kind: 'tx', tx: null }));
  const inbox = useMemo(() => needsReview(transactions), [transactions]);
  const pairs = useMemo(() => findTransferPairs(inbox), [inbox]);
  const paired = new Set(pairs.flatMap((p) => [p.out.id, p.into.id]));
  const recent = useMemo(() => recentTransactions(transactions, 40), [transactions]);
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
    <TxRow key={t.id} tx={t} account={t.account_id ? accountById.get(t.account_id) : undefined} category={t.category_id ? categoryById.get(t.category_id) : undefined} onOpen={() => setSheet({ kind: 'tx', tx: t })} action={action} />
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
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }} keyboardShouldPersistTaps="handled">
        <View style={{ backgroundColor: colors.inkBlue, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, paddingTop: insets.top + space[4], paddingHorizontal: space[5], paddingBottom: 72 }}>
          <Text variant="small" weight="bold" style={{ color: colors.onInkBlue, letterSpacing: 1.3 }}>{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()}</Text>
          <Text variant="title" accessibilityRole="header" style={{ color: colors.onInkBlue }}>Hello, {GREETING_NAME}!</Text>
          {/* Ink sits behind the first card and peeks over its top edge. */}
          <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', right: space[6], bottom: 22 }}>
            <Mascot mood={coach.mood} size={96} />
          </View>
        </View>

        <View style={{ paddingHorizontal: space[5], gap: space[5], marginTop: -50 }}>
        <Card style={{ borderRadius: 28 }}>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text variant="small" weight="bold" style={LABEL}>SAFE TO SPEND TODAY</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Set monthly budget" onPress={() => setSheet({ kind: 'budget' })} hitSlop={2}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.raised, alignItems: 'center', justifyContent: 'center' }}>
              <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M4 20h4L19 9l-4-4L4 16v4z" fill="none" stroke={colors.text} strokeWidth={2} strokeLinejoin="round" /></Svg>
            </Pressable>
          </View>
          {safe.ready ? (
            <>
              <Text variant="hero" style={[NUM, over && { color: colors.red }]} adjustsFontSizeToFit numberOfLines={1}>{formatPeso(safe.safeToday)}</Text>
              <Text variant="label" muted style={NUM}>of {formatPeso(safe.dailyLimit)} daily limit</Text>
              <View accessibilityRole="progressbar" accessibilityLabel="Today's limit used" accessibilityValue={{ min: 0, max: 100, now: safePct }} style={{ height: 12, borderRadius: radius.pill, backgroundColor: colors.line, overflow: 'hidden' }}>
                <View style={{ width: `${safePct}%`, height: 12, borderRadius: radius.pill, backgroundColor: over ? colors.red : colors.inkBlue }} />
              </View>
              <Text weight="bold" style={NUM}>Today spent: {formatPeso(safe.spentToday)}</Text>
              <Text variant="label" muted style={NUM}>{safe.daysLeft} day{safe.daysLeft === 1 ? '' : 's'} left · {formatPeso(safe.leftThisMonth)} for the month</Text>
            </>
          ) : (
            <>
              <Text variant="hero" style={NUM} adjustsFontSizeToFit numberOfLines={1}>{formatPeso(safe.spentToday)}</Text>
              <Text variant="label" muted>spent today</Text>
              <View style={styles.row}><Button primary label="Set a monthly budget" onPress={() => setSheet({ kind: 'budget' })} /></View>
            </>
          )}
          <View style={styles.row}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.inkBlue, alignItems: 'center', justifyContent: 'center' }}>
              <Mascot mood={coach.mood} size={52} />
            </View>
            <Text style={{ flex: 1 }} accessibilityLiveRegion="polite">{coach.line}</Text>
          </View>
        </Card>

        {/* The wallet: account cards tucked into a stitched pocket. */}
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 14, paddingTop: 8, flexGrow: 1 }}>
            {accounts.map((a, i) => (
              <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={`${a.name}, ${formatPeso(accountBalance(a, transactions))}. Add money to ${a.name}`}
                onPress={() => setSheet({ kind: 'tx', tx: null, direction: 'in', accountId: a.id })}
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, flexGrow: 1, minWidth: 112, marginTop: i % 2 ? 8 : 0, paddingTop: space[3], paddingHorizontal: 14, paddingBottom: 40, borderTopLeftRadius: 16, borderTopRightRadius: 16, backgroundColor: CARD_COLOR[a.institution], gap: 2 })}>
                <Text variant="small" weight="bold" numberOfLines={1} style={{ color: colors.onInkBlue }}>{a.name}</Text>
                <Text variant="label" weight="bold" numberOfLines={1} style={[NUM, { color: colors.onInkBlue }]}>{formatPeso(accountBalance(a, transactions))}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={{ marginTop: -28, padding: space[6], borderRadius: 28, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.raised, overflow: 'hidden', gap: 6 }}>
            <View pointerEvents="none" style={{ position: 'absolute', top: 9, left: 9, right: 9, bottom: 9, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line }} />
            <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ position: 'absolute', right: -14, bottom: -22, opacity: 0.13 }}>
              <Mascot mood="happy" size={132} />
            </View>
            <Text variant="small" weight="bold" style={LABEL}>BALANCE</Text>
            <Text variant="title" style={NUM} adjustsFontSizeToFit numberOfLines={1}>{formatPeso(total)}</Text>
            <View style={[styles.row, { flexWrap: 'wrap', gap: space[2], marginTop: space[2] }]}>
              <Pressable accessibilityRole="button" onPress={() => setSheet({ kind: 'tx', tx: null, direction: 'in' })}
                style={{ minHeight: 44, paddingHorizontal: space[4], borderRadius: 22, backgroundColor: colors.inkBlue, justifyContent: 'center' }}>
                <Text variant="label" weight="bold" style={{ color: colors.onInkBlue }}>+ Add money</Text>
              </Pressable>
              {accounts.length > 1 && <Chip label="Transfer" onPress={() => setSheet({ kind: 'transfer' })} />}
              <Chip label="Accounts" onPress={() => setSheet({ kind: 'accounts' })} />
            </View>
          </View>
        </View>

        {shortcuts.length > 0 && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {shortcuts.map((c) => (
              <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`Add ${c.name} spending`} onPress={() => setSheet({ kind: 'tx', tx: null, categoryId: c.id })}
                style={({ pressed }) => ({ flex: 1, minHeight: 88, borderRadius: 22, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: space[2], paddingHorizontal: 6, opacity: pressed ? 0.7 : 1 })}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors[c.color], alignItems: 'center', justifyContent: 'center' }}>
                  <Text variant="heading" style={{ color: colors.onInkBlue, fontSize: 17, lineHeight: 22 }}>{c.name.charAt(0)}</Text>
                </View>
                <Text variant="small" weight="bold" numberOfLines={1} style={{ letterSpacing: 0.5 }}>{c.name.toUpperCase()}</Text>
              </Pressable>
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
              {fixedSummary.items.map((i) => {
                const edge = i.paid || i.dueIn > 3 ? colors.inkBlue : i.dueIn < 0 ? colors.red : colors.amber;
                return (
                  <View key={i.expense.id} style={{ flexDirection: 'row', alignItems: 'center', marginLeft: -space[3] }}>
                    <Pressable
                      accessibilityRole="checkbox" accessibilityState={{ checked: i.paid }}
                      accessibilityLabel={`${i.expense.name}, ${formatPeso(i.expense.amount_centavos)}, mark ${i.paid ? 'not paid' : 'paid'}`}
                      onPress={() => (i.payment ? removeTransaction(i.payment) : payFixed(i.expense, accounts[0]?.id ?? null))}
                      style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                      <View style={{ width: 26, height: 26, borderRadius: radius.sm, borderWidth: 2.5, borderColor: edge, backgroundColor: i.paid ? colors.inkBlue : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                        {i.paid && <Svg width={16} height={16} viewBox="0 0 16 16"><Path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke={colors.onInkBlue} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" /></Svg>}
                      </View>
                    </Pressable>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text weight={i.paid ? 'medium' : 'semi'} style={i.paid ? { color: colors.faint, textDecorationLine: 'line-through' } : undefined}>{i.expense.name}</Text>
                      {!i.paid && <Text variant="label" style={{ color: i.dueIn < 0 ? colors.red : i.dueIn <= 3 ? colors.amber : colors.muted }}>{dueLabel(i)}</Text>}
                    </View>
                    <Text weight="bold" style={[NUM, i.paid && { color: colors.faint }]}>{formatPeso(i.expense.amount_centavos)}</Text>
                  </View>
                );
              })}
            </>
          )}
        </Card>

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
                <Pressable accessibilityRole="button" onPress={() => linkTransfer(p.out, p.into)} style={{ minHeight: 44, paddingHorizontal: space[4], borderRadius: 22, backgroundColor: colors.inkBlue, justifyContent: 'center' }}>
                  <Text variant="label" weight="bold" style={{ color: colors.onInkBlue }}>Link</Text>
                </Pressable>
              </View>
            ))}
            {inbox.filter((t) => !paired.has(t.id)).map((t) => row(t, { label: 'Confirm', onPress: () => (t.account_id ? updateTransaction(t, { status: 'confirmed' }) : setSheet({ kind: 'tx', tx: t })) }))}
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
                    <View accessibilityRole="progressbar" accessibilityLabel={`${r.category.name} budget used`} accessibilityValue={{ min: 0, max: 100, now: pct }} style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.line, overflow: 'hidden' }}>
                      <View style={{ width: `${pct}%`, height: 8, borderRadius: radius.pill, backgroundColor: over ? colors.red : colors.inkBlue }} />
                    </View>
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

        {days.length === 0 ? (
          <Card style={{ alignItems: 'center', paddingVertical: space[8] }}>
            <Mascot mood="sleepy" size={128} />
            <Text muted style={{ textAlign: 'center' }}>No transactions yet. Add one above.</Text>
          </Card>
        ) : days.map((d) => <Group key={d.date} title={dayLabel(d.date, today)}>{d.rows.map((t) => row(t))}</Group>)}
        </View>
      </ScrollView>

      {sheet?.kind === 'fixed' && <FixedEditor fixed={fixed} accounts={accounts} categories={categories} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'budget' && <BudgetEditor plan={plan} fixedTotal={fixedSummary.total} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'tx' && <TransactionEditor tx={sheet.tx} categoryId={sheet.categoryId} direction={sheet.direction} accountId={sheet.accountId} onTransfer={accounts.length > 1 ? () => setSheet({ kind: 'transfer' }) : undefined} accounts={accounts} categories={categories} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'transfer' && <TransferEditor accounts={accounts} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'accounts' && <AccountsEditor accounts={accounts} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'categories' && <CategoriesEditor categories={categories} onClose={() => setSheet(null)} />}
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

import { useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, ScrollView, Share, TextInput, View } from 'react-native';
import { colors, radius, space } from '@dirary/ui';
import {
  accountBalance, budgetCoach, dayLabel, findTransferPairs, formatPeso, localDate, monthSummary, needsReview, parseMoneyQuickAdd, recentTransactions, spentOn,
  type Transaction,
} from '@dirary/shared';

import { Mascot } from '@/components/mascot';
import { AccountsEditor, CategoriesEditor, TransactionEditor, TransferEditor, TxRow } from '@/components/money-editor';
import { Chip, Group } from '@/components/task-bits';
import { Button, Card, Text, styles } from '@/components/ui';
import { addStarterSet, addTransaction, linkTransfer, logCaptured, updateTransaction, useMoneyStore } from '@/lib/money-store';
import { Sheet } from '@/components/task-editor';
import { captureAvailable, captureCount, clearCaptures, getCaptures, isCaptureEnabled, openCaptureSettings, type Capture } from '../../modules/dirary-capture';

const toLocal = (iso: string) => localDate(new Date(iso));
type Sheet = { kind: 'tx'; tx: Transaction | null } | { kind: 'accounts' } | { kind: 'categories' } | { kind: 'transfer' } | null;

export default function MoneyScreen() {
  const { accounts, categories, transactions, loading } = useMoneyStore();
  const [sheet, setSheet] = useState<Sheet>(null);
  const [text, setText] = useState('');
  const today = localDate();
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const summary = useMemo(() => monthSummary(transactions, categories, today.slice(0, 7), toLocal), [transactions, categories, today]);
  const coach = budgetCoach(summary, now.getDate(), daysInMonth);
  const inbox = useMemo(() => needsReview(transactions), [transactions]);
  const pairs = useMemo(() => findTransferPairs(inbox), [inbox]);
  const paired = new Set(pairs.flatMap((p) => [p.out.id, p.into.id]));
  const recent = useMemo(() => recentTransactions(transactions, 40), [transactions]);
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const budgetPct = summary.budgeted === 0 ? 0 : Math.min(100, Math.round((summary.budgetSpent / summary.budgeted) * 100));

  const read = parseMoneyQuickAdd(text, categories, accounts);
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

  if (loading) return <View style={[styles.screen, { padding: space[5] }]}><Text muted>Loading your money…</Text></View>;

  if (accounts.length === 0 && categories.length === 0) {
    return (
      <View style={[styles.screen, { padding: space[5], justifyContent: 'center' }]}>
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
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card>
          <Text variant="hero" style={{ fontVariant: ['tabular-nums'] }}>{formatPeso(summary.spent)}<Text variant="heading" muted> spent</Text></Text>
          <Text variant="label" muted style={{ fontVariant: ['tabular-nums'] }}>{formatPeso(summary.income, { sign: true })} in · {formatPeso(spentOn(transactions, today, toLocal))} today</Text>
          {summary.budgeted > 0 && (
            <>
              <View accessibilityRole="progressbar" accessibilityLabel="Budget used this month" accessibilityValue={{ min: 0, max: 100, now: budgetPct }} style={{ height: 12, borderRadius: radius.pill, backgroundColor: colors.line, overflow: 'hidden' }}>
                <View style={{ width: `${budgetPct}%`, height: 12, borderRadius: radius.pill, backgroundColor: budgetPct >= 100 ? colors.red : colors.inkBlue }} />
              </View>
              <Text variant="label" muted>{formatPeso(summary.budgetSpent)} of {formatPeso(summary.budgeted)} budgeted</Text>
            </>
          )}
          <View style={styles.row}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: colors.inkBlue, alignItems: 'center', justifyContent: 'center' }}>
              <Mascot mood={coach.mood} size={52} />
            </View>
            <Text style={{ flex: 1 }} accessibilityLiveRegion="polite">{coach.line}</Text>
          </View>
        </Card>

        <View style={{ gap: space[2] }}>
          <View style={styles.row}>
            <TextInput accessibilityLabel="New transaction" style={[styles.input, { flex: 1 }]} value={text} maxLength={160} placeholder="250 jollibee #food @gcash" placeholderTextColor={colors.faint} onChangeText={setText} onSubmitEditing={add} returnKeyType="done" />
            <Button primary label="Add" disabled={!read.amount_centavos || !account} onPress={add} />
          </View>
          <Text variant="label" style={{ color: colors.faint, paddingLeft: 4 }}>
            {read.amount_centavos && account
              ? <>Adds <Text variant="label" weight="semi" style={{ color: colors.inkBlue }}>{formatPeso(read.direction === 'in' ? read.amount_centavos : -read.amount_centavos, { sign: true })}</Text>{read.merchant ? ` · ${read.merchant}` : ''} · {categoryById.get(read.category_id ?? '')?.name ?? 'no category'} · {account.name}</>
              : 'Amount, what it was, #category and @account. Start with + for money in.'}
          </Text>
          <View style={[styles.row, { flexWrap: 'wrap' }]}>
            <Chip dashed label="More options" onPress={() => setSheet({ kind: 'tx', tx: null })} />
            {accounts.length > 1 && <Chip dashed label="Transfer" onPress={() => setSheet({ kind: 'transfer' })} />}
          </View>
        </View>

        <Group title="Accounts">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {accounts.map((a) => (
              <View key={a.id} style={{ flexGrow: 1, flexBasis: '45%', padding: space[4], borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, gap: 4 }}>
                <Text variant="label" muted>{a.name}</Text>
                <Text variant="heading" style={{ fontVariant: ['tabular-nums'] }}>{formatPeso(accountBalance(a, transactions))}</Text>
              </View>
            ))}
          </View>
          <View style={styles.row}><Chip dashed label="Edit accounts" onPress={() => setSheet({ kind: 'accounts' })} /></View>
        </Group>

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

        {days.length === 0 ? (
          <Card style={{ alignItems: 'center', paddingVertical: space[8] }}>
            <Mascot mood="sleepy" size={128} />
            <Text muted style={{ textAlign: 'center' }}>No transactions yet. Add one above.</Text>
          </Card>
        ) : days.map((d) => <Group key={d.date} title={dayLabel(d.date, today)}>{d.rows.map((t) => row(t))}</Group>)}
      </ScrollView>

      {sheet?.kind === 'tx' && <TransactionEditor tx={sheet.tx} accounts={accounts} categories={categories} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'transfer' && <TransferEditor accounts={accounts} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'accounts' && <AccountsEditor accounts={accounts} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'categories' && <CategoriesEditor categories={categories} onClose={() => setSheet(null)} />}
    </View>
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

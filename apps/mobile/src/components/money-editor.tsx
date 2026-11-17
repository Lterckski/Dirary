import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { colors, space } from '@dirary/ui';
import {
  INSTITUTIONS, INSTITUTION_LABEL, LIST_COLORS, TransactionDraft, formatPeso, parseAmount,
  type Account, type Category, type FixedExpense, type Institution, type ListColor, type MoneyPlan, type Transaction,
} from '@dirary/shared';

import { Chip } from '@/components/task-bits';
import { Field, Sheet, Wrap } from '@/components/task-editor';
import { Button, Text, styles } from '@/components/ui';
import { addTransaction, addTransfer, removeAccount, removeCategory, removeFixed, removeTransaction, saveAccount, saveCategory, saveFixed, setMonthlyBudget, updateTransaction } from '@/lib/money-store';

const Problem = ({ text }: { text: string | null }) => (text ? <Text variant="label" style={{ color: colors.red }} accessibilityRole="alert">{text}</Text> : null);
const Danger = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[2] }}>
    <Text weight="semi" style={{ color: colors.red }}>{label}</Text>
  </Pressable>
);
const money = { ...styles.input, fontVariant: ['tabular-nums' as const] };

/** A row of equal-width options with one selected, like Spent / Received. */
export function Segmented<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: T | null; onChange: (value: T) => void }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', padding: 3, gap: 2, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => onChange(o.value)}
            style={{ flex: 1, minHeight: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.inkBlue : 'transparent' }}>
            <Text weight={on ? 'bold' : 'semi'} style={{ color: on ? colors.onInkBlue : colors.muted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function TransactionEditor({ tx, categoryId: startCategory, direction: startDirection, accountId: startAccount, accounts, categories, onTransfer, onClose }: {
  tx: Transaction | null; categoryId?: string; direction?: 'in' | 'out'; accountId?: string; accounts: Account[]; categories: Category[]; onTransfer?: () => void; onClose: () => void;
}) {
  const [amount, setAmount] = useState(tx ? String(tx.amount_centavos / 100) : '');
  const [direction, setDirection] = useState<'in' | 'out'>(tx?.direction ?? startDirection ?? 'out');
  const [accountId, setAccountId] = useState<string | null>(tx?.account_id ?? startAccount ?? accounts[0]?.id ?? null);
  const [categoryId, setCategoryId] = useState<string | null>(tx?.category_id ?? startCategory ?? null);
  const [merchant, setMerchant] = useState(tx?.merchant ?? '');
  const [note, setNote] = useState(tx?.note ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const options = categories.filter((c) => c.kind === (direction === 'in' ? 'income' : 'expense'));
  const isTransfer = tx?.transfer_group_id != null;
  const reviewing = tx?.status === 'needs_review';

  async function save() {
    const centavos = parseAmount(amount);
    if (!centavos) return setProblem('Enter an amount, like 250 or 1,240.50.');
    if (!accountId) return setProblem('Pick an account.');
    const draft = TransactionDraft.safeParse({
      account_id: accountId, category_id: options.some((c) => c.id === categoryId) ? categoryId : null, amount_centavos: centavos, direction,
      merchant: merchant.trim() || null, note: note.trim() || null, occurred_at: tx?.occurred_at ?? new Date().toISOString(),
    });
    if (!draft.success) return setProblem('Check the fields and try again.');
    onClose();
    if (tx) await updateTransaction(tx, { ...draft.data, status: 'confirmed' });
    else await addTransaction(draft.data);
  }

  return (
    <Sheet title={tx ? (reviewing ? 'Review' : 'Edit transaction') : direction === 'in' ? 'Add money in' : 'Add expense'} onClose={onClose}>
      {isTransfer && <Text variant="label" muted>One half of a transfer between your accounts. It doesn't count as spending or income.</Text>}
      {reviewing && <Text variant="label" muted>Logged from a notification. Check the amount, account and category, then confirm.</Text>}
      {!isTransfer && (
        <Segmented
          label="What kind of transaction"
          value={direction}
          options={[{ value: 'out', label: 'Spent' }, { value: 'in', label: 'Received' }, ...(!tx && onTransfer ? [{ value: 'transfer' as const, label: 'Transfer' }] : [])]}
          onChange={(v) => (v === 'transfer' ? onTransfer?.() : setDirection(v))}
        />
      )}
      {direction === 'in' && !tx && <Text variant="label" muted>Money that came into one of your accounts, like allowance, pay or a refund. It raises that account's balance.</Text>}
      <Field label="Amount (₱)">
        <TextInput accessibilityLabel="Amount in pesos" style={money} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder={direction === 'in' ? '5000' : '250'} placeholderTextColor={colors.faint} autoFocus={!tx} />
      </Field>
      <Field label={direction === 'in' ? 'Into' : 'Paid from'}>
        <Wrap>{accounts.map((a) => <Chip key={a.id} label={a.name} active={accountId === a.id} onPress={() => setAccountId(a.id)} />)}</Wrap>
      </Field>
      {!isTransfer && (
        <Field label="Category">
          <Wrap>
            <Chip label="None" active={!options.some((c) => c.id === categoryId)} onPress={() => setCategoryId(null)} />
            {options.map((c) => <Chip key={c.id} label={c.name} dot={c.color} active={categoryId === c.id} onPress={() => setCategoryId(c.id)} />)}
          </Wrap>
        </Field>
      )}
      <Field label={direction === 'in' ? 'From' : 'Paid to'}>
        <TextInput accessibilityLabel={direction === 'in' ? 'From' : 'Paid to'} style={styles.input} value={merchant} maxLength={120} onChangeText={setMerchant} />
      </Field>
      <Field label="Note">
        <TextInput accessibilityLabel="Note" style={styles.input} value={note} maxLength={500} onChangeText={setNote} />
      </Field>
      <Problem text={problem} />
      <Button primary label={reviewing ? 'Confirm' : tx ? 'Save' : direction === 'in' ? 'Add money in' : 'Add expense'} onPress={save} />
      {tx && <Danger label="Delete transaction" onPress={() => { onClose(); removeTransaction(tx); }} />}
    </Sheet>
  );
}

export function TransferEditor({ accounts, onClose }: { accounts: Account[]; onClose: () => void }) {
  const [from, setFrom] = useState(accounts[0]?.id ?? '');
  const [to, setTo] = useState(accounts[1]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  async function save() {
    const centavos = parseAmount(amount);
    if (!centavos) return setProblem('Enter an amount.');
    if (from === to) return setProblem('Pick two different accounts.');
    onClose();
    await addTransfer(from, to, centavos);
  }
  return (
    <Sheet title="Transfer" onClose={onClose}>
      <Text variant="label" muted>Moves like a GoTyme to GCash cash-in. Both balances change; it isn't counted as spending.</Text>
      <Field label="From"><Wrap>{accounts.map((a) => <Chip key={a.id} label={a.name} active={from === a.id} onPress={() => setFrom(a.id)} />)}</Wrap></Field>
      <Field label="To"><Wrap>{accounts.map((a) => <Chip key={a.id} label={a.name} active={to === a.id} onPress={() => setTo(a.id)} />)}</Wrap></Field>
      <Field label="Amount (₱)">
        <TextInput accessibilityLabel="Amount in pesos" style={money} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} autoFocus />
      </Field>
      <Problem text={problem} />
      <Button primary label="Transfer" onPress={save} />
    </Sheet>
  );
}

export function AccountsEditor({ accounts, onClose }: { accounts: Account[]; onClose: () => void }) {
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState<Institution>('other');
  const [opening, setOpening] = useState('');
  function add() {
    if (!name.trim()) return;
    saveAccount({ name: name.trim(), institution, opening_balance_centavos: parseAmount(opening) ?? 0, sort_order: accounts.length });
    setName(''); setOpening('');
  }
  return (
    <Sheet title="Accounts" onClose={onClose}>
      <Text variant="label" muted>Set each opening balance to what the account holds today. Balances then follow your confirmed transactions.</Text>
      {accounts.map((a) => (
        <View key={a.id} style={{ gap: space[2] }}>
          <View style={styles.row}>
            <TextInput accessibilityLabel={`Name of ${a.name}`} style={[styles.input, { flex: 1 }]} defaultValue={a.name} maxLength={40}
              onEndEditing={(e) => { const next = e.nativeEvent.text.trim(); if (next && next !== a.name) saveAccount({ ...a, name: next }); }} />
            <Danger label="Delete" onPress={() => removeAccount(a)} />
          </View>
          <View style={styles.row}>
            <Text variant="label" muted style={{ flex: 1 }}>Opening balance (₱)</Text>
            <TextInput accessibilityLabel={`Opening balance of ${a.name} in pesos`} style={[money, { width: 140, textAlign: 'right' }]} keyboardType="decimal-pad" defaultValue={String(a.opening_balance_centavos / 100)}
              onEndEditing={(e) => { const raw = e.nativeEvent.text.trim(); const next = raw === '' || Number(raw) === 0 ? 0 : parseAmount(raw); if (next !== null && next !== a.opening_balance_centavos) saveAccount({ ...a, opening_balance_centavos: next }); }} />
          </View>
        </View>
      ))}
      <Field label="New account">
        <TextInput accessibilityLabel="New account name" style={styles.input} value={name} maxLength={40} placeholder="Savings" placeholderTextColor={colors.faint} onChangeText={setName} />
      </Field>
      <Field label="Bank or wallet">
        <Wrap>{INSTITUTIONS.map((i) => <Chip key={i} label={INSTITUTION_LABEL[i]} active={institution === i} onPress={() => setInstitution(i)} />)}</Wrap>
      </Field>
      <Field label="Opening balance (₱)">
        <TextInput accessibilityLabel="Opening balance in pesos" style={money} keyboardType="decimal-pad" value={opening} placeholder="0" placeholderTextColor={colors.faint} onChangeText={setOpening} />
      </Field>
      <Button primary label="Add account" disabled={!name.trim()} onPress={add} />
    </Sheet>
  );
}

const COLOR_NAMES: Record<ListColor, string> = { inkBlue: 'Ink blue', tongue: 'Pink', amber: 'Amber', red: 'Red', muted: 'Grey' };

export function CategoriesEditor({ categories, onClose }: { categories: Category[]; onClose: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [color, setColor] = useState<ListColor>('inkBlue');
  const [limit, setLimit] = useState('');
  function add() {
    if (!name.trim()) return;
    saveCategory({ name: name.trim(), kind, color, monthly_limit_centavos: kind === 'expense' ? parseAmount(limit) : null, sort_order: categories.length });
    setName(''); setLimit('');
  }
  return (
    <Sheet title="Categories and budgets" onClose={onClose}>
      <Text variant="label" muted>A monthly budget is optional. Leave it empty for categories you only want to track.</Text>
      {categories.map((c) => (
        <View key={c.id} style={{ gap: space[2] }}>
          <View style={styles.row}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors[c.color] }} />
            <TextInput accessibilityLabel={`Name of ${c.name}`} style={[styles.input, { flex: 1 }]} defaultValue={c.name} maxLength={40}
              onEndEditing={(e) => { const next = e.nativeEvent.text.trim(); if (next && next !== c.name) saveCategory({ ...c, name: next }); }} />
            <Danger label="Delete" onPress={() => removeCategory(c)} />
          </View>
          {c.kind === 'expense' ? (
            <View style={styles.row}>
              <Text variant="label" muted style={{ flex: 1 }}>Monthly budget (₱)</Text>
              <TextInput accessibilityLabel={`Monthly budget for ${c.name} in pesos`} style={[money, { width: 140, textAlign: 'right' }]} keyboardType="decimal-pad" placeholder="None" placeholderTextColor={colors.faint}
                defaultValue={c.monthly_limit_centavos ? String(c.monthly_limit_centavos / 100) : ''}
                onEndEditing={(e) => { const raw = e.nativeEvent.text.trim(); const next = raw === '' ? null : parseAmount(raw); if ((raw === '' || next !== null) && next !== c.monthly_limit_centavos) saveCategory({ ...c, monthly_limit_centavos: next }); }} />
            </View>
          ) : <Text variant="label" muted>Income category</Text>}
        </View>
      ))}
      <Field label="New category">
        <TextInput accessibilityLabel="New category name" style={styles.input} value={name} maxLength={40} placeholder="Pets" placeholderTextColor={colors.faint} onChangeText={setName} />
      </Field>
      <Field label="Kind">
        <Wrap>
          <Chip label="Spending" active={kind === 'expense'} onPress={() => setKind('expense')} />
          <Chip label="Income" active={kind === 'income'} onPress={() => setKind('income')} />
        </Wrap>
      </Field>
      {kind === 'expense' && (
        <Field label="Monthly budget (₱)">
          <TextInput accessibilityLabel="Monthly budget in pesos" style={money} keyboardType="decimal-pad" value={limit} placeholder="Optional" placeholderTextColor={colors.faint} onChangeText={setLimit} />
        </Field>
      )}
      <Field label="Colour">
        <Wrap>{LIST_COLORS.map((c) => <Chip key={c} label={COLOR_NAMES[c]} dot={c} active={color === c} onPress={() => setColor(c)} />)}</Wrap>
      </Field>
      <Button primary label="Add category" disabled={!name.trim()} onPress={add} />
    </Sheet>
  );
}

export function BudgetEditor({ plan, fixedTotal, onClose }: { plan: MoneyPlan | null; fixedTotal: number; onClose: () => void }) {
  const [amount, setAmount] = useState(plan?.monthly_budget_centavos ? String(plan.monthly_budget_centavos / 100) : '');
  const [problem, setProblem] = useState<string | null>(null);
  const centavos = parseAmount(amount);
  async function save() {
    if (amount.trim() === '') { onClose(); return setMonthlyBudget(null); }
    if (!centavos) return setProblem('Enter an amount, like 15000.');
    onClose();
    await setMonthlyBudget(centavos);
  }
  return (
    <Sheet title="Monthly budget" onClose={onClose}>
      <Text variant="label" muted>How much you allow yourself to spend in a month, fixed expenses included. Dirary sets your fixed expenses aside, subtracts what you've spent, and spreads the rest over the days left. That's your daily limit.</Text>
      <Field label="Monthly budget (₱)">
        <TextInput accessibilityLabel="Monthly budget in pesos" style={money} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="15000" placeholderTextColor={colors.faint} autoFocus />
      </Field>
      {centavos !== null && fixedTotal > 0 && <Text variant="label" muted>{formatPeso(fixedTotal)} of it is fixed expenses, leaving {formatPeso(centavos - fixedTotal)} for everyday spending.</Text>}
      <Problem text={problem} />
      <Button primary label="Save" onPress={save} />
    </Sheet>
  );
}

export function FixedEditor({ fixed, accounts, categories, onClose }: { fixed: FixedExpense[]; accounts: Account[]; categories: Category[]; onClose: () => void }) {
  const [editing, setEditing] = useState<FixedExpense | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState('1');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const options = categories.filter((c) => c.kind === 'expense');

  function start(expense: FixedExpense | null) {
    setEditing(expense);
    setName(expense?.name ?? '');
    setAmount(expense ? String(expense.amount_centavos / 100) : '');
    setDueDay(String(expense?.due_day ?? 1));
    setCategoryId(expense?.category_id ?? null);
    setAccountId(expense?.account_id ?? null);
    setProblem(null);
  }
  async function save() {
    const centavos = parseAmount(amount);
    const day = Number(dueDay);
    if (!name.trim()) return setProblem('Give it a name, like Rent.');
    if (!centavos) return setProblem('Enter an amount, like 3500.');
    if (!Number.isInteger(day) || day < 1 || day > 31) return setProblem('The due day is a day of the month, 1 to 31.');
    const fields = { name: name.trim().slice(0, 60), amount_centavos: centavos, due_day: day, category_id: categoryId, account_id: accountId };
    const target = editing;
    start(null);
    await saveFixed(target ? { ...target, ...fields } : { ...fields, sort_order: fixed.length });
  }

  return (
    <Sheet title="Fixed expenses" onClose={onClose}>
      <Text variant="label" muted>What you pay every month. Tick one off on the Money screen when it's paid; that logs the payment. Tap one here to change it.</Text>
      {fixed.map((e) => (
        <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingLeft: space[4], borderRadius: 20, borderWidth: 1, borderColor: editing?.id === e.id ? colors.inkBlue : colors.line, backgroundColor: colors.surface }}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${e.name}`} onPress={() => start(e)} style={{ flex: 1, minHeight: 56, justifyContent: 'center', gap: 2 }}>
            <Text weight="semi">{e.name}</Text>
            <Text variant="label" muted style={{ fontVariant: ['tabular-nums'] }}>{formatPeso(e.amount_centavos)} · day {e.due_day}</Text>
          </Pressable>
          <Danger label="Delete" onPress={() => { if (editing?.id === e.id) start(null); removeFixed(e); }} />
        </View>
      ))}
      <Text variant="heading">{editing ? `Change ${editing.name}` : 'Add one'}</Text>
      <Field label="Name">
        <TextInput accessibilityLabel="Name" style={styles.input} value={name} maxLength={60} onChangeText={setName} placeholder="Rent" placeholderTextColor={colors.faint} />
      </Field>
      <Field label="Amount (₱)">
        <TextInput accessibilityLabel="Amount in pesos" style={money} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} placeholder="3500" placeholderTextColor={colors.faint} />
      </Field>
      <Field label="Due day of the month">
        <TextInput accessibilityLabel="Due day of the month" style={money} keyboardType="number-pad" value={dueDay} maxLength={2} onChangeText={setDueDay} />
      </Field>
      <Field label="Category">
        <Wrap>
          <Chip label="None" active={categoryId === null} onPress={() => setCategoryId(null)} />
          {options.map((c) => <Chip key={c.id} label={c.name} dot={c.color} active={categoryId === c.id} onPress={() => setCategoryId(c.id)} />)}
        </Wrap>
      </Field>
      <Field label="Paid from">
        <Wrap>
          <Chip label="First account" active={accountId === null} onPress={() => setAccountId(null)} />
          {accounts.map((a) => <Chip key={a.id} label={a.name} active={accountId === a.id} onPress={() => setAccountId(a.id)} />)}
        </Wrap>
      </Field>
      <Problem text={problem} />
      <View style={styles.row}>
        <Button primary label={editing ? 'Save' : 'Add'} onPress={save} />
        {editing && <Button label="Cancel" onPress={() => start(null)} />}
      </View>
    </Sheet>
  );
}

/** One line of a transaction list. */
export function TxRow({ tx, account, category, onOpen, action }: { tx: Transaction; account?: Account; category?: Category; onOpen: () => void; action?: { label: string; onPress: () => void } }) {
  const transfer = tx.transfer_group_id !== null;
  const title = transfer ? 'Transfer' : tx.merchant ?? category?.name ?? (tx.direction === 'in' ? 'Money in' : 'Spending');
  const time = new Date(tx.occurred_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const meta = [account?.name, transfer ? null : category?.name, time, tx.source === 'notification' ? 'Auto-logged' : tx.source === 'import' ? 'Imported' : null].filter(Boolean).join(' · ');
  const amount = formatPeso(tx.direction === 'in' ? tx.amount_centavos : -tx.amount_centavos, { sign: true });
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: 6, paddingHorizontal: space[4], borderRadius: 20, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Edit ${title}, ${amount}`} onPress={onOpen} style={{ flex: 1, minHeight: 48, justifyContent: 'center', gap: 2 }}>
        <Text weight="semi">{title}</Text>
        <Text variant="label" muted>{meta}</Text>
      </Pressable>
      <Text weight="bold" style={{ color: tx.direction === 'in' ? colors.inkBlue : colors.text, fontVariant: ['tabular-nums'] }}>{amount}</Text>
      {action && (
        <Pressable accessibilityRole="button" accessibilityLabel={`${action.label} ${title} ${amount}`} onPress={action.onPress}
          style={{ minHeight: 44, paddingHorizontal: space[4], borderRadius: 22, backgroundColor: colors.inkBlue, justifyContent: 'center' }}>
          <Text variant="label" weight="bold" style={{ color: colors.onInkBlue }}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

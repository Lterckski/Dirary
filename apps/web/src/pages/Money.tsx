import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  INSTITUTIONS, INSTITUTION_LABEL, LIST_COLORS, TransactionDraft, accountBalance, budgetCoach, dayLabel, findTransferPairs, formatPeso, guessMapping,
  localDate, monthSummary, needsReview, parseAmount, parseCsv, parseMoneyQuickAdd, recentTransactions, rowsToTransactions, spentOn,
  type Account, type Category, type CsvMapping, type Institution, type ListColor, type Transaction,
} from '@dirary/shared';
import { Mascot } from '../Mascot';
import { useMoney, type MoneyStore } from '../money/useMoney';
import { Modal, openPicker } from '../ui';

const toLocal = (iso: string) => localDate(new Date(iso));
const pad = (n: number) => String(n).padStart(2, '0');
/** A Date as the value a datetime-local input expects. */
const forInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

type Dialog = { kind: 'tx'; tx: Transaction | null } | { kind: 'accounts' } | { kind: 'categories' } | { kind: 'transfer' } | { kind: 'import' } | null;

export function Money() {
  const store = useMoney();
  const { accounts, categories, transactions, loading, error } = store;
  const [dialog, setDialog] = useState<Dialog>(null);
  const today = localDate();
  const month = today.slice(0, 7);
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const summary = useMemo(() => monthSummary(transactions, categories, month, toLocal), [transactions, categories, month]);
  const coach = budgetCoach(summary, now.getDate(), daysInMonth);
  const inbox = useMemo(() => needsReview(transactions), [transactions]);
  const pairs = useMemo(() => findTransferPairs(inbox), [inbox]);
  const paired = new Set(pairs.flatMap((p) => [p.out.id, p.into.id]));
  const recent = useMemo(() => recentTransactions(transactions, 60), [transactions]);
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const budgetPct = summary.budgeted === 0 ? 0 : Math.min(100, Math.round((summary.budgetSpent / summary.budgeted) * 100));

  const days: { date: string; rows: Transaction[] }[] = [];
  for (const t of recent) {
    const date = toLocal(t.occurred_at);
    const last = days[days.length - 1];
    if (last && last.date === date) last.rows.push(t);
    else days.push({ date, rows: [t] });
  }

  const row = (t: Transaction, actions?: ReactNode) => (
    <TxRow key={t.id} tx={t} account={t.account_id ? accountById.get(t.account_id) : undefined} category={t.category_id ? categoryById.get(t.category_id) : undefined} onOpen={() => setDialog({ kind: 'tx', tx: t })} actions={actions} />
  );

  const firstUse = !loading && accounts.length === 0 && categories.length === 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
          <h1 className="display">Money</h1>
        </div>
      </div>

      {error && <p className="note error" role="alert">{error}</p>}
      {loading && <p className="muted" role="status">Loading your money…</p>}

      {firstUse && (
        <section className="card empty">
          <Mascot mood="coach" size={128} />
          <p>Start with your accounts and a few categories. You can rename or remove any of them later.</p>
          <button type="button" className="btn primary" onClick={store.addStarterSet}>Add Security Bank, GoTyme, GCash and Cash</button>
        </section>
      )}

      {!loading && !firstUse && (
        <>
          <section className="card progress" aria-label="This month">
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <p className="display progress-count">{formatPeso(summary.spent)}<span> spent</span></p>
              <p className="muted money-in">{formatPeso(summary.income, { sign: true })} in · {formatPeso(spentOn(transactions, today, toLocal))} today</p>
            </div>
            {summary.budgeted > 0 && (
              <>
                <div className={budgetPct >= 100 ? 'bar over' : 'bar'} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={budgetPct} aria-label="Budget used this month">
                  <div style={{ width: `${budgetPct}%` }} />
                </div>
                <p className="note muted">{formatPeso(summary.budgetSpent)} of {formatPeso(summary.budgeted)} budgeted</p>
              </>
            )}
            <div className="coach">
              <span className="coach-badge"><Mascot mood={coach.mood} size={52} /></span>
              <p aria-live="polite">{coach.line}</p>
            </div>
          </section>

          <QuickAdd store={store} onMore={() => setDialog({ kind: 'tx', tx: null })} />

          <section className="group" aria-labelledby="accounts-title">
            <div className="group-bar" style={{ marginBottom: 0 }}>
              <h2 id="accounts-title" className="group-title">Accounts</h2>
              <div className="row" style={{ gap: 8 }}>
                <button type="button" className="chip ghost" onClick={() => setDialog({ kind: 'transfer' })} disabled={accounts.length < 2}>Transfer</button>
                <button type="button" className="chip ghost" onClick={() => setDialog({ kind: 'import' })} disabled={accounts.length === 0}>Import statement</button>
                <button type="button" className="chip ghost" onClick={() => setDialog({ kind: 'accounts' })}>Edit accounts</button>
              </div>
            </div>
            <div className="accounts">
              {accounts.map((a) => (
                <div key={a.id} className="account">
                  <span className="task-meta">{a.name}</span>
                  <span className="display account-balance">{formatPeso(accountBalance(a, transactions))}</span>
                </div>
              ))}
            </div>
          </section>

          {inbox.length > 0 && (
            <section className="group" aria-labelledby="inbox-title">
              <h2 id="inbox-title" className="group-title amber">To review · {inbox.length}</h2>
              <p className="note muted">Logged automatically from your notifications. Check each one; it only counts once you confirm it.</p>
              <ul className="tasks">
                {pairs.map((p) => (
                  <li key={p.out.id} className="task suggestion">
                    <span className="grow task-main" style={{ cursor: 'default' }}>
                      <span className="task-title">Looks like a transfer: {formatPeso(p.out.amount_centavos)}</span>
                      <span className="task-meta">{accountById.get(p.out.account_id ?? '')?.name} → {accountById.get(p.into.account_id ?? '')?.name}</span>
                    </span>
                    <button type="button" className="btn primary small" onClick={() => store.linkTransfer(p.out.id, p.into.id)}>Link as transfer</button>
                  </li>
                ))}
                {inbox.filter((t) => !paired.has(t.id)).map((t) => row(t, (
                  <button type="button" className="btn primary small" onClick={() => store.updateTransaction(t.id, { status: 'confirmed' })} aria-label={`Confirm ${t.merchant ?? 'transaction'} ${formatPeso(t.amount_centavos)}`}>Confirm</button>
                )))}
              </ul>
            </section>
          )}

          <section className="group" aria-labelledby="budgets-title">
            <div className="group-bar" style={{ marginBottom: 0 }}>
              <h2 id="budgets-title" className="group-title">Categories this month</h2>
              <button type="button" className="chip ghost" onClick={() => setDialog({ kind: 'categories' })}>Edit categories and budgets</button>
            </div>
            {summary.categories.length === 0 && summary.uncategorized === 0 ? (
              <p className="note muted">Nothing spent yet this month.</p>
            ) : (
              <ul className="budgets">
                {summary.categories.map((r) => {
                  const pct = r.limit ? Math.min(100, Math.round((r.spent / r.limit) * 100)) : 0;
                  const over = r.left !== null && r.left < 0;
                  return (
                    <li key={r.category.id} className="budget">
                      <div className="row" style={{ justifyContent: 'space-between' }}>
                        <span className="row" style={{ gap: 8 }}><span className="dot" style={{ background: `var(--${r.category.color})` }} aria-hidden="true" /><strong>{r.category.name}</strong></span>
                        <span className={over ? 'amount late' : 'amount'}>
                          {formatPeso(r.spent)}{r.limit !== null && <span className="muted"> of {formatPeso(r.limit)}</span>}
                        </span>
                      </div>
                      {r.limit !== null && (
                        <>
                          <div className={over ? 'bar thin over' : 'bar thin'} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${r.category.name} budget used`}>
                            <div style={{ width: `${pct}%` }} />
                          </div>
                          <span className={over ? 'task-meta late' : 'task-meta'}>{over ? `Over by ${formatPeso(-(r.left as number))}` : `${formatPeso(r.left as number)} left`}</span>
                        </>
                      )}
                    </li>
                  );
                })}
                {summary.uncategorized > 0 && (
                  <li className="budget">
                    <div className="row" style={{ justifyContent: 'space-between' }}><strong className="muted">No category</strong><span className="amount">{formatPeso(summary.uncategorized)}</span></div>
                  </li>
                )}
              </ul>
            )}
          </section>

          <section className="group" aria-label="Recent transactions">
            {days.length === 0 ? (
              <section className="card empty"><Mascot mood="sleepy" size={128} /><p className="muted">No transactions yet. Add one above, like “250 jollibee #food @gcash”.</p></section>
            ) : days.map((d) => (
              <div key={d.date} className="group">
                <h2 className="group-title">{dayLabel(d.date, today)}</h2>
                <ul className="tasks">{d.rows.map((t) => row(t))}</ul>
              </div>
            ))}
          </section>
        </>
      )}

      {dialog?.kind === 'tx' && <TxDialog tx={dialog.tx} store={store} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'accounts' && <AccountsDialog store={store} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'categories' && <CategoriesDialog store={store} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'transfer' && <TransferDialog store={store} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'import' && <ImportDialog store={store} onClose={() => setDialog(null)} />}
    </div>
  );
}

function TxRow({ tx, account, category, onOpen, actions }: { tx: Transaction; account?: Account; category?: Category; onOpen: () => void; actions?: ReactNode }) {
  const transfer = tx.transfer_group_id !== null;
  const title = transfer ? 'Transfer' : tx.merchant ?? category?.name ?? (tx.direction === 'in' ? 'Money in' : 'Spending');
  const meta = [account?.name, transfer ? null : category?.name, timeOf(tx.occurred_at), tx.source === 'notification' ? 'Auto-logged' : tx.source === 'import' ? 'Imported' : null].filter(Boolean).join(' · ');
  return (
    <li className="task tx">
      <button type="button" className="task-main" onClick={onOpen} aria-label={`Edit ${title}, ${formatPeso(tx.amount_centavos)}`}>
        <span className="task-title">{title}</span>
        <span className="task-meta">{meta}</span>
      </button>
      <span className={tx.direction === 'in' ? 'amount in' : 'amount'}>{formatPeso(tx.direction === 'in' ? tx.amount_centavos : -tx.amount_centavos, { sign: true })}</span>
      {actions}
    </li>
  );
}

function QuickAdd({ store, onMore }: { store: MoneyStore; onMore: () => void }) {
  const [text, setText] = useState('');
  const read = parseMoneyQuickAdd(text, store.categories, store.accounts);
  const account = store.accounts.find((a) => a.id === read.account_id) ?? store.accounts[0];
  const category = store.categories.find((c) => c.id === read.category_id);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!read.amount_centavos || !account) return;
    store.addTransaction({ account_id: account.id, category_id: read.category_id, amount_centavos: read.amount_centavos, direction: read.direction, merchant: read.merchant, note: null, occurred_at: new Date().toISOString() });
    setText('');
  }
  return (
    <form className="quick" onSubmit={submit}>
      <label className="sr-only" htmlFor="money-quick">New transaction</label>
      <input id="money-quick" className="input grow" value={text} maxLength={160} autoComplete="off" placeholder="250 jollibee #food @gcash" onChange={(e) => setText(e.target.value)} aria-describedby="money-hint" />
      <button type="button" className="btn" onClick={onMore}>More options</button>
      <button type="submit" className="btn primary" disabled={!read.amount_centavos || !account}>Add</button>
      <p id="money-hint" className="quick-hint" aria-live="polite">
        {read.amount_centavos && account
          ? <>Adds <strong>{formatPeso(read.direction === 'in' ? read.amount_centavos : -read.amount_centavos, { sign: true })}</strong>{read.merchant ? ` · ${read.merchant}` : ''} · <strong>{category?.name ?? 'no category'}</strong> · {account.name}</>
          : 'Type an amount, what it was, then #category and @account. Start with + for money in.'}
      </p>
    </form>
  );
}

function TxDialog({ tx, store, onClose }: { tx: Transaction | null; store: MoneyStore; onClose: () => void }) {
  const [amount, setAmount] = useState(tx ? String(tx.amount_centavos / 100) : '');
  const [direction, setDirection] = useState<'in' | 'out'>(tx?.direction ?? 'out');
  const [accountId, setAccountId] = useState(tx?.account_id ?? store.accounts[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState(tx?.category_id ?? '');
  const [merchant, setMerchant] = useState(tx?.merchant ?? '');
  const [note, setNote] = useState(tx?.note ?? '');
  const [when, setWhen] = useState(forInput(tx ? new Date(tx.occurred_at) : new Date()));
  const [problem, setProblem] = useState<string | null>(null);
  const options = store.categories.filter((c) => c.kind === (direction === 'in' ? 'income' : 'expense'));
  const isTransfer = tx?.transfer_group_id != null;

  function submit(event: FormEvent) {
    event.preventDefault();
    const centavos = parseAmount(amount);
    if (!centavos) return setProblem('Enter an amount, like 250 or 1,240.50.');
    if (!accountId) return setProblem('Pick an account.');
    const draft = TransactionDraft.safeParse({
      account_id: accountId, category_id: options.some((c) => c.id === categoryId) ? categoryId : null, amount_centavos: centavos, direction,
      merchant: merchant.trim() || null, note: note.trim() || null, occurred_at: new Date(when).toISOString(),
    });
    if (!draft.success) return setProblem('Check the fields and try again.');
    if (tx) store.updateTransaction(tx.id, { ...draft.data, status: 'confirmed' });
    else store.addTransaction(draft.data);
    onClose();
  }

  return (
    <Modal title={tx ? (tx.status === 'needs_review' ? 'Review transaction' : 'Edit transaction') : 'Add transaction'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {isTransfer && <p className="note muted">This is one half of a transfer between your accounts. It doesn't count as spending or income.</p>}
        <div className="two">
          <label className="field">Amount (₱)
            <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus placeholder="250" />
          </label>
          <fieldset className="field toggle">
            <legend>Type</legend>
            <div className="segmented">
              <button type="button" aria-pressed={direction === 'out'} onClick={() => setDirection('out')}>Money out</button>
              <button type="button" aria-pressed={direction === 'in'} onClick={() => setDirection('in')}>Money in</button>
            </div>
          </fieldset>
        </div>
        <div className="two">
          <label className="field">Account
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {!accountId && <option value="">Pick an account</option>}
              {store.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
          <label className="field">Category
            <select className="input" value={options.some((c) => c.id === categoryId) ? categoryId : ''} onChange={(e) => setCategoryId(e.target.value)} disabled={isTransfer}>
              <option value="">No category</option>
              {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>
        <label className="field">{direction === 'in' ? 'From' : 'Paid to'}
          <input className="input" value={merchant} maxLength={120} onChange={(e) => setMerchant(e.target.value)} />
        </label>
        <label className="field">When
          <input className="input" type="datetime-local" value={when} onClick={openPicker} onChange={(e) => setWhen(e.target.value)} required />
        </label>
        <label className="field">Note
          <input className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </label>
        {problem && <p className="note error" role="alert">{problem}</p>}
        <div className="actions">
          {tx && <button type="button" className="btn danger" onClick={() => { store.removeTransaction(tx.id); onClose(); }}>Delete</button>}
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary">{tx?.status === 'needs_review' ? 'Confirm' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  );
}

function AccountsDialog({ store, onClose }: { store: MoneyStore; onClose: () => void }) {
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState<Institution>('other');
  const [opening, setOpening] = useState('');
  function add(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    store.saveAccount({ name: name.trim(), institution, opening_balance_centavos: parseAmount(opening) ?? 0 });
    setName(''); setOpening('');
  }
  return (
    <Modal title="Accounts" onClose={onClose}>
      <p className="note muted">Set each opening balance to what the account holds today. Balances then follow your confirmed transactions.</p>
      <ul className="list-rows">
        {store.accounts.map((a) => (
          <li key={a.id}>
            <input className="input grow" defaultValue={a.name} maxLength={40} aria-label={`Name of ${a.name}`}
              onBlur={(e) => { const next = e.target.value.trim(); if (next && next !== a.name) store.saveAccount({ ...a, name: next }); else e.target.value = a.name; }} />
            <input className="input money-field" inputMode="decimal" defaultValue={a.opening_balance_centavos / 100} aria-label={`Opening balance of ${a.name} in pesos`}
              onBlur={(e) => { const next = e.target.value.trim() === '' || Number(e.target.value) === 0 ? 0 : parseAmount(e.target.value); if (next === null) e.target.value = String(a.opening_balance_centavos / 100); else if (next !== a.opening_balance_centavos) store.saveAccount({ ...a, opening_balance_centavos: next }); }} />
            <button type="button" className="btn danger" onClick={() => store.removeAccount(a.id)} aria-label={`Delete account ${a.name}`}>Delete</button>
          </li>
        ))}
      </ul>
      <form className="form" onSubmit={add}>
        <div className="two">
          <label className="field">New account
            <input className="input" value={name} maxLength={40} placeholder="Savings" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">Bank or wallet
            <select className="input" value={institution} onChange={(e) => setInstitution(e.target.value as Institution)}>
              {INSTITUTIONS.map((i) => <option key={i} value={i}>{INSTITUTION_LABEL[i]}</option>)}
            </select>
          </label>
        </div>
        <label className="field">Opening balance (₱)
          <input className="input" inputMode="decimal" value={opening} placeholder="0" onChange={(e) => setOpening(e.target.value)} />
        </label>
        <div className="actions"><span className="grow" /><button type="button" className="btn" onClick={onClose}>Done</button><button type="submit" className="btn primary" disabled={!name.trim()}>Add account</button></div>
      </form>
    </Modal>
  );
}

const COLOR_NAMES: Record<ListColor, string> = { inkBlue: 'Ink blue', tongue: 'Pink', amber: 'Amber', red: 'Red', muted: 'Grey' };

function CategoriesDialog({ store, onClose }: { store: MoneyStore; onClose: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [color, setColor] = useState<ListColor>('inkBlue');
  const [limit, setLimit] = useState('');
  function add(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    store.saveCategory({ name: name.trim(), kind, color, monthly_limit_centavos: kind === 'expense' ? parseAmount(limit) : null });
    setName(''); setLimit('');
  }
  return (
    <Modal title="Categories and budgets" onClose={onClose}>
      <p className="note muted">A monthly budget is optional. Leave it empty for categories you only want to track.</p>
      <ul className="list-rows">
        {store.categories.map((c) => (
          <li key={c.id}>
            <span className="dot" style={{ background: `var(--${c.color})` }} aria-hidden="true" />
            <input className="input grow" defaultValue={c.name} maxLength={40} aria-label={`Name of ${c.name}`}
              onBlur={(e) => { const next = e.target.value.trim(); if (next && next !== c.name) store.saveCategory({ ...c, name: next }); else e.target.value = c.name; }} />
            {c.kind === 'expense' ? (
              <input className="input money-field" inputMode="decimal" defaultValue={c.monthly_limit_centavos ? c.monthly_limit_centavos / 100 : ''} placeholder="No budget" aria-label={`Monthly budget for ${c.name} in pesos`}
                onBlur={(e) => { const next = e.target.value.trim() === '' ? null : parseAmount(e.target.value); if (e.target.value.trim() !== '' && next === null) e.target.value = c.monthly_limit_centavos ? String(c.monthly_limit_centavos / 100) : ''; else if (next !== c.monthly_limit_centavos) store.saveCategory({ ...c, monthly_limit_centavos: next }); }} />
            ) : <span className="task-meta money-field">Income</span>}
            <button type="button" className="btn danger" onClick={() => store.removeCategory(c.id)} aria-label={`Delete category ${c.name}`}>Delete</button>
          </li>
        ))}
      </ul>
      <form className="form" onSubmit={add}>
        <div className="two">
          <label className="field">New category
            <input className="input" value={name} maxLength={40} placeholder="Pets" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">Kind
            <select className="input" value={kind} onChange={(e) => setKind(e.target.value as 'expense' | 'income')}>
              <option value="expense">Spending</option>
              <option value="income">Income</option>
            </select>
          </label>
        </div>
        <div className="two">
          <label className="field">Monthly budget (₱)
            <input className="input" inputMode="decimal" value={limit} disabled={kind === 'income'} placeholder="Optional" onChange={(e) => setLimit(e.target.value)} />
          </label>
          <label className="field">Colour
            <select className="input" value={color} onChange={(e) => setColor(e.target.value as ListColor)}>
              {LIST_COLORS.map((c) => <option key={c} value={c}>{COLOR_NAMES[c]}</option>)}
            </select>
          </label>
        </div>
        <div className="actions"><span className="grow" /><button type="button" className="btn" onClick={onClose}>Done</button><button type="submit" className="btn primary" disabled={!name.trim()}>Add category</button></div>
      </form>
    </Modal>
  );
}

function TransferDialog({ store, onClose }: { store: MoneyStore; onClose: () => void }) {
  const [from, setFrom] = useState(store.accounts[0]?.id ?? '');
  const [to, setTo] = useState(store.accounts[1]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [when, setWhen] = useState(forInput(new Date()));
  const [problem, setProblem] = useState<string | null>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    const centavos = parseAmount(amount);
    if (!centavos) return setProblem('Enter an amount.');
    if (from === to) return setProblem('Pick two different accounts.');
    store.addTransfer(from, to, centavos, new Date(when).toISOString());
    onClose();
  }
  return (
    <Modal title="Transfer between accounts" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="note muted">Moves like a GoTyme to GCash cash-in. Both balances change; it isn't counted as spending.</p>
        <div className="two">
          <label className="field">From
            <select className="input" value={from} onChange={(e) => setFrom(e.target.value)}>{store.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </label>
          <label className="field">To
            <select className="input" value={to} onChange={(e) => setTo(e.target.value)}>{store.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </label>
        </div>
        <div className="two">
          <label className="field">Amount (₱)
            <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </label>
          <label className="field">When
            <input className="input" type="datetime-local" value={when} onClick={openPicker} onChange={(e) => setWhen(e.target.value)} required />
          </label>
        </div>
        {problem && <p className="note error" role="alert">{problem}</p>}
        <div className="actions"><span className="grow" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="submit" className="btn primary">Transfer</button></div>
      </form>
    </Modal>
  );
}

function ImportDialog({ store, onClose }: { store: MoneyStore; onClose: () => void }) {
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Partial<CsvMapping>>({});
  const [accountId, setAccountId] = useState(store.accounts[0]?.id ?? '');
  const [result, setResult] = useState<string | null>(null);
  const header = rows[0] ?? [];
  const ready = rows.length > 1 && mapping.date !== undefined && mapping.description !== undefined && (mapping.amount !== undefined || mapping.debit !== undefined || mapping.credit !== undefined);
  const preview = ready ? rowsToTransactions(rows.slice(1), mapping as CsvMapping, accountId) : null;

  async function load(file: File | undefined) {
    if (!file) return;
    const parsed = parseCsv(await file.text());
    setRows(parsed);
    setMapping(guessMapping(parsed[0] ?? []));
    setResult(null);
  }
  async function run() {
    if (!preview) return;
    const added = await store.importTransactions(preview.ok);
    setResult(`Added ${added}. Skipped ${preview.ok.length - added} already logged${preview.skipped ? ` and ${preview.skipped} unreadable row${preview.skipped === 1 ? '' : 's'}` : ''}.`);
  }
  const column = (label: string, key: keyof Pick<CsvMapping, 'date' | 'description' | 'amount' | 'debit' | 'credit'>, optional = false) => (
    <label className="field">{label}
      <select className="input" value={mapping[key] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value === '' ? undefined : Number(e.target.value) }))}>
        <option value="">{optional ? 'Not used' : 'Pick a column'}</option>
        {header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
      </select>
    </label>
  );

  return (
    <Modal title="Import a statement" onClose={onClose}>
      <p className="note muted">Use this once a month to catch anything auto-logging missed. Export the statement as a CSV file from your bank or wallet. Rows already imported are skipped. Imported rows aren't matched against auto-logged ones yet, so check for doubles after importing.</p>
      <div className="form">
        <div className="two">
          <label className="field">Account
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>{store.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </label>
          <label className="field">CSV file
            <input className="input file" type="file" accept=".csv,text/csv" onChange={(e) => load(e.target.files?.[0])} />
          </label>
        </div>
        {rows.length > 1 && (
          <>
            <div className="two">{column('Date column', 'date')}{column('Description column', 'description')}</div>
            <div className="two">{column('Amount column (signed)', 'amount', true)}{column('Money-out column', 'debit', true)}</div>
            <div className="two">
              {column('Money-in column', 'credit', true)}
              <label className="field">Dates are written
                <select className="input" value={mapping.dayFirst ? 'd' : 'm'} onChange={(e) => setMapping((m) => ({ ...m, dayFirst: e.target.value === 'd' }))}>
                  <option value="m">Month first (11/17/2026)</option>
                  <option value="d">Day first (17/11/2026)</option>
                </select>
              </label>
            </div>
            {preview && (
              <p className="note" aria-live="polite">
                <strong>{preview.ok.length}</strong> transaction{preview.ok.length === 1 ? '' : 's'} ready{preview.skipped ? `, ${preview.skipped} row${preview.skipped === 1 ? '' : 's'} unreadable` : ''}.
                {preview.ok[0] && <> First: {toLocal(preview.ok[0].occurred_at)} · {preview.ok[0].merchant} · {formatPeso(preview.ok[0].direction === 'in' ? preview.ok[0].amount_centavos : -preview.ok[0].amount_centavos, { sign: true })}</>}
              </p>
            )}
          </>
        )}
        {rows.length === 1 && <p className="note error" role="alert">That file has a header but no rows.</p>}
        {result && <p className="note ok" role="status">{result}</p>}
        <div className="actions"><span className="grow" /><button type="button" className="btn" onClick={onClose}>Close</button><button type="button" className="btn primary" disabled={!preview || preview.ok.length === 0 || !accountId} onClick={run}>Import</button></div>
      </div>
    </Modal>
  );
}

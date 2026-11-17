import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode, type RefObject } from 'react';
import {
  INSTITUTIONS, INSTITUTION_LABEL, LIST_COLORS, TransactionDraft, accountBalance, budgetCoach, dayLabel, endOfDayBalances, moveStash, stashProgress, stashSummary, findTransferPairs, formatPeso, guessMapping,
  dueLabel, fixedThisMonth, formatPesoShort, monthName, monthlyRecap, recapLine, localDate, monthSummary, needsReview, parseAmount, parseCsv, parseMoneyQuickAdd, recentTransactions, rowsToTransactions, safeToSpend, spendCoach,
  type Account, type Category, type CsvMapping, type FixedExpense, type Stash, type Institution, type ListColor, type Transaction,
} from '@dirary/shared';
import { confettiFrom } from '../confetti';
import { Mascot, MascotPaws } from '../Mascot';
import { useMoney, type MoneyStore } from '../money/useMoney';
import { Modal, openPicker } from '../ui';

/** Who the app greets. Dirary is a one-person app. */
const GREETING_NAME = 'Luther';
const toLocal = (iso: string) => localDate(new Date(iso));
const pad = (n: number) => String(n).padStart(2, '0');
/** A Date as the value a datetime-local input expects. */
const forInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

type Direction = 'in' | 'out';
type Dialog = { kind: 'tx'; tx: Transaction | null; categoryId?: string; direction?: Direction; accountId?: string } | { kind: 'fixed' } | { kind: 'budget' } | { kind: 'reset' } | { kind: 'stash'; stash: Stash | null } | { kind: 'stashMove'; stash: Stash; mode: 'in' | 'out' } | { kind: 'accounts' } | { kind: 'categories' } | { kind: 'transfer' } | { kind: 'import' } | null;

export function Money() {
  const store = useMoney();
  const { accounts, categories, transactions, loading, error } = store;
  const [dialog, setDialog] = useState<Dialog>(null);
  const today = localDate();
  const month = today.slice(0, 7);
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const summary = useMemo(() => monthSummary(transactions, categories, month, toLocal), [transactions, categories, month]);
  const fixedSummary = useMemo(() => fixedThisMonth(store.fixed, transactions, today, toLocal), [store.fixed, transactions, today]);
  const safe = useMemo(() => safeToSpend(store.plan, store.fixed, transactions, today, toLocal), [store.plan, store.fixed, transactions, today]);
  // Ink speaks about today's allowance first; a category over budget takes over when there is one.
  const budgetLine = budgetCoach(summary, now.getDate(), daysInMonth);
  const coach = budgetLine.mood === 'worried' && safe.safeToday >= 0 ? budgetLine : spendCoach(safe, fixedSummary, formatPeso);
  const stash = useMemo(() => stashSummary(store.stashes, accounts, transactions), [store.stashes, accounts, transactions]);

  // A floating "−₱130" beside the big numbers whenever they change after the page has loaded.
  const safeChange = useChange(loading ? null : safe.ready ? safe.safeToday : safe.spentToday);
  const walletChange = useChange(loading ? null : stash.stashed > 0 ? stash.spendable : stash.total);

  // New transactions slide in; confirmed "To review" items fold away first.
  const fresh = useFresh(transactions.map((t) => t.id), loading);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  function confirm(t: Transaction) {
    setLeaving((cur) => new Set(cur).add(t.id));
    window.setTimeout(() => {
      fresh.mark(t.id);
      store.updateTransaction(t.id, { status: 'confirmed' });
      setLeaving((cur) => { const next = new Set(cur); next.delete(t.id); return next; });
    }, FOLD_MS);
  }

  // Ticking a fixed expense: it shows as paid for a moment, then the payment is logged and the row glides down.
  const [paying, setPaying] = useState<Set<string>>(new Set());
  const payTimers = useRef(new Map<string, number>());
  function tickFixed(item: (typeof fixedSummary.items)[number]) {
    if (item.payment) return store.removeTransaction(item.payment.id);
    const id = item.expense.id;
    const drop = () => setPaying((cur) => { const next = new Set(cur); next.delete(id); return next; });
    const timer = payTimers.current.get(id);
    if (timer !== undefined) { window.clearTimeout(timer); payTimers.current.delete(id); return drop(); }
    setPaying((cur) => new Set(cur).add(id));
    payTimers.current.set(id, window.setTimeout(() => {
      payTimers.current.delete(id);
      store.payFixed(item.expense, accounts[0]?.id ?? null);
      drop();
    }, CHECKED_MS));
  }
  const fixedList = useRef<HTMLUListElement>(null);
  useFlip(fixedList, [fixedSummary]);

  // Small celebrations: every fixed expense paid for the month, or a stash reaching its goal.
  const fixedCard = useRef<HTMLElement>(null);
  const allPaid = fixedSummary.items.length > 0 && fixedSummary.paid === fixedSummary.total;
  const reached = stash.stashes.filter((s) => stashProgress(s) === 100).map((s) => s.id).join(',');
  const seen = useRef<{ allPaid: boolean; reached: Set<string> } | null>(null);
  useEffect(() => {
    if (loading) return;
    const now = new Set(reached ? reached.split(',') : []);
    const was = seen.current;
    seen.current = { allPaid, reached: now };
    if (!was) return;
    if (allPaid && !was.allPaid) confettiFrom(fixedCard.current, { amount: 0.5 });
    for (const id of now) if (!was.reached.has(id)) confettiFrom(document.querySelector(`[data-stash="${id}"] .stash-bar`), { amount: 0.6 });
  }, [loading, allPaid, reached]);
  const safePct = safe.dailyLimit === 0 ? (safe.spentToday > 0 ? 100 : 0) : Math.min(100, Math.round((safe.spentToday / safe.dailyLimit) * 100));
  const shortcuts = categories.filter((c) => c.kind === 'expense').slice(0, 4);
  const recap = useMemo(() => monthlyRecap(transactions, today, toLocal), [transactions, today]);

  // The floating + button asks the current screen to start adding.
  useEffect(() => {
    const open = () => setDialog({ kind: 'tx', tx: null });
    window.addEventListener('dirary:add', open);
    return () => window.removeEventListener('dirary:add', open);
  }, []);
  const inbox = useMemo(() => needsReview(transactions), [transactions]);
  const pairs = useMemo(() => findTransferPairs(inbox), [inbox]);
  const paired = new Set(pairs.flatMap((p) => [p.out.id, p.into.id]));
  // Tapping an account card shows only that account's transactions, with its balance at the end of each day.
  const [only, setOnly] = useState<string | null>(null);
  const shown = accounts.find((a) => a.id === only) ?? null;
  const recent = useMemo(() => recentTransactions(shown ? transactions.filter((t) => t.account_id === shown.id) : transactions, shown ? 300 : 60), [transactions, shown]);
  const dayBalances = useMemo(() => (shown ? endOfDayBalances(shown, transactions, toLocal) : null), [shown, transactions]);
  const showLedger = () => document.getElementById('ledger')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  const accountById = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const days: { date: string; rows: Transaction[] }[] = [];
  for (const t of recent) {
    const date = toLocal(t.occurred_at);
    const last = days[days.length - 1];
    if (last && last.date === date) last.rows.push(t);
    else days.push({ date, rows: [t] });
  }

  const row = (t: Transaction, actions?: ReactNode) => (
    <TxRow key={t.id} tx={t} account={t.account_id ? accountById.get(t.account_id) : undefined} category={t.category_id ? categoryById.get(t.category_id) : undefined}
      leaving={leaving.has(t.id)} fresh={fresh.has(t.id)} onOpen={() => setDialog({ kind: 'tx', tx: t })} actions={actions} />
  );

  const firstUse = !loading && accounts.length === 0 && categories.length === 0;

  return (
    <div className="page money">
      <header className="hero">
        <div>
          <p className="hero-date">{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1 className="display">Hello, {GREETING_NAME}!</h1>
        </div>
      </header>

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
        // Two columns on wide screens: today's money on the left, the month on the right. One column on phones, in the same order.
        <div className="money-cols">
          <div className="money-col">
          {/* Ink stands behind the first card with his front paws over its edge. */}
          <div className="peek">
          <span className="peek-ink" aria-hidden="true"><Mascot mood={coach.mood} size={96} /></span>
          <section className="card safe" aria-labelledby="safe-title">
            <span className="peek-paws" aria-hidden="true"><MascotPaws size={96} /></span>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 id="safe-title" className="card-label">Safe to spend today</h2>
              <button type="button" className="round-btn" aria-label="Set monthly budget" onClick={() => setDialog({ kind: 'budget' })}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" /></svg>
              </button>
            </div>
            {safe.ready ? (
              <>
                <p className={safe.safeToday < 0 ? 'display safe-amount late' : 'display safe-amount'}><Figure value={safe.safeToday} change={safeChange} /></p>
                <p className="muted">of {formatPeso(safe.dailyLimit)} daily limit</p>
                <div className={safe.safeToday < 0 ? 'bar over' : 'bar'} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={safePct} aria-label="Today's limit used">
                  <div style={{ width: `${safePct}%` }} />
                </div>
                <div className="row safe-foot"><strong>Today spent: {formatPeso(safe.spentToday)}</strong><span className="muted">{safe.daysLeft} day{safe.daysLeft === 1 ? '' : 's'} left · {formatPeso(safe.leftThisMonth)} for the month</span></div>
              </>
            ) : (
              <>
                <p className="display safe-amount"><Figure value={safe.spentToday} change={safeChange} /></p>
                <p className="muted">spent today</p>
                <button type="button" className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => setDialog({ kind: 'budget' })}>Set a monthly budget</button>
              </>
            )}
            <div className="coach">
              <span className="coach-badge"><Mascot mood={coach.mood} size={52} /></span>
              <p aria-live="polite">{coach.line}</p>
            </div>
          </section>
          </div>

          <section className="wallet" aria-labelledby="wallet-title">
            <ul className={shown ? 'wallet-cards filtering' : 'wallet-cards'} aria-label="Accounts. Tap one to see only its transactions">
              {accounts.map((a) => (
                <li key={a.id}>
                  <button type="button" className={`wallet-card ${a.institution}`} aria-pressed={only === a.id} onClick={() => setOnly((cur) => (cur === a.id ? null : a.id))}
                    aria-label={`${a.name}, ${formatPeso(accountBalance(a, transactions))}. Show only ${a.name} transactions`}>
                    <span className="wallet-card-name">{a.name}</span>
                    <span className="wallet-card-balance">{formatPeso(accountBalance(a, transactions))}</span>
                    {(stash.byAccount.get(a.id)?.stashed ?? 0) > 0 && <span className="wallet-card-stash">{formatPeso(stash.byAccount.get(a.id)!.stashed)} stashed</span>}
                  </button>
                </li>
              ))}
            </ul>
            <div className="wallet-front">
              <span className="wallet-ink" aria-hidden="true"><Mascot mood="happy" size={132} /></span>
              <h2 id="wallet-title" className="card-label">{stash.stashed > 0 ? 'Spendable' : 'Balance'}</h2>
              <p className="display wallet-total"><Figure value={stash.stashed > 0 ? stash.spendable : stash.total} change={walletChange} /></p>
              {stash.stashed > 0 && <p className="wallet-sub">{formatPeso(stash.stashed)} in stashes · {formatPeso(stash.total)} in total</p>}
              {shown && (
                <p className="wallet-filter" role="status">
                  Showing <strong>{shown.name}</strong> only.
                  <button type="button" className="link" onClick={showLedger}>See its transactions</button>
                  <button type="button" className="link" onClick={() => setOnly(null)}>Show all</button>
                </p>
              )}
              <div className="row wallet-actions">
                <button type="button" className="chip add-money" onClick={() => setDialog({ kind: 'tx', tx: null, direction: 'in', accountId: shown?.id })} disabled={accounts.length === 0}>{shown ? `+ Add money to ${shown.name}` : '+ Add money'}</button>
                <button type="button" className="chip" onClick={() => setDialog({ kind: 'transfer' })} disabled={accounts.length < 2}>Transfer</button>
                <button type="button" className="chip" onClick={() => setDialog({ kind: 'accounts' })}>Accounts</button>
                <button type="button" className="chip" onClick={() => setDialog({ kind: 'import' })} disabled={accounts.length === 0}>Import statement</button>
              </div>
            </div>
          </section>

          <section className="card stashes" aria-labelledby="stashes-title">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 id="stashes-title" className="card-label">Stashes</h2>
              <span className="row" style={{ gap: 8 }}>
                {stash.stashed > 0 && <span className="muted note amount-note">{formatPeso(stash.stashed)} set aside</span>}
                {store.stashesReady && <button type="button" className="chip ghost" onClick={() => setDialog({ kind: 'stash', stash: null })} disabled={accounts.length === 0}>Add</button>}
              </span>
            </div>
            {!store.stashesReady ? (
              <p className="note muted">Run the stashes SQL file in Supabase (20261120000000_phase2_stashes.sql), then reload.</p>
            ) : stash.stashes.length === 0 ? (
              <p className="muted">Set money aside for an emergency fund, tuition or anything else. It stays in its account but stops counting as spendable.</p>
            ) : (
              <ul className="stash-list">
                {stash.stashes.map((s) => {
                  const pct = stashProgress(s);
                  return (
                    <li key={s.id} className="stash" data-stash={s.id}>
                      <button type="button" className="stash-main" onClick={() => setDialog({ kind: 'stash', stash: s })} aria-label={`Edit ${s.name}`}>
                        <span className="task-title">{s.name}</span>
                        <span className="task-meta">{accountById.get(s.account_id)?.name}{s.goal_centavos ? ` · goal ${formatPeso(s.goal_centavos)}` : ''}</span>
                      </button>
                      <span className="amount">{formatPeso(s.amount_centavos)}</span>
                      {pct !== null && (
                        <div className="bar thin stash-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${s.name}: ${pct}% of goal`}>
                          <div style={{ width: `${pct}%` }} />
                        </div>
                      )}
                      <div className="stash-actions">
                        <button type="button" className="chip" onClick={() => setDialog({ kind: 'stashMove', stash: s, mode: 'in' })}>Put in</button>
                        <button type="button" className="chip" onClick={() => setDialog({ kind: 'stashMove', stash: s, mode: 'out' })} disabled={s.amount_centavos === 0}>Take out</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {stash.overdrawn.length > 0 && (
              <p className="note warn" role="alert">
                More is set aside in {stash.overdrawn.map((a) => a.name).join(' and ')} than {stash.overdrawn.length === 1 ? 'it holds' : 'they hold'}. Take some out of a stash, or check that balance.
              </p>
            )}
          </section>

          {shortcuts.length > 0 && (
            <div className="tiles" role="group" aria-label="Quick add by category">
              {shortcuts.map((c) => (
                <button key={c.id} type="button" className="tile" onClick={() => setDialog({ kind: 'tx', tx: null, categoryId: c.id })}>
                  <span className="tile-dot" style={{ background: `var(--${c.color})` }} aria-hidden="true">{c.name.charAt(0)}</span>
                  <span className="tile-name">{c.name}</span>
                </button>
              ))}
            </div>
          )}

          <QuickAdd store={store} onMore={(direction) => setDialog({ kind: 'tx', tx: null, direction })} />

          </div>
          <div className="money-col">
          <section ref={fixedCard} className="card fixed-card" aria-labelledby="fixed-title">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 id="fixed-title" className="card-label">Fixed this month</h2>
              <span className="row" style={{ gap: 8 }}>
                {fixedSummary.items.length > 0 && <span className="muted note amount-note">{formatPeso(fixedSummary.paid)} of {formatPeso(fixedSummary.total)} paid</span>}
                <button type="button" className="chip ghost" onClick={() => setDialog({ kind: 'fixed' })}>{fixedSummary.items.length > 0 ? 'Edit' : 'Add'}</button>
              </span>
            </div>
            {fixedSummary.items.length === 0 ? (
              <p className="muted">Add what you pay every month, like rent, internet or a subscription. Dirary sets that money aside before working out what's safe to spend.</p>
            ) : (
              <ul ref={fixedList} className="fixed-list">
                {fixedSummary.items.map((item) => ({ ...item, paid: item.paid || paying.has(item.expense.id) })).map((i) => (
                  <li key={i.expense.id} data-flip={i.expense.id} className={i.paid ? 'fixed done' : 'fixed'}>
                    <button
                      type="button" role="checkbox" aria-checked={i.paid} className={i.paid || i.dueIn > 3 ? 'check' : i.dueIn < 0 ? 'check p3' : 'check p2'}
                      aria-label={`${i.expense.name}, ${formatPeso(i.expense.amount_centavos)}, mark ${i.paid ? 'not paid' : 'paid'}`}
                      onClick={() => tickFixed(i)}>
                      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" pathLength={1} /></svg>
                    </button>
                    <span className="grow fixed-main">
                      <span className="task-title">{i.expense.name}</span>
                      {!i.paid && <span className={i.dueIn < 0 ? 'task-meta late' : i.dueIn <= 3 ? 'task-meta soon' : 'task-meta'}>{dueLabel(i)}</span>}
                    </span>
                    <span className="amount">{formatPeso(i.expense.amount_centavos)}</span>
                  </li>
                ))}
              </ul>
            )}
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
                  <button type="button" className="btn primary small" onClick={() => confirm(t)} disabled={leaving.has(t.id)} aria-label={`Confirm ${t.merchant ?? 'transaction'} ${formatPeso(t.amount_centavos)}`}>Confirm</button>
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

          <Recap months={recap} />

          <section className="group ledger" id="ledger" aria-label={shown ? `${shown.name} transactions` : 'Recent transactions'}>
            {shown && (
              <div className="group-bar ledger-head">
                <h2 className="group-title">{shown.name} · {formatPeso(accountBalance(shown, transactions))} now</h2>
                <button type="button" className="chip ghost" onClick={() => setOnly(null)}>Show all accounts</button>
              </div>
            )}
            {shown && days.length === 0 ? (
              <p className="note muted">No transactions in {shown.name} yet. Its balance is the opening balance, {formatPeso(shown.opening_balance_centavos)}.</p>
            ) : days.length === 0 ? (
              <section className="card empty">
                <Mascot mood="sleepy" size={128} />
                {/* The quick-add box sits above this list on phones and in the other column on wide screens, so point at it with a button, not a direction. */}
                <p className="muted">No transactions yet. Type one in the quick-add box, like “250 jollibee #food @gcash”.</p>
                <button type="button" className="btn primary" onClick={() => { const box = document.getElementById('money-quick'); box?.scrollIntoView({ block: 'center', behavior: 'smooth' }); box?.focus({ preventScroll: true }); }}>Add your first one</button>
              </section>
            ) : days.map((d) => (
              <div key={d.date} className="group">
                <h2 className="group-title day-head">
                  {dayLabel(d.date, today)}
                  {dayBalances?.has(d.date) && <span className="day-balance">{formatPeso(dayBalances.get(d.date)!)} at end of day</span>}
                </h2>
                <ul className="tasks">{d.rows.map((t) => row(t))}</ul>
              </div>
            ))}
          </section>
          </div>
        </div>
      )}

      {dialog?.kind === 'tx' && <TxDialog tx={dialog.tx} categoryId={dialog.categoryId} direction={dialog.direction} accountId={dialog.accountId} store={store} onTransfer={accounts.length > 1 ? () => setDialog({ kind: 'transfer' }) : undefined} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'fixed' && <FixedDialog store={store} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'budget' && <BudgetDialog store={store} fixedTotal={fixedSummary.total} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'accounts' && <AccountsDialog store={store} onReset={() => setDialog({ kind: 'reset' })} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'reset' && <ResetDialog store={store} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'stash' && <StashDialog stash={dialog.stash} store={store} startAccount={shown?.id} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'stashMove' && <StashMoveDialog stash={dialog.stash} mode={dialog.mode} free={stash.byAccount.get(dialog.stash.account_id)?.free ?? 0} accountName={accountById.get(dialog.stash.account_id)?.name ?? 'the account'} store={store} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'categories' && <CategoriesDialog store={store} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'transfer' && <TransferDialog store={store} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'import' && <ImportDialog store={store} onClose={() => setDialog(null)} />}
    </div>
  );
}

function TxRow({ tx, account, category, leaving, fresh, onOpen, actions }: {
  tx: Transaction; account?: Account; category?: Category; leaving?: boolean; fresh?: boolean; onOpen: () => void; actions?: ReactNode;
}) {
  const ref = useRef<HTMLLIElement>(null);
  useFold(ref, !!leaving);
  const transfer = tx.transfer_group_id !== null;
  const title = transfer ? 'Transfer' : tx.merchant ?? category?.name ?? (tx.direction === 'in' ? 'Money in' : 'Spending');
  const meta = [account?.name, transfer ? null : category?.name, timeOf(tx.occurred_at), tx.source === 'notification' ? 'Auto-logged' : tx.source === 'import' ? 'Imported' : null].filter(Boolean).join(' · ');
  return (
    <li ref={ref} className={fresh ? 'task tx fresh' : 'task tx'}>
      <button type="button" className="task-main" onClick={onOpen} aria-label={`Edit ${title}, ${formatPeso(tx.amount_centavos)}`}>
        <span className="task-title">{title}</span>
        <span className="task-meta">{meta}</span>
      </button>
      <span className={tx.direction === 'in' ? 'amount in' : 'amount'}>{formatPeso(tx.direction === 'in' ? tx.amount_centavos : -tx.amount_centavos, { sign: true })}</span>
      {actions}
    </li>
  );
}

function QuickAdd({ store, onMore }: { store: MoneyStore; onMore: (direction: Direction) => void }) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<Direction>('out');
  const read = parseMoneyQuickAdd(text, store.categories, store.accounts, mode);
  const account = store.accounts.find((a) => a.id === read.account_id) ?? store.accounts[0];
  const category = store.categories.find((c) => c.id === read.category_id);
  const incoming = read.direction === 'in';
  function pick(next: Direction) {
    setMode(next);
    // A typed + means money in; switching to Spent takes it out so the switch and the text agree.
    if (next === 'out') setText((t) => t.replace(/(^|\s)\+(?=\s*(?:₱|php)?\s*\d)/i, '$1'));
    document.getElementById('money-quick')?.focus();
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!read.amount_centavos || !account) return;
    store.addTransaction({ account_id: account.id, category_id: read.category_id, amount_centavos: read.amount_centavos, direction: read.direction, merchant: read.merchant, note: null, occurred_at: new Date().toISOString() });
    setText('');
  }
  return (
    <form className="quick" onSubmit={submit}>
      <div className="segmented quick-mode slide-switch" role="group" aria-label="Money out or in" style={{ '--n': 2, '--i': incoming ? 1 : 0 } as CSSProperties}>
        <button type="button" aria-pressed={!incoming} onClick={() => pick('out')}>Spent</button>
        <button type="button" aria-pressed={incoming} onClick={() => pick('in')}>Received</button>
      </div>
      <label className="sr-only" htmlFor="money-quick">{incoming ? 'New money in' : 'New spending'}</label>
      <input id="money-quick" className="input grow" value={text} maxLength={160} autoComplete="off"
        placeholder={incoming ? '5000 allowance @gotyme' : '250 jollibee #food @gcash'} onChange={(e) => setText(e.target.value)} aria-describedby="money-hint" />
      <button type="button" className="btn" onClick={() => onMore(read.direction)}>More options</button>
      <button type="submit" className="btn primary" disabled={!read.amount_centavos || !account}>{incoming ? 'Add money in' : 'Add expense'}</button>
      <p id="money-hint" className="quick-hint" aria-live="polite">
        {read.amount_centavos && account
          ? <>{incoming ? 'Adds' : 'Takes'} <strong className={incoming ? 'in' : undefined}>{formatPeso(incoming ? read.amount_centavos : -read.amount_centavos, { sign: true })}</strong> {incoming ? 'to' : 'from'} {account.name}{read.merchant ? ` · ${read.merchant}` : ''} · <strong>{category?.name ?? 'no category'}</strong></>
          : incoming
            ? 'Type the amount and where it came from, then @account. Example: 5000 allowance @gotyme.'
            : 'Type an amount, what it was, then #category and @account.'}
      </p>
    </form>
  );
}

function TxDialog({ tx, categoryId: startCategory, direction: startDirection, accountId: startAccount, store, onTransfer, onClose }: {
  tx: Transaction | null; categoryId?: string; direction?: Direction; accountId?: string; store: MoneyStore; onTransfer?: () => void; onClose: () => void;
}) {
  const [amount, setAmount] = useState(tx ? String(tx.amount_centavos / 100) : '');
  const [direction, setDirection] = useState<Direction>(tx?.direction ?? startDirection ?? 'out');
  const [accountId, setAccountId] = useState(tx?.account_id ?? startAccount ?? store.accounts[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState(tx?.category_id ?? startCategory ?? '');
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
    <Modal title={tx ? (tx.status === 'needs_review' ? 'Review transaction' : 'Edit transaction') : direction === 'in' ? 'Add money in' : 'Add expense'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {isTransfer && <p className="note muted">This is one half of a transfer between your accounts. It doesn't count as spending or income.</p>}
        {!isTransfer && (
          <div className="segmented kind-switch slide-switch" role="group" aria-label="What kind of transaction" style={{ '--n': !tx && onTransfer ? 3 : 2, '--i': direction === 'in' ? 1 : 0 } as CSSProperties}>
            <button type="button" aria-pressed={direction === 'out'} onClick={() => setDirection('out')}>Spent</button>
            <button type="button" aria-pressed={direction === 'in'} onClick={() => setDirection('in')}>Received</button>
            {!tx && onTransfer && <button type="button" aria-pressed={false} onClick={onTransfer}>Transfer</button>}
          </div>
        )}
        {direction === 'in' && !tx && <p className="note muted">Money that came into one of your accounts, like allowance, pay or a refund. It raises that account's balance.</p>}
        <div className="two">
          <label className="field">Amount (₱)
            <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} data-autofocus placeholder={direction === 'in' ? '5000' : '250'} />
          </label>
          <label className="field">{direction === 'in' ? 'Into' : 'Paid from'}
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {!accountId && <option value="">Pick an account</option>}
              {store.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        </div>
        <div className="two">
          <label className="field">Category
            <select className="input" value={options.some((c) => c.id === categoryId) ? categoryId : ''} onChange={(e) => setCategoryId(e.target.value)} disabled={isTransfer}>
              <option value="">No category</option>
              {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="field">{direction === 'in' ? 'From' : 'Paid to'}
            <input className="input" value={merchant} maxLength={120} placeholder={direction === 'in' ? 'Mama, work, refund' : 'Jollibee'} onChange={(e) => setMerchant(e.target.value)} />
          </label>
        </div>
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
          <button type="submit" className="btn primary">{tx?.status === 'needs_review' ? 'Confirm' : tx ? 'Save' : direction === 'in' ? 'Add money in' : 'Add expense'}</button>
        </div>
      </form>
    </Modal>
  );
}

function AccountsDialog({ store, onReset, onClose }: { store: MoneyStore; onReset: () => void; onClose: () => void }) {
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
      <div className="danger-zone">
        <div>
          <strong>Start over from ₱0</strong>
          <p className="note muted">Deletes every transaction and sets every account to ₱0. Asks for your password first.</p>
        </div>
        <button type="button" className="btn danger" onClick={onReset}>Reset money to ₱0</button>
      </div>
    </Modal>
  );
}

function ResetDialog({ store, onClose }: { store: MoneyStore; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const count = store.transactions.length;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setProblem(null);
    const failure = await store.resetMoney(password);
    setBusy(false);
    if (failure) { setProblem(failure); setPassword(''); return; }
    onClose();
  }
  return (
    <Modal title="Reset money to ₱0" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p>This deletes {count === 1 ? 'your 1 transaction' : `all ${count.toLocaleString('en-US')} transactions`}, including ones waiting to be reviewed, and sets every account's balance to ₱0. It can't be undone.</p>
        <p className="note muted">Your accounts, categories, fixed expenses, monthly budget and stashes stay. Stashes are emptied to ₱0.</p>
        <label className="field">Your password
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-autofocus />
        </label>
        {problem && <p className="note error" role="alert">{problem}</p>}
        <div className="actions">
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn danger solid" disabled={!password || busy}>{busy ? 'Resetting…' : 'Reset to ₱0'}</button>
        </div>
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

function BudgetDialog({ store, fixedTotal, onClose }: { store: MoneyStore; fixedTotal: number; onClose: () => void }) {
  const [amount, setAmount] = useState(store.plan?.monthly_budget_centavos ? String(store.plan.monthly_budget_centavos / 100) : '');
  const [problem, setProblem] = useState<string | null>(null);
  const centavos = parseAmount(amount);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (amount.trim() === '') { store.setMonthlyBudget(null); return onClose(); }
    if (!centavos) return setProblem('Enter an amount, like 15000.');
    store.setMonthlyBudget(centavos);
    onClose();
  }
  return (
    <Modal title="Monthly budget" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="note muted">How much you allow yourself to spend in a month, fixed expenses included. Dirary sets your fixed expenses aside, subtracts what you've spent, and spreads the rest over the days left. That's your daily limit.</p>
        <label className="field">Monthly budget (₱)
          <input className="input" inputMode="decimal" value={amount} placeholder="15000" onChange={(e) => setAmount(e.target.value)} data-autofocus />
        </label>
        {centavos !== null && fixedTotal > 0 && <p className="note muted">{formatPeso(fixedTotal)} of it is fixed expenses, leaving {formatPeso(centavos - fixedTotal)} for everyday spending.</p>}
        {problem && <p className="note error" role="alert">{problem}</p>}
        <div className="actions"><span className="grow" /><button type="button" className="btn" onClick={onClose}>Cancel</button><button type="submit" className="btn primary">Save</button></div>
      </form>
    </Modal>
  );
}

function FixedDialog({ store, onClose }: { store: MoneyStore; onClose: () => void }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [dueDay, setDueDay] = useState('1');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const expenseCategories = store.categories.filter((c) => c.kind === 'expense');

  function add(event: FormEvent) {
    event.preventDefault();
    const centavos = parseAmount(amount);
    const day = Number(dueDay);
    if (!name.trim()) return setProblem('Give it a name, like Rent.');
    if (!centavos) return setProblem('Enter an amount, like 3500.');
    if (!Number.isInteger(day) || day < 1 || day > 31) return setProblem('The due day is a day of the month, 1 to 31.');
    store.saveFixed({ name: name.trim(), amount_centavos: centavos, due_day: day, category_id: categoryId || null, account_id: accountId || null });
    setName(''); setAmount(''); setProblem(null);
  }
  const patch = (e: FixedExpense, change: Partial<FixedExpense>) => store.saveFixed({ ...e, ...change });

  return (
    <Modal title="Fixed expenses" onClose={onClose}>
      <p className="note muted">What you pay every month. Tick one off on the Money screen when it's paid; that logs the payment.</p>
      <ul className="list-rows">
        {store.fixed.map((e) => (
          <li key={e.id} className="fixed-edit">
            <input className="input grow" defaultValue={e.name} maxLength={60} aria-label={`Name of ${e.name}`}
              onBlur={(ev) => { const next = ev.target.value.trim(); if (next && next !== e.name) patch(e, { name: next }); else ev.target.value = e.name; }} />
            <input className="input narrow" inputMode="decimal" defaultValue={String(e.amount_centavos / 100)} aria-label={`Amount of ${e.name}`}
              onBlur={(ev) => { const next = parseAmount(ev.target.value); if (next && next !== e.amount_centavos) patch(e, { amount_centavos: next }); else ev.target.value = String(e.amount_centavos / 100); }} />
            <input className="input tiny" inputMode="numeric" defaultValue={String(e.due_day)} aria-label={`Due day of ${e.name}`}
              onBlur={(ev) => { const next = Number(ev.target.value); if (Number.isInteger(next) && next >= 1 && next <= 31 && next !== e.due_day) patch(e, { due_day: next }); else ev.target.value = String(e.due_day); }} />
            <button type="button" className="btn danger" onClick={() => store.removeFixed(e.id)} aria-label={`Delete ${e.name}`}>Delete</button>
          </li>
        ))}
      </ul>
      <form className="form" onSubmit={add}>
        <div className="two">
          <label className="field">Name<input className="input" value={name} maxLength={60} placeholder="Rent" onChange={(e) => setName(e.target.value)} /></label>
          <label className="field">Amount (₱)<input className="input" inputMode="decimal" value={amount} placeholder="3500" onChange={(e) => setAmount(e.target.value)} /></label>
        </div>
        <div className="two">
          <label className="field">Due day of the month<input className="input" inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value)} /></label>
          <label className="field">Category
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">None</option>
              {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>
        <label className="field">Paid from
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">First account</option>
            {store.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>
        {problem && <p className="note error" role="alert">{problem}</p>}
        <div className="actions"><span className="grow" /><button type="button" className="btn" onClick={onClose}>Done</button><button type="submit" className="btn primary">Add</button></div>
      </form>
    </Modal>
  );
}

/** Money in, spent and kept for this month, with up to six months side by side. */
function Recap({ months }: { months: ReturnType<typeof monthlyRecap> }) {
  const now = months[months.length - 1];
  const top = Math.max(1, ...months.flatMap((m) => [m.income, m.spent]));
  const pct = (v: number) => `${Math.round((v / top) * 100)}%`;
  return (
    <section className="card recap" aria-labelledby="recap-title">
      <h2 id="recap-title" className="card-label">Monthly recap</h2>
      {now && (
        <>
          <dl className="recap-figures">
            <div><dt>In</dt><dd>{formatPeso(now.income)}</dd></div>
            <div><dt>Spent</dt><dd>{formatPeso(now.spent)}</dd></div>
            <div><dt>Kept</dt><dd className={now.saved < 0 ? 'late' : 'kept'}>{formatPeso(now.saved)}</dd></div>
          </dl>
          <p className="note muted">{monthName(now.month, true)} so far</p>
          <ul className="recap-chart">
            {months.map((m) => (
              <li key={m.month} aria-label={`${monthName(m.month, true)}: ${formatPeso(m.income)} in, ${formatPeso(m.spent)} spent, ${formatPeso(m.saved)} kept`}>
                <div className="recap-bars" aria-hidden="true">
                  <span className="in" style={{ height: pct(m.income) }} />
                  <span className="out" style={{ height: pct(m.spent) }} />
                </div>
                <span className="recap-month" aria-hidden="true">{monthName(m.month)}</span>
                <span className={m.saved < 0 ? 'recap-kept late' : 'recap-kept'} aria-hidden="true">{formatPesoShort(m.saved)}</span>
              </li>
            ))}
          </ul>
          <div className="recap-legend" aria-hidden="true"><span><i className="in" />In</span><span><i className="out" />Spent</span><span>Number below: kept</span></div>
        </>
      )}
      <p className={now ? undefined : 'muted'}>{recapLine(months, formatPeso)}</p>
    </section>
  );
}

function StashDialog({ stash, store, startAccount, onClose }: { stash: Stash | null; store: MoneyStore; startAccount?: string; onClose: () => void }) {
  const [name, setName] = useState(stash?.name ?? '');
  const [accountId, setAccountId] = useState(stash?.account_id ?? startAccount ?? store.accounts[0]?.id ?? '');
  const [goal, setGoal] = useState(stash?.goal_centavos ? String(stash.goal_centavos / 100) : '');
  const [amount, setAmount] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setProblem('Give it a name, like Emergency fund.');
    if (!accountId) return setProblem('Pick the account the money is in.');
    const goalCentavos = goal.trim() === '' ? null : parseAmount(goal);
    if (goal.trim() !== '' && !goalCentavos) return setProblem('Enter the goal as an amount, like 20000, or leave it empty.');
    const start = amount.trim() === '' ? 0 : parseAmount(amount);
    if (start === null) return setProblem('Enter an amount, like 5000, or leave it empty.');
    store.saveStash({ id: stash?.id, name: name.trim().slice(0, 40), account_id: accountId, goal_centavos: goalCentavos, amount_centavos: stash ? stash.amount_centavos : start });
    onClose();
  }
  return (
    <Modal title={stash ? `Edit ${stash.name}` : 'New stash'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {!stash && <p className="note muted">The money stays where it is. A stash only marks part of an account's balance as set aside, so it stops counting as spendable.</p>}
        <div className="two">
          <label className="field">Name
            <input className="input" value={name} maxLength={40} placeholder="Emergency fund" onChange={(e) => setName(e.target.value)} data-autofocus />
          </label>
          <label className="field">Kept in
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {store.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        </div>
        <div className="two">
          <label className="field">Goal (₱, optional)
            <input className="input" inputMode="decimal" value={goal} placeholder="20000" onChange={(e) => setGoal(e.target.value)} />
          </label>
          {!stash && (
            <label className="field">Set aside now (₱)
              <input className="input" inputMode="decimal" value={amount} placeholder="0" onChange={(e) => setAmount(e.target.value)} />
            </label>
          )}
        </div>
        {problem && <p className="note error" role="alert">{problem}</p>}
        <div className="actions">
          {stash && <button type="button" className="btn danger" onClick={() => { store.removeStash(stash.id); onClose(); }}>Delete stash</button>}
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary">{stash ? 'Save' : 'Add stash'}</button>
        </div>
        {stash && <p className="note muted">Deleting a stash doesn't move or remove money. What was set aside counts as spendable again.</p>}
      </form>
    </Modal>
  );
}

function StashMoveDialog({ stash, mode, free, accountName, store, onClose }: { stash: Stash; mode: 'in' | 'out'; free: number; accountName: string; store: MoneyStore; onClose: () => void }) {
  const [amount, setAmount] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const centavos = parseAmount(amount);
  const putting = mode === 'in';
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!centavos) return setProblem('Enter an amount, like 500.');
    if (!putting && centavos > stash.amount_centavos) return setProblem(`Only ${formatPeso(stash.amount_centavos)} is in ${stash.name}.`);
    store.saveStash({ ...stash, amount_centavos: moveStash(stash, putting ? centavos : -centavos) });
    onClose();
  }
  return (
    <Modal title={putting ? `Put money in ${stash.name}` : `Take money out of ${stash.name}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="note muted">
          {putting
            ? `${accountName} has ${formatPeso(Math.max(0, free))} that isn't set aside yet. Nothing moves between accounts; this only marks the money as saved.`
            : `${stash.name} has ${formatPeso(stash.amount_centavos)}. What you take out counts as spendable again.`}
        </p>
        <label className="field">Amount (₱)
          <input className="input" inputMode="decimal" value={amount} placeholder="500" onChange={(e) => setAmount(e.target.value)} data-autofocus />
        </label>
        {putting && centavos !== null && centavos > free && <p className="note warn">That's more than {accountName} has free. Check its balance first, or it will show as over.</p>}
        {problem && <p className="note error" role="alert">{problem}</p>}
        <div className="actions">
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary">{putting ? 'Put in' : 'Take out'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** How long a ticked item stays visible before it moves; how long a row takes to fold shut. */
const CHECKED_MS = 340;
const FOLD_MS = 220;
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The last change to a number, kept for about a second so it can float beside the number. Null on first load. */
function useChange(value: number | null): { key: number; delta: number } | null {
  const prev = useRef<number | null>(null);
  const [change, setChange] = useState<{ key: number; delta: number } | null>(null);
  useEffect(() => {
    if (value === null) return;
    const was = prev.current;
    prev.current = value;
    if (was === null || was === value) return;
    const key = performance.now();
    setChange({ key, delta: value - was });
    window.setTimeout(() => setChange((c) => (c?.key === key ? null : c)), 1000);
  }, [value]);
  return change;
}

/** A big peso figure that tints for a moment and shows the change beside it, e.g. "−₱130", after it changes. */
function Figure({ value, change }: { value: number; change: { key: number; delta: number } | null }) {
  return (
    <>
      <span key={change?.key ?? 0} className={change ? 'figure bumped' : 'figure'}>{formatPeso(value)}</span>
      {change && <span key={`d${change.key}`} className={change.delta < 0 ? 'delta out' : 'delta'} aria-hidden="true">{formatPeso(change.delta, { sign: true })}</span>}
    </>
  );
}

/** Ids that appeared after the first load, for about half a second, so their rows can slide in. */
function useFresh(ids: string[], loading: boolean) {
  const known = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const key = ids.join(',');
  const mark = (id: string) => {
    setFresh((cur) => new Set(cur).add(id));
    window.setTimeout(() => setFresh((cur) => { const next = new Set(cur); next.delete(id); return next; }), 600);
  };
  useLayoutEffect(() => {
    if (loading) return;
    if (!known.current) { known.current = new Set(ids); return; }
    for (const id of ids) if (!known.current.has(id)) { known.current.add(id); mark(id); }
  }, [key, loading]); // eslint-disable-line react-hooks/exhaustive-deps
  return { has: (id: string) => fresh.has(id), mark };
}

/** Folds a list row shut: pins its height so there is a number to shrink from, then lets the CSS take it to zero. */
function useFold(ref: RefObject<HTMLElement | null>, folding: boolean) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !folding) return;
    el.style.height = `${el.offsetHeight}px`;
    void el.offsetHeight;
    el.classList.add('folding');
  }, [ref, folding]);
}

/** Rows that change place in a list glide to their new spot instead of jumping (marked with data-flip). */
function useFlip(list: RefObject<HTMLElement | null>, deps: unknown[]) {
  const tops = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const next = new Map<string, number>();
    for (const child of Array.from(el.querySelectorAll<HTMLElement>('[data-flip]'))) {
      const id = child.dataset.flip!;
      const top = child.offsetTop;
      next.set(id, top);
      const was = tops.current.get(id);
      if (was !== undefined && Math.abs(was - top) > 1 && !reducedMotion()) {
        child.animate([{ transform: `translateY(${was - top}px)` }, { transform: 'none' }], { duration: 280, easing: EASE_OUT });
      }
    }
    tops.current = next;
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

import { z } from 'zod';
import { LIST_COLORS } from './tasks';

export const INSTITUTIONS = ['securitybank', 'gotyme', 'gcash', 'cash', 'other'] as const;
export type Institution = (typeof INSTITUTIONS)[number];
export const INSTITUTION_LABEL: Record<Institution, string> = { securitybank: 'Security Bank', gotyme: 'GoTyme', gcash: 'GCash', cash: 'Cash', other: 'Other' };

const stamps = { created_at: z.string(), updated_at: z.string(), deleted_at: z.string().nullable() };

export const Account = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(40),
  institution: z.enum(INSTITUTIONS),
  opening_balance_centavos: z.number().int(),
  sort_order: z.number().int(),
  ...stamps,
});
export type Account = z.infer<typeof Account>;

export const Category = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(40),
  kind: z.enum(['expense', 'income']),
  color: z.enum(LIST_COLORS),
  /** The monthly budget, in centavos. Null means no budget. */
  monthly_limit_centavos: z.number().int().positive().nullable(),
  sort_order: z.number().int(),
  ...stamps,
});
export type Category = z.infer<typeof Category>;

export const SOURCES = ['manual', 'notification', 'email', 'import'] as const;
export const Transaction = z.object({
  id: z.uuid(),
  account_id: z.uuid().nullable(),
  category_id: z.uuid().nullable(),
  /** Always positive. `direction` says whether money came in or went out. */
  amount_centavos: z.number().int().positive(),
  direction: z.enum(['in', 'out']),
  merchant: z.string().max(120).nullable(),
  note: z.string().max(500).nullable(),
  occurred_at: z.string(),
  source: z.enum(SOURCES),
  status: z.enum(['needs_review', 'confirmed']),
  fingerprint: z.string().nullable(),
  transfer_group_id: z.uuid().nullable(),
  /** Set on the payment of a fixed monthly expense. */
  fixed_expense_id: z.uuid().nullable(),
  ...stamps,
});
export type Transaction = z.infer<typeof Transaction>;

/** What the add/edit form produces. */
export const TransactionDraft = Transaction.pick({
  account_id: true, category_id: true, amount_centavos: true, direction: true, merchant: true, note: true, occurred_at: true,
});
export type TransactionDraft = z.infer<typeof TransactionDraft>;

export const ACCOUNTS_TABLE = 'accounts';
export const CATEGORIES_TABLE = 'categories';
export const TRANSACTIONS_TABLE = 'transactions';
export const ACCOUNT_COLUMNS = 'id, name, institution, opening_balance_centavos, sort_order, created_at, updated_at, deleted_at';
export const CATEGORY_COLUMNS = 'id, name, kind, color, monthly_limit_centavos, sort_order, created_at, updated_at, deleted_at';
export const TRANSACTION_COLUMNS =
  'id, account_id, category_id, amount_centavos, direction, merchant, note, occurred_at, source, status, fingerprint, transfer_group_id, fixed_expense_id, created_at, updated_at, deleted_at';

/** Starter set, offered with one tap on first use. */
export const STARTER_ACCOUNTS: { name: string; institution: Institution }[] = [
  { name: 'Security Bank', institution: 'securitybank' },
  { name: 'GoTyme', institution: 'gotyme' },
  { name: 'GCash', institution: 'gcash' },
  { name: 'Cash', institution: 'cash' },
];
export const STARTER_CATEGORIES: { name: string; kind: 'expense' | 'income'; color: (typeof LIST_COLORS)[number] }[] = [
  { name: 'Food', kind: 'expense', color: 'amber' },
  { name: 'Transport', kind: 'expense', color: 'inkBlue' },
  { name: 'Bills', kind: 'expense', color: 'red' },
  { name: 'School', kind: 'expense', color: 'inkBlue' },
  { name: 'Shopping', kind: 'expense', color: 'tongue' },
  { name: 'Health', kind: 'expense', color: 'tongue' },
  { name: 'Fun', kind: 'expense', color: 'amber' },
  { name: 'Other', kind: 'expense', color: 'muted' },
  { name: 'Salary', kind: 'income', color: 'inkBlue' },
  { name: 'Allowance', kind: 'income', color: 'inkBlue' },
  { name: 'Other income', kind: 'income', color: 'muted' },
];

// ---- amounts ----

/** ₱1,240 or ₱1,240.50. Pass sign to prefix + or −. */
export function formatPeso(centavos: number, opts: { sign?: boolean } = {}): string {
  const abs = Math.abs(centavos);
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cents = abs % 100;
  const prefix = centavos < 0 ? '−' : opts.sign && centavos > 0 ? '+' : '';
  return `${prefix}₱${whole}${cents ? `.${String(cents).padStart(2, '0')}` : ''}`;
}

/** "1,234.5" or "₱250" → centavos. Null if it isn't a positive amount. */
export function parseAmount(text: string): number | null {
  const clean = text.replace(/[₱,\s]|php/gi, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [whole, frac = ''] = clean.split('.');
  const centavos = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return centavos > 0 && Number.isSafeInteger(centavos) ? centavos : null;
}

// ---- views ----

const live = <T extends { deleted_at: string | null }>(rows: readonly T[]) => rows.filter((r) => r.deleted_at === null);
const counted = (t: Transaction) => t.deleted_at === null && t.status === 'confirmed';
const signed = (t: Transaction) => (t.direction === 'in' ? t.amount_centavos : -t.amount_centavos);

/** Opening balance plus every confirmed transaction. Unreviewed ones don't count until you confirm them. */
export function accountBalance(account: Account, transactions: readonly Transaction[]): number {
  return transactions.filter((t) => counted(t) && t.account_id === account.id).reduce((sum, t) => sum + signed(t), account.opening_balance_centavos);
}

export interface CategorySpend {
  category: Category;
  spent: number;
  limit: number | null;
  /** Negative when over budget. Null without a budget. */
  left: number | null;
}

export interface MonthSummary {
  month: string;
  spent: number;
  income: number;
  /** Expense categories with spending or a budget, biggest spend first. */
  categories: CategorySpend[];
  uncategorized: number;
  budgeted: number;
  /** Spending that counts against a budget. */
  budgetSpent: number;
}

/** Money in and out for a month ("YYYY-MM"). Transfers between your own accounts are left out. */
export function monthSummary(transactions: readonly Transaction[], categories: readonly Category[], month: string, toLocalDate: (iso: string) => string): MonthSummary {
  const inMonth = transactions.filter((t) => counted(t) && t.transfer_group_id === null && toLocalDate(t.occurred_at).startsWith(month));
  const out = inMonth.filter((t) => t.direction === 'out');
  const liveCategories = live(categories).filter((c) => c.kind === 'expense');
  const ids = new Set(liveCategories.map((c) => c.id));
  const rows = liveCategories
    .map((category) => {
      const spent = out.filter((t) => t.category_id === category.id).reduce((s, t) => s + t.amount_centavos, 0);
      const limit = category.monthly_limit_centavos;
      return { category, spent, limit, left: limit === null ? null : limit - spent };
    })
    .filter((r) => r.spent > 0 || r.limit !== null)
    .sort((a, b) => b.spent - a.spent || a.category.sort_order - b.category.sort_order);
  return {
    month,
    spent: out.reduce((s, t) => s + t.amount_centavos, 0),
    income: inMonth.filter((t) => t.direction === 'in').reduce((s, t) => s + t.amount_centavos, 0),
    categories: rows,
    uncategorized: out.filter((t) => t.category_id === null || !ids.has(t.category_id)).reduce((s, t) => s + t.amount_centavos, 0),
    budgeted: rows.reduce((s, r) => s + (r.limit ?? 0), 0),
    budgetSpent: rows.filter((r) => r.limit !== null).reduce((s, r) => s + r.spent, 0),
  };
}

/** Confirmed spending on one local day, transfers left out. */
export function spentOn(transactions: readonly Transaction[], day: string, toLocalDate: (iso: string) => string): number {
  return transactions
    .filter((t) => counted(t) && t.direction === 'out' && t.transfer_group_id === null && toLocalDate(t.occurred_at) === day)
    .reduce((s, t) => s + t.amount_centavos, 0);
}

export function needsReview(transactions: readonly Transaction[]): Transaction[] {
  return live(transactions).filter((t) => t.status === 'needs_review').sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1));
}

/**
 * One account's balance at the end of each day it had activity, for checking against a bank statement.
 * Keyed by "YYYY-MM-DD"; counts the same transactions as accountBalance.
 */
export function endOfDayBalances(account: Account, transactions: readonly Transaction[], toLocalDate: (iso: string) => string): Map<string, number> {
  const rows = transactions.filter((t) => counted(t) && t.account_id === account.id).sort((a, b) => (a.occurred_at < b.occurred_at ? -1 : 1));
  const out = new Map<string, number>();
  let balance = account.opening_balance_centavos;
  for (const t of rows) {
    balance += signed(t);
    out.set(toLocalDate(t.occurred_at), balance);
  }
  return out;
}

export function recentTransactions(transactions: readonly Transaction[], limit = 50): Transaction[] {
  return transactions.filter(counted).sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1)).slice(0, limit);
}

/** Ink's mood and line for the budget card. `day` and `daysInMonth` set the pace: spending well ahead of the calendar worries him. */
export function budgetCoach(summary: MonthSummary, day: number, daysInMonth: number): { mood: 'happy' | 'coach' | 'cheer' | 'sleepy' | 'worried'; line: string } {
  const over = summary.categories.filter((r) => r.left !== null && r.left < 0).sort((a, b) => (a.left as number) - (b.left as number))[0];
  if (over) return { mood: 'worried', line: `${over.category.name} is over by ${formatPeso(-(over.left as number))}.` };
  if (summary.spent === 0 && summary.budgeted === 0) return { mood: 'sleepy', line: 'No spending logged this month yet.' };
  if (summary.budgeted === 0) return { mood: 'coach', line: 'Set a monthly budget on a category and I\'ll keep watch.' };
  const daysLeft = daysInMonth - day;
  const left = summary.budgeted - summary.budgetSpent;
  const used = summary.budgetSpent / summary.budgeted;
  if (used > day / daysInMonth + 0.15) return { mood: 'worried', line: `Spending is ahead of pace. ${formatPeso(left)} left for ${daysLeft} day${daysLeft === 1 ? '' : 's'}.` };
  if (daysLeft === 0) return { mood: 'cheer', line: `Month closed ${formatPeso(left)} under budget.` };
  return { mood: 'happy', line: `${formatPeso(left)} left, ${daysLeft} day${daysLeft === 1 ? '' : 's'} to go.` };
}

// ---- transfers ----

const TEN_MINUTES = 10 * 60 * 1000;

/**
 * Pairs that look like one move between your own accounts: same amount, one out and one in,
 * different accounts, within ten minutes. Only unlinked transactions are considered, and each is used once.
 */
export function findTransferPairs(transactions: readonly Transaction[]): { out: Transaction; into: Transaction }[] {
  const open = live(transactions).filter((t) => t.transfer_group_id === null && t.account_id !== null);
  const ins = open.filter((t) => t.direction === 'in');
  const used = new Set<string>();
  const pairs: { out: Transaction; into: Transaction }[] = [];
  for (const out of open.filter((t) => t.direction === 'out')) {
    const match = ins.find((t) =>
      !used.has(t.id) && t.amount_centavos === out.amount_centavos && t.account_id !== out.account_id
      && Math.abs(Date.parse(t.occurred_at) - Date.parse(out.occurred_at)) <= TEN_MINUTES);
    if (match) {
      used.add(match.id);
      pairs.push({ out, into: match });
    }
  }
  return pairs;
}

// ---- quick add ----

export interface MoneyQuickAdd {
  amount_centavos: number | null;
  direction: 'in' | 'out';
  merchant: string | null;
  category_id: string | null;
  account_id: string | null;
}

const squash = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
function pick<T extends { id: string; name: string }>(tag: string, rows: readonly T[]): T | null {
  const wanted = squash(tag);
  if (!wanted) return null;
  const exact = rows.find((r) => squash(r.name) === wanted);
  if (exact) return exact;
  const starts = rows.filter((r) => squash(r.name).startsWith(wanted));
  return starts.length === 1 ? starts[0]! : null;
}

/**
 * "250 jollibee #food @gcash" → ₱250 out, merchant Jollibee, category Food, account GCash.
 * A leading + means money in: "+5000 allowance #allowance @gotyme".
 */
/**
 * `mode` is the Spent / Received switch beside the box. Received makes it money in; so does a leading + or an
 * income category, whatever the switch says. A category of the wrong kind for the direction is dropped.
 */
export function parseMoneyQuickAdd(text: string, categories: readonly Category[], accounts: readonly Account[], mode: 'in' | 'out' = 'out'): MoneyQuickAdd {
  let rest = ` ${text} `;
  let category_id: string | null = null;
  let account_id: string | null = null;

  const cat = /\s#([\p{L}\p{N}_-]+)(?=\s)/u.exec(rest);
  if (cat) {
    const found = pick(cat[1]!, live(categories));
    if (found) { category_id = found.id; rest = rest.replace(cat[0], ' '); }
  }
  const acc = /\s@([\p{L}\p{N}_-]+)(?=\s)/u.exec(rest);
  if (acc) {
    const found = pick(acc[1]!, live(accounts));
    if (found) { account_id = found.id; rest = rest.replace(acc[0], ' '); }
  }

  let amount_centavos: number | null = null;
  let direction: 'in' | 'out' = mode;
  const amount = /\s(\+)?(?:₱|php\s?)?(\d[\d,]*(?:\.\d{1,2})?)(?=\s)/i.exec(rest);
  if (amount) {
    amount_centavos = parseAmount(amount[2]!);
    if (amount[1]) direction = 'in';
    rest = rest.replace(amount[0], ' ');
  }
  // An income category implies money in.
  const kind = category_id ? categories.find((c) => c.id === category_id)?.kind : undefined;
  if (kind === 'income') direction = 'in';
  else if (kind === 'expense' && direction === 'in') category_id = null;

  const merchant = rest.replace(/\s+/g, ' ').trim();
  return { amount_centavos, direction, merchant: merchant ? merchant.charAt(0).toUpperCase() + merchant.slice(1) : null, category_id, account_id };
}

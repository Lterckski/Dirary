/** Fixed monthly expenses, the monthly budget, and what is safe to spend today. */
import { z } from 'zod';
import type { Transaction } from './money';

const stamps = { created_at: z.string(), updated_at: z.string(), deleted_at: z.string().nullable() };

export const FixedExpense = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(60),
  amount_centavos: z.number().int().positive(),
  /** Day of the month it is due. In shorter months, a later day means the last day. */
  due_day: z.number().int().min(1).max(31),
  category_id: z.uuid().nullable(),
  account_id: z.uuid().nullable(),
  sort_order: z.number().int(),
  ...stamps,
});
export type FixedExpense = z.infer<typeof FixedExpense>;

export const MoneyPlan = z.object({
  id: z.uuid(),
  /** What you allow yourself to spend in a month, fixed expenses included. Null means not set. */
  monthly_budget_centavos: z.number().int().positive().nullable(),
  ...stamps,
});
export type MoneyPlan = z.infer<typeof MoneyPlan>;

export const FIXED_EXPENSES_TABLE = 'fixed_expenses';
export const MONEY_PLANS_TABLE = 'money_plans';
export const FIXED_EXPENSE_COLUMNS = 'id, name, amount_centavos, due_day, category_id, account_id, sort_order, created_at, updated_at, deleted_at';
export const MONEY_PLAN_COLUMNS = 'id, monthly_budget_centavos, created_at, updated_at, deleted_at';

/** There is one plan. If two devices each created one offline, the most recently changed wins. */
export function currentPlan(plans: readonly MoneyPlan[]): MoneyPlan | null {
  return plans.filter((p) => p.deleted_at === null).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))[0] ?? null;
}

const daysIn = (today: string) => new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate();
const counted = (t: Transaction) => t.deleted_at === null && t.status === 'confirmed';

export interface FixedStatus {
  expense: FixedExpense;
  paid: boolean;
  /** This month's payment, if it was ticked off. */
  payment: Transaction | null;
  /** Days until it is due this month. Negative when the day has passed. */
  dueIn: number;
  /** The due date this month, "YYYY-MM-DD". */
  dueDate: string;
}

export interface FixedSummary {
  /** Unpaid first, soonest due first; paid ones last. */
  items: FixedStatus[];
  total: number;
  paid: number;
  /** Unpaid and due within three days, or already past due. */
  dueSoon: FixedStatus[];
}

/** Each fixed expense for the month of `today` ("YYYY-MM-DD"), with whether it has been paid. */
export function fixedThisMonth(expenses: readonly FixedExpense[], transactions: readonly Transaction[], today: string, toLocalDate: (iso: string) => string): FixedSummary {
  const month = today.slice(0, 7);
  const day = Number(today.slice(8, 10));
  const last = daysIn(today);
  const payments = new Map<string, Transaction>();
  for (const t of transactions) {
    if (counted(t) && t.fixed_expense_id !== null && toLocalDate(t.occurred_at).startsWith(month) && !payments.has(t.fixed_expense_id)) payments.set(t.fixed_expense_id, t);
  }
  const items = expenses
    .filter((e) => e.deleted_at === null)
    .map((expense): FixedStatus => {
      const due = Math.min(expense.due_day, last);
      const payment = payments.get(expense.id) ?? null;
      return { expense, paid: payment !== null, payment, dueIn: due - day, dueDate: `${month}-${String(due).padStart(2, '0')}` };
    })
    .sort((a, b) => Number(a.paid) - Number(b.paid) || a.dueIn - b.dueIn || a.expense.sort_order - b.expense.sort_order);
  return {
    items,
    total: items.reduce((s, i) => s + i.expense.amount_centavos, 0),
    paid: items.filter((i) => i.paid).reduce((s, i) => s + i.expense.amount_centavos, 0),
    dueSoon: items.filter((i) => !i.paid && i.dueIn <= 3),
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Due today", "Due in 3 days", "Was due 2 days ago", or "Due Nov 28" when it is further off. */
export function dueLabel(status: FixedStatus): string {
  const n = status.dueIn;
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  if (n < 0) return `Was due ${-n} day${n === -1 ? '' : 's'} ago`;
  if (n <= 7) return `Due in ${n} days`;
  return `Due ${MONTHS[Number(status.dueDate.slice(5, 7)) - 1]} ${Number(status.dueDate.slice(8, 10))}`;
}

export interface SafeToSpend {
  /** False until a monthly budget is set. The other numbers are then zero, except spentToday. */
  ready: boolean;
  /** What today's allowance was at the start of the day. */
  dailyLimit: number;
  /** Everyday spending today (fixed-expense payments and transfers left out). */
  spentToday: number;
  /** dailyLimit minus spentToday. Negative when over. */
  safeToday: number;
  /** Days left in the month, today included. */
  daysLeft: number;
  /** Budget minus all fixed expenses minus everyday spending so far, today included. */
  leftThisMonth: number;
}

/**
 * The monthly budget, minus every fixed expense (paid or not), minus everyday spending before today,
 * spread evenly over the days left including today. Payments of fixed expenses are not everyday spending:
 * their money was already set aside.
 */
export function safeToSpend(plan: MoneyPlan | null, expenses: readonly FixedExpense[], transactions: readonly Transaction[], today: string, toLocalDate: (iso: string) => string): SafeToSpend {
  const month = today.slice(0, 7);
  const daysLeft = daysIn(today) - Number(today.slice(8, 10)) + 1;
  let before = 0;
  let spentToday = 0;
  for (const t of transactions) {
    if (!counted(t) || t.direction !== 'out' || t.transfer_group_id !== null || t.fixed_expense_id !== null) continue;
    const date = toLocalDate(t.occurred_at);
    if (date === today) spentToday += t.amount_centavos;
    else if (date.startsWith(month) && date < today) before += t.amount_centavos;
  }
  const budget = plan?.monthly_budget_centavos ?? null;
  if (budget === null) return { ready: false, dailyLimit: 0, spentToday, safeToday: 0, daysLeft, leftThisMonth: 0 };
  const fixed = expenses.filter((e) => e.deleted_at === null).reduce((s, e) => s + e.amount_centavos, 0);
  const pool = budget - fixed - before;
  const dailyLimit = Math.max(0, Math.floor(pool / daysLeft));
  return { ready: true, dailyLimit, spentToday, safeToday: (pool < 0 ? pool : dailyLimit) - spentToday, daysLeft, leftThisMonth: pool - spentToday };
}

/** Ink's mood and line for the safe-to-spend card. Bills that are late or nearly due come first. */
export function spendCoach(safe: SafeToSpend, fixed: FixedSummary, formatPeso: (centavos: number) => string): { mood: 'happy' | 'coach' | 'cheer' | 'sleepy' | 'worried'; line: string } {
  const late = fixed.dueSoon.find((i) => i.dueIn < 0);
  if (late) return { mood: 'worried', line: `${late.expense.name} (${formatPeso(late.expense.amount_centavos)}) was due ${-late.dueIn} day${late.dueIn === -1 ? '' : 's'} ago.` };
  if (safe.ready && safe.safeToday < 0) return { mood: 'worried', line: `Over today's limit by ${formatPeso(-safe.safeToday)}. Tomorrow's limit will be a little smaller.` };
  const soon = fixed.dueSoon[0];
  if (soon) return { mood: 'coach', line: `${soon.expense.name} (${formatPeso(soon.expense.amount_centavos)}) is ${soon.dueIn === 0 ? 'due today' : soon.dueIn === 1 ? 'due tomorrow' : `due in ${soon.dueIn} days`}.` };
  if (!safe.ready) return { mood: 'coach', line: "Set a monthly budget and I'll work out what's safe to spend each day." };
  if (safe.spentToday === 0) return { mood: 'happy', line: `Nothing spent yet today. ${formatPeso(safe.safeToday)} is yours to use.` };
  if (fixed.items.length > 0 && fixed.paid === fixed.total) return { mood: 'cheer', line: `Every fixed expense is paid. ${formatPeso(safe.safeToday)} left for today.` };
  return { mood: 'happy', line: `${formatPeso(safe.safeToday)} left for today.` };
}

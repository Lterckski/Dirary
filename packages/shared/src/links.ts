/**
 * Links between Tasks and Money.
 *
 * Bills: every fixed expense shows up as a task on its due day this month, with a reminder that morning.
 * The payment in Money is the source of truth: a bill task is done exactly when that month's payment exists.
 * Ticking the task logs the payment; paying in Money ticks the task. The task's id is derived from the bill
 * and the month, so the phone and the web create the very same row and never a duplicate.
 *
 * Amounts: a task like "Buy dog food ₱450" offers to log ₱450 when it is ticked.
 */
import type { Transaction, TransactionDraft } from './money';
import type { FixedExpense } from './plan';
import { formatPesoShort } from './recap';
import { remindAt } from './reminders';
import type { Task } from './tasks';

// ---- bill tasks ----

/** FNV-1a over the text, seeded, as eight hex characters. */
function fnv(text: string, seed: number): string {
  let h = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** The id of the task for one bill in one month ("YYYY-MM"). The same on every device. A version-8 UUID. */
export function billTaskId(expenseId: string, month: string): string {
  const key = `dirary-bill:${expenseId}:${month}`;
  const hex = [0, 1, 2, 3].map((seed) => fnv(key, seed * 0x9e3779b9)).join('');
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** "Pay Meralco · ₱2,340" */
export function billTitle(expense: Pick<FixedExpense, 'name' | 'amount_centavos'>): string {
  return `Pay ${expense.name} · ${formatPesoShort(expense.amount_centavos)}`;
}

const addMonths = (month: string, n: number) => {
  const d = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const lastDay = (month: string) => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();

/** The bill's due date in a month; a due day past the month's end means its last day. */
export function billDueDate(expense: Pick<FixedExpense, 'due_day'>, month: string): string {
  return `${month}-${String(Math.min(expense.due_day, lastDay(month))).padStart(2, '0')}`;
}

export interface BillLink {
  expense: FixedExpense;
  /** "YYYY-MM" the task belongs to. */
  month: string;
}

/** Which bill and month a task stands for, or null for an ordinary task. Looks at this month and the two before. */
export function billOf(task: Pick<Task, 'id'>, expenses: readonly FixedExpense[], today: string): BillLink | null {
  const current = today.slice(0, 7);
  for (const month of [current, addMonths(current, -1), addMonths(current, -2)]) {
    for (const expense of expenses) if (billTaskId(expense.id, month) === task.id) return { expense, month };
  }
  return null;
}

/** That month's payment of the bill, if there is one. */
export function billPayment(expenseId: string, month: string, transactions: readonly Transaction[], toLocalDate: (iso: string) => string): Transaction | null {
  return transactions.find((t) => t.deleted_at === null && t.status === 'confirmed' && t.fixed_expense_id === expenseId && toLocalDate(t.occurred_at).startsWith(month)) ?? null;
}

/**
 * The payment to log when a bill task is ticked. This month's bill is paid now. An older month's bill is
 * dated on its due day, so it counts for the month it belongs to and not as this month's payment.
 */
export function billPaymentDraft(link: BillLink, fallbackAccountId: string | null, today: string, nowIso: string): TransactionDraft {
  const { expense, month } = link;
  const due = billDueDate(expense, month);
  const occurred_at = month === today.slice(0, 7) ? nowIso : new Date(Number(due.slice(0, 4)), Number(due.slice(5, 7)) - 1, Number(due.slice(8, 10)), 12).toISOString();
  return { account_id: expense.account_id ?? fallbackAccountId, category_id: expense.category_id, amount_centavos: expense.amount_centavos, direction: 'out', merchant: expense.name, note: null, occurred_at };
}

export interface BillTaskPlan {
  /** Bill tasks for this month that don't exist yet. */
  create: Task[];
  /** Bill tasks to bring in line with Money: ticked or unticked to match the payment, or renamed to match the bill. */
  update: { task: Task; change: Partial<Task> }[];
}

/**
 * What to change so Tasks matches Money. `tasks` are the live tasks; `knownIds` are the ids of every task
 * row this device has seen, deleted ones included, so a bill task you deleted is not brought back.
 */
export function planBillTasks(input: {
  expenses: readonly FixedExpense[];
  transactions: readonly Transaction[];
  tasks: readonly Task[];
  knownIds: ReadonlySet<string>;
  today: string;
  nowIso: string;
  toLocalDate: (iso: string) => string;
}): BillTaskPlan {
  const { expenses, transactions, tasks, knownIds, today, nowIso, toLocalDate } = input;
  const current = today.slice(0, 7);
  const live = expenses.filter((e) => e.deleted_at === null);
  const byId = new Map(tasks.filter((t) => t.deleted_at === null).map((t) => [t.id, t]));
  const plan: BillTaskPlan = { create: [], update: [] };

  for (const expense of live) {
    const id = billTaskId(expense.id, current);
    if (byId.has(id) || knownIds.has(id)) continue;
    const due = billDueDate(expense, current);
    const payment = billPayment(expense.id, current, transactions, toLocalDate);
    plan.create.push({
      id, list_id: null, title: billTitle(expense), notes: null, due_date: due, due_time: null, remind_at: remindAt(due, null, 'at'),
      priority: 2, status: payment ? 'done' : 'todo', recurrence_rule: null, completed_at: payment ? payment.occurred_at : null,
      created_at: nowIso, updated_at: nowIso, deleted_at: null,
    });
  }

  for (const month of [current, addMonths(current, -1)]) {
    for (const expense of live) {
      const task = byId.get(billTaskId(expense.id, month));
      if (!task) continue;
      const payment = billPayment(expense.id, month, transactions, toLocalDate);
      const change: Partial<Task> = {};
      if (payment && task.status !== 'done') Object.assign(change, { status: 'done', completed_at: payment.occurred_at });
      if (!payment && task.status === 'done') Object.assign(change, { status: 'todo', completed_at: null });
      if (month === current && (change.status ?? task.status) === 'todo' && task.title !== billTitle(expense)) change.title = billTitle(expense);
      if (Object.keys(change).length > 0) plan.update.push({ task, change: { ...change, updated_at: nowIso } });
    }
  }
  return plan;
}

// ---- tasks with an amount ----

const AMOUNT = /(?:₱|\bphp\s?|\bp(?=\d{2}))\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?|\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s?(?:pesos?|php)\b/i;

/** The peso amount written in a task's title ("Buy dog food ₱450", "load P100", "rent 8,500 pesos"), in centavos. */
export function amountInTask(title: string): number | null {
  const m = AMOUNT.exec(title);
  if (!m) return null;
  const whole = (m[1] ?? m[3])!.replace(/,/g, '');
  const frac = (m[2] ?? m[4] ?? '').padEnd(2, '0');
  const centavos = Number(whole) * 100 + Number(frac);
  return centavos > 0 && Number.isSafeInteger(centavos) ? centavos : null;
}

/** The title without the amount, for the transaction's note: "Buy dog food ₱450" → "Buy dog food". */
export function taskWithoutAmount(title: string): string {
  return title.replace(AMOUNT, '').replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').trim() || title;
}

// ---- spending and the food log ----

const FOOD_CATEGORY = /\b(food|foods|groceries|grocery|dining|eating out|restaurants?|meals?|snacks?|drinks?|coffee)\b/i;

/** Money spent on food: confirmed, going out, in a category named like food ("Food", "Groceries", "Dining"). */
export function isFoodSpend(tx: Pick<Transaction, 'direction' | 'status' | 'category_id' | 'transfer_group_id' | 'deleted_at'>, categories: readonly { id: string; name: string }[]): boolean {
  if (tx.deleted_at !== null || tx.direction !== 'out' || tx.status !== 'confirmed' || tx.transfer_group_id !== null || !tx.category_id) return false;
  const category = categories.find((c) => c.id === tx.category_id);
  return !!category && FOOD_CATEGORY.test(category.name);
}

/** The category a meal's price goes under: one named "Food" first, else any food-like expense category. */
export function foodCategoryId(categories: readonly { id: string; name: string; kind: string; deleted_at?: string | null }[]): string | null {
  const live = categories.filter((c) => c.kind === 'expense' && !c.deleted_at);
  return (live.find((c) => c.name.trim().toLowerCase() === 'food') ?? live.find((c) => FOOD_CATEGORY.test(c.name)))?.id ?? null;
}

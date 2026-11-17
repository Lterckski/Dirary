/** Money in, money out and what was left over, month by month. */
import type { Transaction } from './money';

export interface MonthRecap {
  /** "YYYY-MM" */
  month: string;
  income: number;
  spent: number;
  /** income − spent. Negative when more went out than came in. */
  saved: number;
}

const counted = (t: Transaction) => t.deleted_at === null && t.status === 'confirmed' && t.transfer_group_id === null;
const shift = (month: string, by: number) => {
  const d = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Up to `count` months ending with the month of `today` ("YYYY-MM-DD"), oldest first, starting no earlier than
 * the first month with a confirmed transaction. Moves between your own accounts are left out; paying a fixed
 * expense counts as spending. Empty when nothing has been logged.
 */
export function monthlyRecap(transactions: readonly Transaction[], today: string, toLocalDate: (iso: string) => string, count = 6): MonthRecap[] {
  const current = today.slice(0, 7);
  const totals = new Map<string, { income: number; spent: number }>();
  let first: string | null = null;
  for (const t of transactions) {
    if (!counted(t)) continue;
    const month = toLocalDate(t.occurred_at).slice(0, 7);
    if (month > current) continue;
    if (first === null || month < first) first = month;
    const row = totals.get(month) ?? { income: 0, spent: 0 };
    if (t.direction === 'in') row.income += t.amount_centavos;
    else row.spent += t.amount_centavos;
    totals.set(month, row);
  }
  if (first === null) return [];
  const months: MonthRecap[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const month = shift(current, -i);
    if (month < first) continue;
    const { income, spent } = totals.get(month) ?? { income: 0, spent: 0 };
    months.push({ month, income, spent, saved: income - spent });
  }
  return months;
}

const NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "Nov" from "2026-11". Pass long for "November". */
export function monthName(month: string, long = false): string {
  const name = NAMES[Number(month.slice(5, 7)) - 1] ?? month;
  return long ? name : name.slice(0, 3);
}

/** One line about how the last finished month went, or how this one is going if it's the only one. */
export function recapLine(months: readonly MonthRecap[], formatPeso: (centavos: number) => string): string {
  const last = months.length >= 2 ? months[months.length - 2]! : null;
  if (!last) {
    const now = months[0];
    if (!now) return 'Your first recap appears once you log money in or out.';
    return now.saved >= 0 ? `So far this month, ${formatPeso(now.saved)} more came in than went out.` : `So far this month, ${formatPeso(-now.saved)} more went out than came in.`;
  }
  const name = monthName(last.month, true);
  const verdict = last.saved >= 0 ? `${name}: you kept ${formatPeso(last.saved)}.` : `${name}: ${formatPeso(-last.saved)} more went out than came in.`;
  const before = months.length >= 3 ? months[months.length - 3]! : null;
  if (!before) return verdict;
  const diff = last.saved - before.saved;
  if (diff === 0) return `${verdict} Same as ${monthName(before.month, true)}.`;
  return `${verdict} That's ${formatPeso(Math.abs(diff))} ${diff > 0 ? 'better' : 'worse'} than ${monthName(before.month, true)}.`;
}

/** Short peso amounts for tight spaces: ₱850, ₱4,370, ₱12.3k, −₱1.2k. Whole pesos only. */
export function formatPesoShort(centavos: number): string {
  const pesos = Math.round(Math.abs(centavos) / 100);
  const sign = centavos < 0 && pesos > 0 ? '−' : '';
  if (pesos >= 10000) return `${sign}₱${(Math.round(pesos / 100) / 10).toString()}k`;
  return `${sign}₱${pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

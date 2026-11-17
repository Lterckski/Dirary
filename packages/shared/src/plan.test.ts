import { describe, expect, it } from 'vitest';
import { formatPeso, type Transaction } from './money';
import { currentPlan, dueLabel, fixedThisMonth, safeToSpend, spendCoach, type FixedExpense, type MoneyPlan } from './plan';

const stamps = { created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', deleted_at: null };
const day = (iso: string) => iso.slice(0, 10);
const today = '2026-11-17'; // November has 30 days: 14 left, today included
const fx = (id: string, name: string, amount: number, due: number, p: Partial<FixedExpense> = {}): FixedExpense => ({ id, name, amount_centavos: amount, due_day: due, category_id: null, account_id: null, sort_order: 0, ...stamps, ...p });
let n = 0;
const tx = (p: Partial<Transaction>): Transaction => ({
  id: `t${n++}`, account_id: 'a', category_id: null, amount_centavos: 10000, direction: 'out', merchant: null, note: null,
  occurred_at: `${today}T04:00:00Z`, source: 'manual', status: 'confirmed', fingerprint: null, transfer_group_id: null, fixed_expense_id: null, ...stamps, ...p,
});
const plan = (budget: number | null, p: Partial<MoneyPlan> = {}): MoneyPlan => ({ id: 'p', monthly_budget_centavos: budget, ...stamps, ...p });
const fixed = [fx('rent', 'Rent', 350000, 5), fx('net', 'Internet', 129900, 20), fx('spot', 'Spotify', 14900, 28)];

describe('fixed expenses', () => {
  it('marks one paid only by a confirmed payment this month', () => {
    const s = fixedThisMonth(fixed, [
      tx({ fixed_expense_id: 'rent', amount_centavos: 350000, occurred_at: '2026-11-05T02:00:00Z' }),
      tx({ fixed_expense_id: 'net', occurred_at: '2026-10-20T02:00:00Z' }),          // last month
      tx({ fixed_expense_id: 'spot', status: 'needs_review' }),                        // not confirmed
    ], today, day);
    expect(s.items.map((i) => [i.expense.id, i.paid])).toEqual([['net', false], ['spot', false], ['rent', true]]);
    expect(s.total).toBe(494800);
    expect(s.paid).toBe(350000);
    expect(s.dueSoon.map((i) => i.expense.id)).toEqual(['net']);
  });
  it('treats a due day past the end of the month as the last day', () => {
    const s = fixedThisMonth([fx('x', 'X', 100, 31)], [], '2027-02-10', day);
    expect(s.items[0]!.dueDate).toBe('2027-02-28');
    expect(s.items[0]!.dueIn).toBe(18);
  });
  it('labels due dates', () => {
    const label = (due: number) => dueLabel(fixedThisMonth([fx('x', 'X', 100, due)], [], today, day).items[0]!);
    expect(label(17)).toBe('Due today');
    expect(label(18)).toBe('Due tomorrow');
    expect(label(20)).toBe('Due in 3 days');
    expect(label(28)).toBe('Due Nov 28');
    expect(label(16)).toBe('Was due 1 day ago');
    expect(label(5)).toBe('Was due 12 days ago');
  });
  it('ignores deleted expenses', () => {
    expect(fixedThisMonth([fx('x', 'X', 100, 1, { deleted_at: 'z' })], [], today, day).items).toEqual([]);
  });
});

describe('safe to spend', () => {
  it('spreads what is left after fixed expenses and earlier spending over the days left', () => {
    const s = safeToSpend(plan(1500000), fixed, [
      tx({ amount_centavos: 250950, occurred_at: '2026-11-10T02:00:00Z' }),             // earlier this month
      tx({ amount_centavos: 13000 }),                                                    // today
      tx({ amount_centavos: 350000, fixed_expense_id: 'rent', occurred_at: '2026-11-05T02:00:00Z' }), // set aside already
      tx({ amount_centavos: 99999, transfer_group_id: 'g' }),                            // a transfer
      tx({ amount_centavos: 99999, status: 'needs_review' }),                            // not confirmed
      tx({ amount_centavos: 99999, direction: 'in' }),
      tx({ amount_centavos: 99999, occurred_at: '2026-10-30T02:00:00Z' }),              // last month
    ], today, day);
    // 15,000 − 4,948 − 2,509.50 = 7,542.50 over 14 days = 538.75
    expect(s).toEqual({ ready: true, dailyLimit: 53875, spentToday: 13000, safeToday: 40875, daysLeft: 14, leftThisMonth: 741250 });
  });
  it('goes negative when today is overspent, and when the month is already overspent', () => {
    expect(safeToSpend(plan(1500000), fixed, [tx({ amount_centavos: 2000000 })], today, day).safeToday).toBeLessThan(0);
    const s = safeToSpend(plan(400000), fixed, [], today, day);
    expect(s.dailyLimit).toBe(0);
    expect(s.safeToday).toBe(-94800);
  });
  it('is not ready without a budget but still reports today', () => {
    const s = safeToSpend(null, fixed, [tx({ amount_centavos: 5000 })], today, day);
    expect(s.ready).toBe(false);
    expect(s.spentToday).toBe(5000);
    expect(safeToSpend(plan(null), [], [], today, day).ready).toBe(false);
  });
  it('counts the last day of the month as one day left', () => {
    expect(safeToSpend(plan(300000), [], [], '2026-11-30', day)).toMatchObject({ daysLeft: 1, dailyLimit: 300000 });
  });
  it('uses the most recently changed plan', () => {
    expect(currentPlan([plan(1, { id: 'a' }), plan(2, { id: 'b', updated_at: '2026-11-09T00:00:00Z' }), plan(3, { id: 'c', updated_at: '2026-11-10T00:00:00Z', deleted_at: 'z' })])?.id).toBe('b');
    expect(currentPlan([])).toBeNull();
  });
});

describe('Ink on the safe-to-spend card', () => {
  const none = fixedThisMonth([], [], today, day);
  it('warns about a late bill first, then overspending, then a bill due soon', () => {
    const late = fixedThisMonth(fixed, [], today, day);
    expect(spendCoach(safeToSpend(plan(1500000), fixed, [], today, day), late, formatPeso)).toEqual({ mood: 'worried', line: 'Rent (₱3,500) was due 12 days ago.' });
    expect(spendCoach(safeToSpend(plan(1500000), [], [tx({ amount_centavos: 200000 })], today, day), none, formatPeso).mood).toBe('worried');
    const soon = fixedThisMonth(fixed, [tx({ fixed_expense_id: 'rent' })], today, day);
    expect(spendCoach(safeToSpend(plan(1500000), fixed, [], today, day), soon, formatPeso)).toEqual({ mood: 'coach', line: 'Internet (₱1,299) is due in 3 days.' });
  });
  it('asks for a budget when there is none', () => {
    expect(spendCoach(safeToSpend(null, [], [], today, day), none, formatPeso).mood).toBe('coach');
  });
});

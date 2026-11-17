import { describe, expect, it } from 'vitest';
import { formatPeso, type Transaction } from './money';
import { formatPesoShort, monthName, monthlyRecap, recapLine } from './recap';

const stamps = { created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', deleted_at: null };
const day = (iso: string) => iso.slice(0, 10);
let n = 0;
const tx = (occurred: string, amount: number, direction: 'in' | 'out' = 'out', p: Partial<Transaction> = {}): Transaction => ({
  id: `t${n++}`, account_id: 'a', category_id: null, amount_centavos: amount, direction, merchant: null, note: null,
  occurred_at: `${occurred}T04:00:00Z`, source: 'manual', status: 'confirmed', fingerprint: null, transfer_group_id: null, fixed_expense_id: null, ...stamps, ...p,
});

describe('monthly recap', () => {
  it('totals each month from the first one with activity, oldest first', () => {
    const months = monthlyRecap([
      tx('2026-09-03', 500000, 'in'), tx('2026-09-10', 320000),
      tx('2026-11-01', 800000, 'in'), tx('2026-11-05', 350000, 'out', { fixed_expense_id: 'rent' }), tx('2026-11-16', 13000),
    ], '2026-11-17', day);
    expect(months).toEqual([
      { month: '2026-09', income: 500000, spent: 320000, saved: 180000 },
      { month: '2026-10', income: 0, spent: 0, saved: 0 },
      { month: '2026-11', income: 800000, spent: 363000, saved: 437000 },
    ]);
  });
  it('leaves out transfers, unconfirmed, deleted and future transactions', () => {
    expect(monthlyRecap([
      tx('2026-11-02', 99, 'out', { transfer_group_id: 'g' }), tx('2026-11-02', 99, 'in', { transfer_group_id: 'g' }),
      tx('2026-11-03', 99, 'out', { status: 'needs_review' }), tx('2026-11-03', 99, 'out', { deleted_at: 'x' }),
      tx('2026-12-01', 99), tx('2026-11-04', 1000),
    ], '2026-11-17', day)).toEqual([{ month: '2026-11', income: 0, spent: 1000, saved: -1000 }]);
  });
  it('keeps only the last six months and crosses year ends', () => {
    const months = monthlyRecap([tx('2026-01-05', 100), tx('2027-02-05', 100)], '2027-02-10', day);
    expect(months.map((m) => m.month)).toEqual(['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02']);
  });
  it('is empty with nothing logged', () => {
    expect(monthlyRecap([], '2026-11-17', day)).toEqual([]);
  });
  it('names months', () => {
    expect(monthName('2026-11')).toBe('Nov');
    expect(monthName('2026-01', true)).toBe('January');
  });
});

describe('recap line', () => {
  const m = (month: string, saved: number) => ({ month, income: Math.max(saved, 0), spent: Math.max(-saved, 0), saved });
  it('talks about this month when it is the only one', () => {
    expect(recapLine([], formatPeso)).toBe('Your first recap appears once you log money in or out.');
    expect(recapLine([m('2026-11', 5000)], formatPeso)).toBe('So far this month, ₱50 more came in than went out.');
    expect(recapLine([m('2026-11', -5000)], formatPeso)).toBe('So far this month, ₱50 more went out than came in.');
  });
  it('reports the last finished month and compares it with the one before', () => {
    expect(recapLine([m('2026-10', 180000), m('2026-11', 0)], formatPeso)).toBe('October: you kept ₱1,800.');
    expect(recapLine([m('2026-09', 100000), m('2026-10', 180000), m('2026-11', 0)], formatPeso)).toBe("October: you kept ₱1,800. That's ₱800 better than September.");
    expect(recapLine([m('2026-09', 100000), m('2026-10', -20000), m('2026-11', 0)], formatPeso)).toBe("October: ₱200 more went out than came in. That's ₱1,200 worse than September.");
  });
});

describe('short amounts', () => {
  it('rounds to whole pesos and shortens big ones', () => {
    expect(formatPesoShort(85049)).toBe('₱850');
    expect(formatPesoShort(437000)).toBe('₱4,370');
    expect(formatPesoShort(1234567)).toBe('₱12.3k');
    expect(formatPesoShort(-120000)).toBe('−₱1,200');
    expect(formatPesoShort(-1500000)).toBe('−₱15k');
    expect(formatPesoShort(-20)).toBe('₱0');
  });
});

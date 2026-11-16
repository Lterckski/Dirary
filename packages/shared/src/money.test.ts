import { describe, expect, it } from 'vitest';
import { parseNotification } from './capture';
import {
  accountBalance, budgetCoach, findTransferPairs, formatPeso, monthSummary, parseAmount, parseMoneyQuickAdd, spentOn,
  type Account, type Category, type Transaction,
} from './money';

const stamps = { created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', deleted_at: null };
const acct = (id: string, name: string, institution: Account['institution'], opening = 0): Account => ({ id, name, institution, opening_balance_centavos: opening, sort_order: 0, ...stamps });
const cat = (id: string, name: string, limit: number | null = null, kind: Category['kind'] = 'expense'): Category => ({ id, name, kind, color: 'inkBlue', monthly_limit_centavos: limit, sort_order: 0, ...stamps });
let n = 0;
const tx = (p: Partial<Transaction>): Transaction => ({
  id: `t${n++}`, account_id: 'gcash', category_id: null, amount_centavos: 10000, direction: 'out', merchant: null, note: null,
  occurred_at: '2026-11-17T04:00:00Z', source: 'manual', status: 'confirmed', fingerprint: null, transfer_group_id: null, ...stamps, ...p,
});
const day = (iso: string) => iso.slice(0, 10);
const accounts = [acct('gcash', 'GCash', 'gcash', 50000), acct('gotyme', 'GoTyme', 'gotyme'), acct('cash', 'Cash', 'cash')];
const categories = [cat('food', 'Food', 300000), cat('transport', 'Transport'), cat('allow', 'Allowance', null, 'income')];

describe('amounts', () => {
  it('formats pesos', () => {
    expect(formatPeso(124000)).toBe('₱1,240');
    expect(formatPeso(124050)).toBe('₱1,240.50');
    expect(formatPeso(-5005)).toBe('−₱50.05');
    expect(formatPeso(5000, { sign: true })).toBe('+₱50');
  });
  it('parses amounts into centavos without rounding errors', () => {
    expect(parseAmount('1,234.5')).toBe(123450);
    expect(parseAmount('₱250')).toBe(25000);
    expect(parseAmount('0.1')).toBe(10);
    expect(parseAmount('19.99')).toBe(1999);
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('0')).toBeNull();
    expect(parseAmount('1.234')).toBeNull();
  });
});

describe('balances and summaries', () => {
  const txs = [
    tx({ amount_centavos: 25000, category_id: 'food' }),
    tx({ amount_centavos: 8000, category_id: 'transport' }),
    tx({ amount_centavos: 500000, direction: 'in', category_id: 'allow' }),
    tx({ amount_centavos: 99900, status: 'needs_review' }),
    tx({ amount_centavos: 70000, deleted_at: 'x' }),
    tx({ amount_centavos: 100000, transfer_group_id: '00000000-0000-4000-8000-000000000001' }),
    tx({ amount_centavos: 100000, direction: 'in', account_id: 'gotyme', transfer_group_id: '00000000-0000-4000-8000-000000000001' }),
    tx({ amount_centavos: 4000, occurred_at: '2026-10-30T04:00:00Z' }),
  ];
  it('balance counts confirmed transactions, including transfers, and ignores unreviewed and deleted ones', () => {
    expect(accountBalance(accounts[0]!, txs)).toBe(50000 - 25000 - 8000 + 500000 - 100000 - 4000);
    expect(accountBalance(accounts[1]!, txs)).toBe(100000);
  });
  it('month summary leaves out transfers and other months', () => {
    const s = monthSummary(txs, categories, '2026-11', day);
    expect([s.spent, s.income, s.uncategorized]).toEqual([33000, 500000, 0]);
    expect(s.categories.map((r) => [r.category.name, r.spent, r.left])).toEqual([['Food', 25000, 275000], ['Transport', 8000, null]]);
    expect(spentOn(txs, '2026-11-17', day)).toBe(33000);
  });
  it('coach reacts to over-budget, pace and a clean month', () => {
    const s = monthSummary(txs, categories, '2026-11', day);
    expect(budgetCoach(s, 17, 30)).toEqual({ mood: 'happy', line: '₱2,750 left, 13 days to go.' });
    const over = monthSummary([tx({ amount_centavos: 350000, category_id: 'food' })], categories, '2026-11', day);
    expect(budgetCoach(over, 17, 30)).toEqual({ mood: 'worried', line: 'Food is over by ₱500.' });
    const fast = monthSummary([tx({ amount_centavos: 200000, category_id: 'food' })], categories, '2026-11', day);
    expect(budgetCoach(fast, 5, 30).mood).toBe('worried');
    expect(budgetCoach(monthSummary([], [], '2026-11', day), 5, 30).mood).toBe('sleepy');
  });
});

describe('transfers', () => {
  it('pairs an out and an in of the same amount on different accounts within ten minutes', () => {
    const out = tx({ amount_centavos: 50000, account_id: 'gotyme', occurred_at: '2026-11-17T04:00:00Z' });
    const into = tx({ amount_centavos: 50000, direction: 'in', account_id: 'gcash', occurred_at: '2026-11-17T04:03:00Z' });
    const late = tx({ amount_centavos: 50000, direction: 'in', account_id: 'gcash', occurred_at: '2026-11-17T06:00:00Z' });
    const same = tx({ amount_centavos: 50000, direction: 'in', account_id: 'gotyme', occurred_at: '2026-11-17T04:01:00Z' });
    expect(findTransferPairs([out, late, same, into])).toEqual([{ out, into }]);
  });
});

describe('money quick add', () => {
  it('reads amount, merchant, category and account', () => {
    expect(parseMoneyQuickAdd('250 jollibee #food @gcash', categories, accounts)).toEqual({ amount_centavos: 25000, direction: 'out', merchant: 'Jollibee', category_id: 'food', account_id: 'gcash' });
    expect(parseMoneyQuickAdd('+5000 from mama #allow @gotyme', categories, accounts)).toMatchObject({ amount_centavos: 500000, direction: 'in', merchant: 'From mama', account_id: 'gotyme' });
    expect(parseMoneyQuickAdd('grab 89.50', categories, accounts)).toMatchObject({ amount_centavos: 8950, merchant: 'Grab', category_id: null });
    expect(parseMoneyQuickAdd('1000 #allowance', categories, accounts).direction).toBe('in');
    expect(parseMoneyQuickAdd('lunch', categories, accounts).amount_centavos).toBeNull();
  });
});

describe('notification reader (best effort, not yet checked against real notifications)', () => {
  const at = Date.parse('2026-11-17T04:00:00Z');
  const note = (packageName: string, text: string, title = '') => ({ packageName, title, text, postedAt: at });
  it('reads a clear payment and a clear receipt', () => {
    expect(parseNotification(note('com.globe.gcash.android', 'You have paid PHP 250.00 to JOLLIBEE on 11-17-2026. Ref. No. 1234567890123.'))).toMatchObject(
      { institution: 'gcash', amount_centavos: 25000, direction: 'out', merchant: 'JOLLIBEE', fingerprint: 'gcash|ref|1234567890123' });
    expect(parseNotification(note('ph.gotyme.app', 'You received ₱5,000.00 from JUAN D.'))).toMatchObject({ institution: 'gotyme', amount_centavos: 500000, direction: 'in' });
  });
  it('ignores other apps, OTPs, promos and anything without a clear amount or direction', () => {
    expect(parseNotification(note('com.whatsapp', 'You paid PHP 250.00 to X'))).toBeNull();
    expect(parseNotification(note('com.globe.gcash.android', 'Your OTP is 123456. Never share it.'))).toBeNull();
    expect(parseNotification(note('com.globe.gcash.android', 'Get PHP 50.00 cashback offer when you pay bills!'))).toBeNull();
    expect(parseNotification(note('com.securitybank.app', 'Your balance is PHP 1,000.00'))).toBeNull();
    expect(parseNotification(note('com.globe.gcash.android', 'Payment successful'))).toBeNull();
  });
  it('gives repeats within two minutes the same fingerprint', () => {
    const a = parseNotification(note('ph.gotyme.app', 'You paid ₱120.00 at 7-ELEVEN'));
    const b = parseNotification({ ...note('ph.gotyme.app', 'You paid ₱120.00 at 7-ELEVEN'), postedAt: at + 30_000 });
    expect(a?.fingerprint).toBe(b?.fingerprint);
  });
});

import { guessMapping, parseCsv, parseStatementDate, rowsToTransactions } from './importCsv';

describe('statement import', () => {
  it('parses CSV with quotes, commas and blank lines', () => {
    expect(parseCsv('Date,Description,Amount\r\n"11/17/2026","JOLLIBEE, IT PARK","-250.00"\n\n11/18/2026,"He said ""hi""",1000\n')).toEqual([
      ['Date', 'Description', 'Amount'], ['11/17/2026', 'JOLLIBEE, IT PARK', '-250.00'], ['11/18/2026', 'He said "hi"', '1000'],
    ]);
  });
  it('reads common date formats', () => {
    const d = (t: string, df = false) => { const v = parseStatementDate(t, df); return v ? [v.getFullYear(), v.getMonth() + 1, v.getDate()] : null; };
    expect(d('2026-11-17 14:03')).toEqual([2026, 11, 17]);
    expect(d('11/17/2026')).toEqual([2026, 11, 17]);
    expect(d('17/11/2026')).toEqual([2026, 11, 17]);
    expect(d('05/06/2026', true)).toEqual([2026, 6, 5]);
    expect(d('17-Nov-2026')).toEqual([2026, 11, 17]);
    expect(d('Nov 17, 2026')).toEqual([2026, 11, 17]);
    expect(d('31/02/2026')).toBeNull();
    expect(d('soon')).toBeNull();
  });
  it('maps rows, numbers identical lines, and counts unreadable ones', () => {
    const rows = parseCsv('Date,Details,Debit,Credit\n11/17/2026,GRAB,89.50,\n11/17/2026,GRAB,89.50,\n11/18/2026,SALARY,,"12,000.00"\nTotal,,,\n');
    const mapping = guessMapping(rows[0]!);
    expect(mapping).toMatchObject({ date: 0, description: 1, debit: 2, credit: 3 });
    const { ok, skipped } = rowsToTransactions(rows.slice(1), { date: 0, description: 1, debit: 2, credit: 3 }, 'acc');
    expect(skipped).toBe(1);
    expect(ok.map((r) => [r.direction, r.amount_centavos, r.merchant])).toEqual([['out', 8950, 'GRAB'], ['out', 8950, 'GRAB'], ['in', 1200000, 'SALARY']]);
    expect(ok[0]!.fingerprint).not.toBe(ok[1]!.fingerprint);
  });
  it('reads a single signed amount column', () => {
    const { ok } = rowsToTransactions([['2026-11-17', 'Coffee', '(120.00)'], ['2026-11-17', 'Refund', '120.00']], { date: 0, description: 1, amount: 2 }, 'acc');
    expect(ok.map((r) => r.direction)).toEqual(['out', 'in']);
  });
});

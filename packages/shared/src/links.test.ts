import { describe, expect, it } from 'vitest';
import { amountInTask, billOf, billPaymentDraft, billTaskId, billTitle, planBillTasks, taskWithoutAmount } from './links';
import type { Transaction } from './money';
import type { FixedExpense } from './plan';
import { Task } from './tasks';

const stamps = { created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', deleted_at: null };
const day = (iso: string) => iso.slice(0, 10);
const today = '2026-11-17';
const nowIso = '2026-11-17T09:00:00.000Z';
const RENT = '11111111-1111-4111-8111-111111111111';
const NET = '22222222-2222-4222-8222-222222222222';
const fx = (id: string, name: string, amount: number, due: number): FixedExpense => ({ id, name, amount_centavos: amount, due_day: due, category_id: null, account_id: 'acct', sort_order: 0, ...stamps });
const fixed = [fx(RENT, 'Rent', 850000, 5), fx(NET, 'Internet', 129900, 20)];
let n = 0;
const tx = (p: Partial<Transaction>): Transaction => ({
  id: `t${n++}`, account_id: 'acct', category_id: null, amount_centavos: 100, direction: 'out', merchant: null, note: null,
  occurred_at: '2026-11-05T02:00:00Z', source: 'manual', status: 'confirmed', fingerprint: null, transfer_group_id: null, fixed_expense_id: null, ...stamps, ...p,
});
const plan = (p: Partial<Parameters<typeof planBillTasks>[0]>) =>
  planBillTasks({ expenses: fixed, transactions: [], tasks: [], knownIds: new Set(), today, nowIso, toLocalDate: day, ...p });

describe('bill task ids', () => {
  it('are valid UUIDs, the same every time, and differ by bill and month', () => {
    const id = billTaskId(RENT, '2026-11');
    expect(Task.shape.id.safeParse(id).success).toBe(true);
    expect(billTaskId(RENT, '2026-11')).toBe(id);
    expect(billTaskId(RENT, '2026-12')).not.toBe(id);
    expect(billTaskId(NET, '2026-11')).not.toBe(id);
  });
  it('lead back to their bill and month', () => {
    expect(billOf({ id: billTaskId(NET, '2026-10') }, fixed, today)).toMatchObject({ expense: { id: NET }, month: '2026-10' });
    expect(billOf({ id: 'something-else' }, fixed, today)).toBeNull();
  });
});

describe('planBillTasks', () => {
  it("creates this month's bill tasks on their due day with a morning reminder", () => {
    const { create, update } = plan({});
    expect(update).toEqual([]);
    expect(create.map((t) => [t.title, t.due_date, t.status])).toEqual([['Pay Rent · ₱8,500', '2026-11-05', 'todo'], ['Pay Internet · ₱1,299', '2026-11-20', 'todo']]);
    expect(create.every((t) => Task.safeParse(t).success)).toBe(true);
    expect(create[1]!.remind_at).not.toBeNull();
  });
  it('creates a bill already paid this month as done', () => {
    const { create } = plan({ transactions: [tx({ fixed_expense_id: RENT })] });
    expect(create.find((t) => t.due_date === '2026-11-05')!.status).toBe('done');
  });
  it('never brings back a bill task that was deleted', () => {
    expect(plan({ knownIds: new Set([billTaskId(RENT, '2026-11')]) }).create.map((t) => t.title)).toEqual(['Pay Internet · ₱1,299']);
  });
  it('ticks the task when the bill is paid in Money, and unticks it when the payment goes', () => {
    const [rent, net] = plan({}).create;
    const paid = plan({ tasks: [rent!, net!], transactions: [tx({ fixed_expense_id: RENT })] });
    expect(paid.update).toEqual([{ task: rent, change: { status: 'done', completed_at: '2026-11-05T02:00:00Z', updated_at: nowIso } }]);
    const unpaid = plan({ tasks: [{ ...rent!, status: 'done' }, net!] });
    expect(unpaid.update[0]!.change).toMatchObject({ status: 'todo', completed_at: null });
  });
  it("follows a renamed bill but leaves last month's payments to last month", () => {
    const [rent] = plan({}).create;
    const renamed = plan({ tasks: [rent!], expenses: [{ ...fixed[0]!, name: 'Apartment' }, fixed[1]!] });
    expect(renamed.update[0]!.change.title).toBe('Pay Apartment · ₱8,500');
    const lastMonth = { ...rent!, id: billTaskId(RENT, '2026-10'), status: 'todo' as const };
    const s = plan({ tasks: [lastMonth], knownIds: new Set([billTaskId(RENT, '2026-11'), billTaskId(NET, '2026-11')]), transactions: [tx({ fixed_expense_id: RENT })] });
    expect(s.update).toEqual([]); // November's payment doesn't pay October's bill
  });
});

describe('billPaymentDraft', () => {
  it("pays this month's bill now and an older one on its due day", () => {
    expect(billPaymentDraft({ expense: fixed[0]!, month: '2026-11' }, null, today, nowIso)).toMatchObject({ amount_centavos: 850000, account_id: 'acct', merchant: 'Rent', occurred_at: nowIso });
    expect(day(billPaymentDraft({ expense: fixed[1]!, month: '2026-10' }, null, today, nowIso).occurred_at)).toBe('2026-10-20');
  });
  it('uses the bill title helper', () => {
    expect(billTitle({ name: 'Spotify', amount_centavos: 14900 })).toBe('Pay Spotify · ₱149');
  });
});

describe('amountInTask', () => {
  it.each([
    ['Buy dog food ₱450', 45000],
    ['Load ₱ 99.50', 9950],
    ['pay tuition PHP 12,500 tomorrow', 1250000],
    ['grab P150', 15000],
    ['rent 8,500 pesos', 850000],
    ['Give Mom 500php', 50000],
  ])('reads %s', (title, centavos) => expect(amountInTask(title)).toBe(centavos));
  it.each(['Read chapter 3', 'Finish P2 lab', 'Gym 6am', 'Buy 2 eggs'])('ignores %s', (title) => expect(amountInTask(title)).toBeNull());
  it('takes the amount out for the note', () => {
    expect(taskWithoutAmount('Buy dog food ₱450')).toBe('Buy dog food');
    expect(taskWithoutAmount('pay tuition PHP 12,500 tomorrow')).toBe('pay tuition tomorrow');
  });
});

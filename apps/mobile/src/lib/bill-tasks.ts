/** Bill tasks on the phone: keeps them in step with Money in the local database (rules in packages/shared/src/links.ts). */
import * as Crypto from 'expo-crypto';
import { TASKS_TABLE, TRANSACTIONS_TABLE, billOf, billPayment, billPaymentDraft, localDate, planBillTasks, reopenTask, type Task, type Transaction } from '@dirary/shared';

import { readAccounts, readAllTaskIds, readFixedExpenses, readTasks, readTransactions, saveLocal } from './db';

const toLocal = (iso: string) => localDate(new Date(iso));

/** Creates this month's bill tasks and ticks or unticks them to match the payments. Returns how many rows changed. */
export async function reconcileBillTasks(): Promise<number> {
  const [expenses, transactions, tasks, knownIds] = await Promise.all([readFixedExpenses(), readTransactions(), readTasks(), readAllTaskIds()]);
  if (expenses.length === 0) return 0;
  const plan = planBillTasks({ expenses, transactions, tasks, knownIds, today: localDate(), nowIso: new Date().toISOString(), toLocalDate: toLocal });
  for (const task of plan.create) await saveLocal(TASKS_TABLE, task);
  for (const { task, change } of plan.update) await saveLocal(TASKS_TABLE, { ...task, ...change });
  return plan.create.length + plan.update.length;
}

/** If the task is a bill, ticks or unticks it by logging or removing its payment, and returns true. */
export async function toggleBillTask(task: Task): Promise<boolean> {
  const today = localDate();
  const link = billOf(task, await readFixedExpenses(), today);
  if (!link) return false;
  const nowIso = new Date().toISOString();
  if (task.status === 'done') {
    const payment = billPayment(link.expense.id, link.month, await readTransactions(), toLocal);
    if (payment) await saveLocal(TRANSACTIONS_TABLE, { ...payment, deleted_at: nowIso, updated_at: nowIso });
    await saveLocal(TASKS_TABLE, { ...task, ...reopenTask(nowIso) });
    return true;
  }
  const accounts = await readAccounts();
  const row: Transaction = {
    id: Crypto.randomUUID(), ...billPaymentDraft(link, accounts[0]?.id ?? null, today, nowIso), source: 'manual', status: 'confirmed',
    fingerprint: null, transfer_group_id: null, fixed_expense_id: link.expense.id, created_at: nowIso, updated_at: nowIso, deleted_at: null,
  };
  await saveLocal(TRANSACTIONS_TABLE, row);
  await saveLocal(TASKS_TABLE, { ...task, status: 'done', completed_at: nowIso, updated_at: nowIso });
  return true;
}

/** Whether a task stands for a bill. */
export async function isBillTask(task: Task): Promise<boolean> {
  return billOf(task, await readFixedExpenses(), localDate()) !== null;
}

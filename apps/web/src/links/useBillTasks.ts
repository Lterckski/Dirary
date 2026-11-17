import { useEffect, useRef } from 'react';
import { billOf, billPayment, billPaymentDraft, localDate, planBillTasks, reopenTask, type Task } from '@dirary/shared';
import type { MoneyStore } from '../money/useMoney';
import type { TasksStore } from '../tasks/useTasks';

const toLocal = (iso: string) => localDate(new Date(iso));

/**
 * Keeps bill tasks in step with Money while a screen that shows either is open: creates this month's bill
 * tasks and ticks or unticks them to match the payments. Returns `toggle`, which a screen uses in place of
 * toggleTask so that ticking a bill task logs (or removes) its payment.
 */
export function useBillTasks(tasks: TasksStore, money: MoneyStore) {
  const asked = useRef(new Set<string>());
  const ready = !tasks.loading && !money.loading && !tasks.error && !money.error;

  useEffect(() => {
    if (!ready) return;
    const plan = planBillTasks({
      expenses: money.fixed, transactions: money.transactions, tasks: tasks.tasks, knownIds: asked.current,
      today: localDate(), nowIso: new Date().toISOString(), toLocalDate: toLocal,
    });
    for (const { task, change } of plan.update) tasks.updateTask(task.id, change);
    if (plan.create.length > 0) {
      for (const t of plan.create) asked.current.add(t.id); // ask the database once per bill and month
      tasks.addBillTasks(plan.create);
    }
  }, [ready, money.fixed, money.transactions, tasks.tasks, tasks.updateTask, tasks.addBillTasks]);

  const toggle = (task: Task) => {
    const today = localDate();
    const link = billOf(task, money.fixed, today);
    if (!link) return tasks.toggleTask(task);
    if (task.status === 'done') {
      const payment = billPayment(link.expense.id, link.month, money.transactions, toLocal);
      if (payment) money.removeTransaction(payment.id);
      return tasks.updateTask(task.id, reopenTask(new Date().toISOString()));
    }
    const nowIso = new Date().toISOString();
    money.payBill(billPaymentDraft(link, money.accounts[0]?.id ?? null, today, nowIso), link.expense.id);
    return tasks.updateTask(task.id, { status: 'done', completed_at: nowIso });
  };

  return { toggle, isBill: (task: Task) => billOf(task, money.fixed, localDate()) !== null };
}

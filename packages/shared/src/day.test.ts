import { describe, expect, it } from 'vitest';
import { dayCoach, dayComplete, dayWins, greeting, mealStreak, topTasks, weekCoach, weekLabel, weekReview, type DayInput } from './day';
import { dayTotals, type FoodLog, type HealthGoals } from './health';
import { formatPeso, type Category, type Transaction } from './money';
import { fixedThisMonth, safeToSpend, type FixedExpense, type MoneyPlan } from './plan';
import { todayView } from './taskViews';
import type { Task } from './tasks';
import { planText, type Routine, type WorkoutSession } from './workouts';

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const st = { created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', deleted_at: null };
const TODAY = '2026-11-17'; // Tuesday
const local = (iso: string) => iso.slice(0, 10);
const task = (p: Partial<Task>): Task => ({ id: uuid(), list_id: null, title: 'A task', notes: null, due_date: TODAY, due_time: null, remind_at: null, priority: 0, status: 'todo', recurrence_rule: null, completed_at: null, ...st, ...p });
const tx = (p: Partial<Transaction>): Transaction => ({
  id: uuid(), account_id: 'acct', category_id: null, amount_centavos: 10000, direction: 'out', merchant: null, note: null,
  occurred_at: `${TODAY}T02:00:00Z`, source: 'manual', status: 'confirmed', fingerprint: null, transfer_group_id: null, fixed_expense_id: null, ...st, ...p,
});
const log = (p: Partial<FoodLog>): FoodLog => ({ id: uuid(), food_id: null, name: 'Rice', meal: 'lunch', grams: 100, kcal: 400, protein_g: 30, eaten_on: TODAY, ...st, ...p });
const goals: HealthGoals = { id: uuid(), kcal_target: 2000, protein_target_g: 120, water_glasses: 8, ...st };
const plan: MoneyPlan = { id: uuid(), monthly_budget_centavos: 3000000, ...st };
const rent: FixedExpense = { id: uuid(), name: 'Rent', amount_centavos: 850000, due_day: 28, category_id: null, account_id: 'acct', sort_order: 0, ...st };

function input(p: { tasks?: Task[]; txs?: Transaction[]; logs?: FoodLog[]; goals?: HealthGoals | null; workout?: DayInput['workout']; hour?: number; fixed?: FixedExpense[]; plan?: MoneyPlan | null }): DayInput {
  const txs = p.txs ?? [];
  const fixed = p.fixed ?? [rent];
  return {
    tasks: todayView(p.tasks ?? [], TODAY, local),
    safe: safeToSpend(p.plan === undefined ? plan : p.plan, fixed, txs, TODAY, local),
    fixed: fixedThisMonth(fixed, txs, TODAY, local),
    food: dayTotals(p.logs ?? [], TODAY),
    goals: p.goals === undefined ? goals : p.goals,
    workout: p.workout ?? { name: 'Push day', done: false, started: false },
    hour: p.hour ?? 13,
  };
}

describe('dayWins and dayComplete', () => {
  it('scores tasks, workout, protein and spending', () => {
    const wins = dayWins(input({ tasks: [task({}), task({ status: 'done', completed_at: `${TODAY}T03:00:00Z` })] }), formatPeso);
    expect(wins.map((w) => [w.key, w.value, w.applies, w.done])).toEqual([
      ['tasks', '1 of 2', true, false],
      ['workout', 'Push day', true, false],
      ['food', '0 of 120 g', true, false],
      ['money', expect.stringContaining('left'), true, true],
    ]);
    expect(dayComplete(wins)).toBe(false);
  });

  it('is complete when everything that applies is done', () => {
    const done = input({
      tasks: [task({ status: 'done', completed_at: `${TODAY}T03:00:00Z` })],
      logs: [log({ protein_g: 130 })],
      workout: { name: 'Push day', done: true, started: true },
    });
    expect(dayComplete(dayWins(done, formatPeso))).toBe(true);
    // Overspending today spoils it.
    const over = { ...done, safe: safeToSpend(plan, [rent], [tx({ amount_centavos: 5000000 })], TODAY, local) };
    expect(dayComplete(dayWins(over, formatPeso))).toBe(false);
  });

  it('is never complete on a day with nothing to win', () => {
    expect(dayComplete(dayWins(input({ workout: { name: null, done: false, started: false }, goals: null }), formatPeso))).toBe(false);
  });
});

describe('dayCoach', () => {
  it('puts problems first', () => {
    const late = { ...rent, due_day: 10 };
    expect(dayCoach(input({ fixed: [late], tasks: [task({ due_date: '2026-11-15' })] }), formatPeso)).toEqual({ mood: 'worried', line: 'Rent (₱8,500) was due 7 days ago.' });
    expect(dayCoach(input({ tasks: [task({ due_date: '2026-11-15' })] }), formatPeso).line).toBe('1 overdue task. Clear that one first?');
    expect(dayCoach(input({ txs: [tx({ amount_centavos: 5000000 })] }), formatPeso).mood).toBe('worried');
  });

  it('sums up the morning', () => {
    const c = dayCoach(input({ tasks: [task({}), task({})], hour: 8, plan: null }), formatPeso);
    expect(c).toEqual({ mood: 'coach', line: 'Today: 2 tasks and Push day.' });
    expect(dayCoach(input({ tasks: [task({})], hour: 8 }), formatPeso).line).toMatch(/^Today: 1 task, Push day and ₱[\d,.]+ to spend\.$/);
  });

  it('nudges the workout in the evening and protein in the afternoon', () => {
    expect(dayCoach(input({ hour: 18 }), formatPeso).line).toBe('Push day is still on for today.');
    expect(dayCoach(input({ hour: 16, workout: { name: null, done: false, started: false }, logs: [log({})] }), formatPeso).line).toBe('90 g of protein to go today.');
  });

  it('cheers a finished day and dozes on an empty one', () => {
    expect(dayCoach(input({ logs: [log({ protein_g: 130 })], workout: { name: 'Push day', done: true, started: true } }), formatPeso).mood).toBe('cheer');
    expect(dayCoach(input({ workout: { name: null, done: false, started: false }, goals: null }), formatPeso).mood).toBe('sleepy');
  });

  it('greets by the hour', () => {
    expect([2, 8, 13, 20].map(greeting)).toEqual(['Still up', 'Good morning', 'Good afternoon', 'Good evening']);
  });
});

describe('topTasks', () => {
  it('takes overdue first, then today, at most three', () => {
    const old = task({ title: 'Old', due_date: '2026-11-10' });
    const view = todayView([task({ title: 'B', due_time: '15:00' }), task({ title: 'A', due_time: '09:00' }), old, task({ title: 'C' })], TODAY, local);
    expect(topTasks(view).map((t) => t.title)).toEqual(['Old', 'A', 'B']);
  });
});

describe('weekly review', () => {
  const food: Category = { id: uuid(), name: 'Food', kind: 'expense', color: 'amber', monthly_limit_centavos: null, sort_order: 0, ...st };
  const push: Routine = { id: uuid(), name: 'Push day', plan: planText([{ exercise_id: uuid(), sets: 3, reps: 8 }]), weekdays: '24', sort_order: 0, ...st };
  const done: WorkoutSession = { id: uuid(), routine_id: push.id, name: 'Push day', planned_for: '2026-11-17', planned_date: '2026-11-17', started_at: null, done_at: '2026-11-17T10:00:00Z', ...st };

  it('adds up the week', () => {
    const r = weekReview({
      tasks: [task({ status: 'done', completed_at: '2026-11-16T05:00:00Z' }), task({ status: 'done', completed_at: '2026-11-17T05:00:00Z' }), task({ status: 'done', completed_at: '2026-11-15T05:00:00Z' })],
      transactions: [tx({ category_id: food.id, amount_centavos: 25000 }), tx({ amount_centavos: 5000 }), tx({ amount_centavos: 9900, occurred_at: '2026-11-12T02:00:00Z' }), tx({ amount_centavos: 70000, transfer_group_id: uuid() })],
      categories: [food],
      logs: [log({ eaten_on: '2026-11-16' }), log({ eaten_on: '2026-11-17', kcal: 600 }), log({ eaten_on: '2026-11-15' })],
      routines: [push], sessions: [done], day: TODAY, today: TODAY, toLocalDate: local,
    });
    expect([r.monday, r.sunday, r.isThisWeek]).toEqual(['2026-11-16', '2026-11-22', true]);
    expect(r.tasksDone).toBe(2);
    expect(r.tasksPerDay).toEqual([1, 1, 0, 0, 0, 0, 0]);
    expect(r.spent).toBe(30000);
    expect(r.spentLastWeek).toBe(9900);
    expect(r.byCategory.map((c) => [c.name, c.amount])).toEqual([['Food', 25000], ['Other', 5000]]);
    expect([r.workoutsDone, r.workoutsPlanned]).toEqual([1, 2]);
    expect([r.foodDays, r.avgKcal, r.avgProtein, r.streak]).toEqual([2, 500, 30, 3]);
    expect(weekCoach(r, formatPeso).line).toBe('Spending is ₱201 above last week\'s.');
    expect(weekLabel('2026-11-30')).toBe('Nov 30 – Dec 6');
    expect(weekLabel(r.monday)).toBe('Nov 16 – 22');
  });

  it('counts the meal streak from yesterday until today has a log', () => {
    expect(mealStreak([log({ eaten_on: '2026-11-16' }), log({ eaten_on: '2026-11-15' }), log({ eaten_on: '2026-11-13' })], TODAY)).toBe(2);
    expect(mealStreak([], TODAY)).toBe(0);
  });
});

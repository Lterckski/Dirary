import { describe, expect, it } from 'vitest';
import {
  Routine, WorkoutSession, changeLabel, exerciseProgress, lastSets, loggedExercises, parseKg, planOf, planText, prefill, routineMinutes, setsLabel, todaysWorkout,
  weekCount, weekStrip, weekdayOf, weekdaysLabel, weekdaysOf, weightSeries, workoutCoach,
  type BodyMetric, type Exercise, type WorkoutSet,
} from './workouts';
import { PLAN_DAYS, planWorkoutTasks, sessionDoneChange, workoutOf, workoutSessionId, workoutTaskId, workoutsListId } from './workoutLinks';
import { Task, type List } from './tasks';

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
const st = (at = '2026-11-01T00:00:00Z') => ({ created_at: at, updated_at: at, deleted_at: null });
const TODAY = '2026-11-17'; // a Tuesday
const NOW = '2026-11-17T01:00:00.000Z';
const bench: Exercise = { id: uuid(), name: 'Bench press', muscle_group: 'Chest', starter_key: 'bench-press', ...st() };
const pushups: Exercise = { id: uuid(), name: 'Push-ups', muscle_group: 'Chest', starter_key: 'push-ups', ...st() };
const push: Routine = { id: uuid(), name: 'Push day', plan: planText([{ exercise_id: bench.id, sets: 3, reps: 8 }, { exercise_id: pushups.id, sets: 3, reps: null }]), weekdays: '24', sort_order: 0, ...st() };
const session = (p: Partial<WorkoutSession>): WorkoutSession => ({ id: uuid(), routine_id: push.id, name: 'Push day', planned_for: null, planned_date: TODAY, started_at: null, done_at: null, ...st(), ...p });
const set = (s: WorkoutSession, ex: Exercise, i: number, kg: number, reps: number): WorkoutSet => ({ id: uuid(), session_id: s.id, exercise_id: ex.id, set_index: i, weight_kg: kg, reps, performed_at: `${s.planned_date}T10:0${i}:00Z`, ...st() });

describe('routines', () => {
  it('read their plan and days', () => {
    expect(planOf(push)).toHaveLength(2);
    expect(planOf({ plan: 'nope' })).toEqual([]);
    expect(weekdaysOf(push)).toEqual([2, 4]);
    expect(weekdaysLabel([5, 1, 3])).toBe('Mon, Wed, Fri');
    expect(weekdaysLabel([0, 1, 2, 3, 4, 5, 6])).toBe('Every day');
    expect(routineMinutes(planOf(push))).toBe(15);
    expect(Routine.safeParse(push).success).toBe(true);
    expect(weekdayOf(TODAY)).toBe(2);
  });
});

describe('sets', () => {
  const last = session({ planned_date: '2026-11-12', done_at: '2026-11-12T11:00:00Z' });
  const older = session({ planned_date: '2026-11-05', done_at: '2026-11-05T11:00:00Z' });
  const sets = [set(older, bench, 0, 45, 8), set(last, bench, 0, 50, 8), set(last, bench, 1, 50, 8), set(last, bench, 2, 50, 7), set(last, pushups, 0, 0, 18), set(last, pushups, 1, 0, 15)];
  it('come back from last time, set by set', () => {
    expect(lastSets(bench.id, sets, [last, older])).toEqual([{ weight_kg: 50, reps: 8 }, { weight_kg: 50, reps: 8 }, { weight_kg: 50, reps: 7 }]);
    expect(prefill({ sets: 3, reps: null }, lastSets(pushups.id, sets, [last, older]))).toEqual([{ weight_kg: 0, reps: 18 }, { weight_kg: 0, reps: 15 }, { weight_kg: 0, reps: 15 }]);
    expect(prefill({ sets: 2, reps: 10 }, [])).toEqual([{ weight_kg: 0, reps: 10 }, { weight_kg: 0, reps: 10 }]);
  });
  it('read as people say them', () => {
    expect(setsLabel([{ weight_kg: 50, reps: 8 }, { weight_kg: 50, reps: 8 }, { weight_kg: 50, reps: 7 }])).toBe('50 kg × 8, 8, 7');
    expect(setsLabel([{ weight_kg: 0, reps: 18 }, { weight_kg: 0, reps: 15 }])).toBe('18, 15');
    expect(setsLabel([{ weight_kg: 50, reps: 8 }, { weight_kg: 47.5, reps: 8 }])).toBe('50 × 8, 47.5 × 8');
    expect(parseKg('52,5')).toBe(52.5);
    expect(parseKg('abc')).toBeNull();
  });
  it('show progress and suggest a little more after a clean session', () => {
    const p = exerciseProgress(bench.id, sets, [last, older]);
    expect(p).toEqual({ unit: 'kg', points: [{ date: '2026-11-05', value: 45 }, { date: '2026-11-12', value: 50 }] });
    expect(changeLabel(p.points, 'kg')).toBe('+5 kg in 7 days');
    expect(exerciseProgress(pushups.id, sets, [last]).unit).toBe('reps');
    expect(loggedExercises([bench, pushups], sets).map((e) => e.name)).toEqual(['Bench press', 'Push-ups']);
    const clean = [set(last, bench, 0, 50, 8), set(last, bench, 1, 50, 8), set(last, bench, 2, 50, 8)];
    expect(workoutCoach({ routine: push, session: null, exercises: [bench], sets: clean, sessions: [last] }).line).toBe('You hit every rep on bench press last time. Try 52.5 kg today.');
    expect(workoutCoach({ routine: null, session: null, exercises: [], sets: [], sessions: [] }).mood).toBe('sleepy');
  });
  it('tracks body weight, the latest entry of a day winning', () => {
    const m = (day: string, kg: number, at: string): BodyMetric => ({ id: uuid(), weight_kg: kg, measured_on: day, ...st(at) });
    expect(weightSeries([m('2026-11-10', 70, '2026-11-10T01:00:00Z'), m('2026-11-10', 69.5, '2026-11-10T09:00:00Z'), m('2026-11-17', 69, '2026-11-17T01:00:00Z')]))
      .toEqual([{ date: '2026-11-10', value: 69.5 }, { date: '2026-11-17', value: 69 }]);
  });
});

describe('the week', () => {
  it('marks done, missed, today, planned and rest days', () => {
    const monday = session({ routine_id: null, planned_date: '2026-11-16', done_at: '2026-11-16T10:00:00Z' });
    const days = weekStrip([push], [monday], TODAY);
    expect(days.map((d) => d.state)).toEqual(['done', 'today', 'rest', 'planned', 'rest', 'rest', 'rest']);
    expect(weekCount(days)).toEqual({ done: 1, planned: 3 });
  });
  it('finds today’s workout', () => {
    expect(todaysWorkout([push], [], TODAY).routine?.id).toBe(push.id);
    expect(todaysWorkout([push], [], '2026-11-18')).toEqual({ routine: null, session: null });
    const moved = session({ planned_for: TODAY, planned_date: '2026-11-18' });
    expect(todaysWorkout([push], [moved], TODAY)).toEqual({ routine: null, session: null });
    expect(todaysWorkout([push], [moved], '2026-11-18').session?.id).toBe(moved.id);
  });
});

describe('workouts as tasks', () => {
  const USER = '99999999-9999-4999-8999-999999999999';
  const base = { userId: USER, routines: [push], sessions: [] as WorkoutSession[], sets: [] as WorkoutSet[], tasks: [] as Task[], lists: [] as List[], knownIds: new Set<string>(), today: TODAY, nowIso: NOW };
  it(`plans the coming ${PLAN_DAYS} days, each with a task in a Workouts list`, () => {
    const p = planWorkoutTasks(base);
    expect(p.createSessions.map((s) => s.planned_date)).toEqual(['2026-11-17', '2026-11-19']);
    expect(p.list?.id).toBe(workoutsListId(USER));
    expect(p.createTasks.map((t) => [t.title, t.due_date, t.list_id])).toEqual([['Push day', '2026-11-17', p.list!.id], ['Push day', '2026-11-19', p.list!.id]]);
    expect(p.createTasks.every((t) => Task.safeParse(t).success)).toBe(true);
    expect(p.createSessions.every((s) => WorkoutSession.safeParse(s).success)).toBe(true);
  });
  it('makes the same rows on every device and nothing twice', () => {
    const first = planWorkoutTasks(base);
    const again = planWorkoutTasks({ ...base, sessions: first.createSessions, tasks: first.createTasks, lists: [first.list!] });
    expect(again).toMatchObject({ list: null, createSessions: [], createTasks: [], updateSessions: [], updateTasks: [], removeSessions: [], removeTasks: [] });
    expect(first.createSessions[0]!.id).toBe(workoutSessionId(push, TODAY));
  });
  it('ticks the task when the workout is finished, and moves the workout with its task', () => {
    const first = planWorkoutTasks(base);
    const [s] = first.createSessions;
    const [t] = first.createTasks;
    const done = planWorkoutTasks({ ...base, sessions: [{ ...s!, done_at: NOW }], tasks: [t!], lists: [first.list!] });
    expect(done.updateTasks[0]!.change).toMatchObject({ status: 'done', completed_at: NOW });
    const moved = planWorkoutTasks({ ...base, sessions: [s!], tasks: [{ ...t!, due_date: '2026-11-18' }], lists: [first.list!] });
    expect(moved.updateSessions[0]!.change.planned_date).toBe('2026-11-18');
    expect(workoutOf(t!, [s!])?.id).toBe(s!.id);
    expect(sessionDoneChange(s!, false, NOW)).toEqual({ done_at: null, updated_at: NOW });
  });
  it('follows an edited routine but keeps workouts you started, and never brings back what you deleted', () => {
    const first = planWorkoutTasks(base);
    const [today, thursday] = first.createSessions;
    const edited = { ...push, weekdays: '2', updated_at: '2026-11-17T00:30:00Z' };
    const p = planWorkoutTasks({ ...base, routines: [edited], sessions: [{ ...today!, started_at: NOW }, thursday!], tasks: first.createTasks, lists: [first.list!] });
    expect(p.removeSessions.map((s) => s.id)).toEqual([thursday!.id]);
    expect(p.removeTasks.map((t) => t.id)).toEqual([workoutTaskId(thursday!.id)]);
    expect(p.createSessions).toEqual([]); // today's started workout stands; Thursday is no longer planned
    const deleted = planWorkoutTasks({ ...base, knownIds: new Set([workoutSessionId(push, TODAY), workoutsListId(USER)]) });
    expect(deleted.createSessions.map((s) => s.planned_date)).toEqual(['2026-11-19']);
    expect(deleted.list).toBeNull();
    expect(deleted.createTasks[0]!.list_id).toBeNull();
  });
});

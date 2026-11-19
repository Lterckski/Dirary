import { describe, expect, it } from 'vitest';
import { PROGRAM, isProgramRoutine, programOn, programDayOf, programDayTitle, programSetsReps, programTarget, programWorkout } from './program';
import { PlanItem } from './workouts';

describe('program', () => {
  it('has all seven days, in order, for the gym and at home', () => {
    for (const place of ['gym', 'home'] as const) {
      expect(PROGRAM[place].map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(PROGRAM[place].map((d) => d.kind)).toEqual(['lift', 'lift', 'bjj', 'lift', 'lift', 'bjj', 'rest']);
      for (const d of PROGRAM[place]) expect(d.kind === 'lift' ? d.exercises.length > 0 : !!d.note).toBe(true);
    }
    expect(PROGRAM.gym[3]!.exercises).toHaveLength(7);
    expect(PROGRAM.home[3]!.exercises).toHaveLength(7);
  });
  it('starts the week on Monday', () => {
    expect(programDayOf('2026-11-16')).toBe(1); // Monday
    expect(programDayOf('2026-11-21')).toBe(6); // Saturday
    expect(programDayOf('2026-11-22')).toBe(7); // Sunday
  });
  it('labels days and targets', () => {
    expect(programDayTitle(PROGRAM.gym[4]!)).toBe('Day 5 · Lower B (Hinge + Shoulders)');
    expect(programDayTitle(PROGRAM.gym[6]!)).toBe('Day 7 · Full rest');
    expect(programTarget('3×8–10')).toBe('3 × 8–10');
    expect(programTarget('2–3 sets each')).toBe('2–3 sets each');
  });
  it('turns targets into sets and reps', () => {
    expect(programSetsReps('3×8–10')).toEqual({ sets: 3, reps: 10 });
    expect(programSetsReps('3×5')).toEqual({ sets: 3, reps: 5 });
    expect(programSetsReps('3×12/leg')).toEqual({ sets: 3, reps: 12 });
    expect(programSetsReps('3×max')).toEqual({ sets: 3, reps: null });
    expect(programSetsReps('3×12–15 each letter')).toEqual({ sets: 3, reps: 15 });
    expect(programSetsReps('2–3 sets each')).toEqual({ sets: 3, reps: null });
  });
  it('starts lifting days as workouts with fixed ids', () => {
    const w = programWorkout('gym', 4)!;
    expect(w.name).toBe('Upper B (Pull)');
    expect(w.plan).toHaveLength(7);
    for (const p of w.plan) expect(PlanItem.safeParse(p).success).toBe(true);
    expect(programWorkout('gym', 4)!.routineId).toBe(w.routineId);
    expect(isProgramRoutine({ id: w.routineId })).toBe(true);
    expect(programWorkout('home', 1)!.name).toBe('Upper A (Push) · Home');
    // Lateral raises: the same exercise on Day 1 and Day 5, but not the same at home and at the gym.
    expect(programWorkout('gym', 1)!.plan[4]!.exercise_id).toBe(programWorkout('gym', 5)!.plan[3]!.exercise_id);
    expect(programWorkout('home', 1)!.plan[4]!.exercise_id).not.toBe(programWorkout('gym', 1)!.plan[4]!.exercise_id);
    expect(programWorkout('gym', 3)).toBeNull();
    expect(programWorkout('home', 7)).toBeNull();
  });
});

describe('programOn', () => {
  it('names what today holds', () => {
    expect(programOn('2026-11-19')).toEqual({ day: 4, kind: 'lift', name: 'Upper B (Pull)', exercises: 7, note: null });
    expect(programOn('2026-11-21').name).toBe('Hard BJJ');
    expect(programOn('2026-11-22').kind).toBe('rest');
  });
});

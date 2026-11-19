import { describe, expect, it } from 'vitest';
import { PROGRAM, programDayOf, programDayTitle, programTarget } from './program';

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
});

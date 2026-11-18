import { describe, expect, it } from 'vitest';
import { comebackNudges, dayNudges, inkNote } from './inkVoice';

describe('inkNote', () => {
  it('is stable for the same seed and fills in the task', () => {
    const a = inkNote('task', { task: 'Pay rent' }, 't1:2026-11-18');
    expect(inkNote('task', { task: 'Pay rent' }, 't1:2026-11-18')).toEqual(a);
    expect(a.body).toContain('Pay rent');
    expect(a.title.length).toBeGreaterThan(0);
  });

  it('counts tasks left with the right plural', () => {
    for (let i = 0; i < 20; i++) {
      const one = inkNote('tasksLeft', { left: 1 }, String(i)).body;
      expect(one).not.toMatch(/1 tasks|1 things/);
    }
  });
});

describe('dayNudges', () => {
  const base = { openTasks: 3, kcalEaten: 0, workoutName: 'Push', workoutDone: false };

  it('plans food, workout and tasks-left nudges for later today', () => {
    const ids = dayNudges({ ...base, now: new Date(2026, 10, 18, 9, 0) }).map((n) => n.id);
    expect(ids).toEqual(['ink-food', 'ink-workout', 'ink-tasks-left']);
  });

  it('drops what is already done or already past', () => {
    const ids = dayNudges({ now: new Date(2026, 10, 18, 14, 0), openTasks: 0, kcalEaten: 500, workoutName: 'Push', workoutDone: true }).map((n) => n.id);
    expect(ids).toEqual([]);
    const late = dayNudges({ ...base, now: new Date(2026, 10, 18, 19, 0) }).map((n) => n.id);
    expect(late).toEqual(['ink-tasks-left']);
  });
});

describe('comebackNudges', () => {
  it('lands 1, 2 and 4 days after the last open at 7 PM', () => {
    const at = comebackNudges(new Date(2026, 10, 18, 22, 15)).map((n) => [n.at.getDate(), n.at.getHours()]);
    expect(at).toEqual([[19, 19], [20, 19], [22, 19]]);
  });
});

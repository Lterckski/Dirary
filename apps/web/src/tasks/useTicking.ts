import { useEffect, useRef, useState } from 'react';
import type { Task } from '@dirary/shared';

export type Phase = 'checked' | 'leaving';
/** How long a ticked task stays visible, checked, before folding away; then how long the fold takes. */
export const CHECKED_MS = 340;
export const FOLD_MS = 220;

/**
 * Ticking a task: it shows as checked for a moment, folds away, and only then is saved as done.
 * Ticking it again during that moment cancels. Leaving the page saves anything still waiting.
 * Unticking a done task saves at once.
 */
export function useTicking(save: (task: Task) => void, events: { onTick?: (task: Task) => void; onSaved?: (task: Task) => void } = {}) {
  const [phases, setPhases] = useState<Record<string, Phase>>({});
  const waiting = useRef(new Map<string, { task: Task; timers: number[] }>());
  const lastDone = useRef(0);
  const latest = useRef({ save, events });
  latest.current = { save, events };
  const setPhase = (id: string, phase: Phase | null) => setPhases((all) => {
    const next = { ...all };
    if (phase) next[id] = phase; else delete next[id];
    return next;
  });
  useEffect(() => () => {
    for (const { task, timers } of waiting.current.values()) { timers.forEach(clearTimeout); latest.current.save(task); }
    waiting.current.clear();
  }, []);

  function toggle(task: Task) {
    if (task.status === 'done') return latest.current.save(task);
    const pending = waiting.current.get(task.id);
    if (pending) {
      pending.timers.forEach(clearTimeout);
      waiting.current.delete(task.id);
      setPhase(task.id, null);
      return;
    }
    latest.current.events.onTick?.(task);
    setPhase(task.id, 'checked');
    const timers = [
      window.setTimeout(() => setPhase(task.id, 'leaving'), CHECKED_MS),
      window.setTimeout(() => {
        waiting.current.delete(task.id);
        setPhase(task.id, null);
        lastDone.current = Date.now();
        latest.current.save(task);
        latest.current.events.onSaved?.(task);
      }, CHECKED_MS + FOLD_MS),
    ];
    waiting.current.set(task.id, { task, timers });
  }

  return { phases, toggle, lastDone };
}

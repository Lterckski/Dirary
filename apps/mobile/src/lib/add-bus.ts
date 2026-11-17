/** The floating + button asks a screen to start adding. The request waits if that screen hasn't opened yet. */
import { useEffect, useRef } from 'react';

export type AddTarget = 'tasks' | 'money';
let pending: AddTarget | null = null;
const listeners = new Set<(target: AddTarget) => void>();

export function requestAdd(target: AddTarget): void {
  pending = target;
  for (const listener of listeners) listener(target);
}

export function useAddRequest(target: AddTarget, handler: () => void): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const run = (asked: AddTarget) => {
      if (asked !== target) return;
      pending = null;
      latest.current();
    };
    listeners.add(run);
    if (pending === target) run(target);
    return () => { listeners.delete(run); };
  }, [target]);
}

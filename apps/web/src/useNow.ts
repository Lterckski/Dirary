import { useSyncExternalStore } from 'react';

/**
 * The current time, refreshed every 30 seconds while anything is watching, so labels like
 * "in 2 min" keep counting down instead of freezing at the moment the screen drew. One shared timer.
 */
const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const l of listeners) l();
    }, 30_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) { clearInterval(timer); timer = undefined; }
  };
}

export function useNow(): Date {
  const ms = useSyncExternalStore(subscribe, () => now);
  return new Date(ms);
}

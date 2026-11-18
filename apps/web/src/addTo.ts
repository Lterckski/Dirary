import { useNavigate } from 'react-router-dom';

export type AddKind = 'task' | 'expense' | 'food' | 'workout';
export const ADD_KINDS: { kind: AddKind; label: string }[] = [
  { kind: 'task', label: 'Task' },
  { kind: 'expense', label: 'Expense' },
  { kind: 'food', label: 'Food' },
  { kind: 'workout', label: 'Workout' },
];

/**
 * Opens the screen that adds a thing and asks it to start: the task box, the expense form, the food search,
 * or the Workouts tab. Each screen listens for "dirary:add" once it is showing.
 */
const ORDER = ['/', '/tasks', '/money', '/health'];

/**
 * Page changes slide a short way in the direction of the tab you picked (see the view-transition rules in styles.css).
 * Call this just before navigating; it notes the direction on <html> for the CSS to read.
 */
export function markDirection(to: string): void {
  const from = ORDER.indexOf(window.location.pathname);
  const next = ORDER.indexOf(to);
  document.documentElement.dataset.nav = from === -1 || next === -1 || next === from ? 'none' : next > from ? 'forward' : 'back';
}

export function useAddTo(): (kind: AddKind) => void {
  const navigate = useNavigate();
  return (kind) => {
    const health = kind === 'food' || kind === 'workout';
    if (health) {
      try { sessionStorage.setItem('dirary:health-tab', kind === 'food' ? 'food' : 'workouts'); } catch { /* private mode */ }
    }
    const to = kind === 'task' ? '/tasks' : kind === 'expense' ? '/money' : '/health';
    markDirection(to);
    navigate(to, { viewTransition: true, ...(health ? { state: { tab: kind === 'food' ? 'food' : 'workouts' } } : {}) });
    if (kind !== 'workout') window.setTimeout(() => window.dispatchEvent(new Event('dirary:add')), 80);
  };
}

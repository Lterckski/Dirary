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
export function useAddTo(): (kind: AddKind) => void {
  const navigate = useNavigate();
  return (kind) => {
    const health = kind === 'food' || kind === 'workout';
    if (health) {
      try { sessionStorage.setItem('dirary:health-tab', kind === 'food' ? 'food' : 'workouts'); } catch { /* private mode */ }
    }
    navigate(kind === 'task' ? '/tasks' : kind === 'expense' ? '/money' : '/health', health ? { state: { tab: kind === 'food' ? 'food' : 'workouts' } } : undefined);
    if (kind !== 'workout') window.setTimeout(() => window.dispatchEvent(new Event('dirary:add')), 80);
  };
}

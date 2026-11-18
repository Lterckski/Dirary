/** Today's + menu and buttons: open the screen that adds a thing and ask it to start. */
import { router } from 'expo-router';
import { requestAdd } from './add-bus';

export type AddKind = 'task' | 'expense' | 'food' | 'workout';
export const ADD_KINDS: { kind: AddKind; label: string; hint: string }[] = [
  { kind: 'task', label: 'Task', hint: 'Add a task' },
  { kind: 'expense', label: 'Expense', hint: 'Log an expense' },
  { kind: 'food', label: 'Food', hint: 'Log food' },
  { kind: 'workout', label: 'Workout', hint: 'Open Workouts' },
];

export function addTo(kind: AddKind): void {
  if (kind === 'workout') return router.navigate({ pathname: '/health', params: { tab: 'workouts' } });
  router.navigate(kind === 'task' ? '/tasks' : kind === 'expense' ? '/money' : '/health');
  requestAdd(kind === 'task' ? 'tasks' : kind === 'expense' ? 'money' : 'health');
}

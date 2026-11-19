/** Tasks and lists on the phone: read from the local database, change it, and keep everything else in step. */
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { LISTS_TABLE, TASKS_TABLE, completeTask, localDate, reopenTask, type List, type ListColor, type Task, type TaskDraft } from '@dirary/shared';

import { reconcileBillTasks, toggleBillTask } from './bill-tasks';
import { reconcileWorkoutTasks, toggleWorkoutTask } from './workout-tasks';
import { clearLocal, getMeta, pendingCount, readLists, readTasks, saveLocal, syncAll } from './db';
import { refreshReminders } from './reminders';
import { supabase } from './supabase';
import { watchTables } from './realtime';
import { clearCaptures } from '../../modules/dirary-capture';
import { refreshWidgets } from '../widgets/refresh';

const now = () => new Date().toISOString();
const listeners = new Set<() => void>();
let syncMessage = '';

function emit() {
  for (const listener of listeners) listener();
}

/** Lets other stores (money) redraw when a sync brings in changes. Returns the unsubscribe function. */
export function subscribeStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** After any change: redraw screens, reschedule reminders, redraw widgets, and sync. */
async function changed() {
  emit();
  const tasks = await readTasks();
  refreshReminders(tasks).catch(() => {});
  refreshWidgets().catch(() => {});
  syncSoon();
}

let timer: ReturnType<typeof setTimeout> | null = null;
function syncSoon() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { syncTasks(); }, 400);
}

/** Runs a sync and reports the outcome to the screens. Never throws. */
export async function syncTasks(): Promise<void> {
  // Bills become tasks even offline, once this phone has pulled at least once (so it knows which bill
  // tasks the web already made or you deleted). After a pull, payments made elsewhere tick their tasks here.
  const pulledBefore = (await getMeta(`cursor_${TASKS_TABLE}`)) !== null;
  const reconcile = async () => (await reconcileBillTasks().catch(() => 0)) + (await reconcileWorkoutTasks().catch(() => 0));
  let changedHere = pulledBefore ? await reconcile() : 0;
  let pulled = 0;
  if (supabase) {
    try {
      pulled = (await syncAll(supabase)).pulled;
      const more = await reconcile();
      if (more > 0) await syncAll(supabase);
      changedHere += more;
      syncMessage = '';
    } catch {
      const waiting = await pendingCount();
      syncMessage = waiting > 0 ? `Offline. ${waiting} change${waiting === 1 ? '' : 's'} saved on this phone.` : 'Offline. Showing what is saved on this phone.';
    }
  }
  if (pulled > 0 || changedHere > 0) {
    const tasks = await readTasks();
    refreshReminders(tasks).catch(() => {});
    refreshWidgets().catch(() => {});
  }
  emit();
}

export async function addTask(draft: TaskDraft): Promise<void> {
  const stamp = now();
  const task: Task = { id: Crypto.randomUUID(), ...draft, status: 'todo', completed_at: null, created_at: stamp, updated_at: stamp, deleted_at: null };
  await saveLocal(TASKS_TABLE, task);
  await changed();
}

export async function updateTask(task: Task, patch: Partial<Task>): Promise<void> {
  await saveLocal(TASKS_TABLE, { ...task, ...patch, updated_at: now() });
  await changed();
}

/** Ticking a repeating task also creates its next occurrence. Ticking a bill logs its payment in Money. */
export async function toggleTask(task: Task): Promise<void> {
  if ((await toggleBillTask(task)) || (await toggleWorkoutTask(task))) {
    // handled
  } else if (task.status === 'done') {
    await saveLocal(TASKS_TABLE, { ...task, ...reopenTask(now()) });
  } else {
    const { done, next } = completeTask(task, now(), localDate(), Crypto.randomUUID());
    await saveLocal(TASKS_TABLE, { ...task, ...done });
    if (next) await saveLocal(TASKS_TABLE, next);
  }
  await changed();
}

/** Soft delete, so other devices learn about it when they sync. */
export async function removeTask(task: Task): Promise<void> {
  await saveLocal(TASKS_TABLE, { ...task, deleted_at: now(), updated_at: now() });
  await changed();
}

export async function addList(name: string, color: ListColor, sortOrder: number): Promise<void> {
  const stamp = now();
  await saveLocal(LISTS_TABLE, { id: Crypto.randomUUID(), name, color, sort_order: sortOrder, created_at: stamp, updated_at: stamp, deleted_at: null });
  await changed();
}

export async function renameList(list: List, name: string): Promise<void> {
  await saveLocal(LISTS_TABLE, { ...list, name, updated_at: now() });
  await changed();
}

/** Deleting a list keeps its tasks; they move to the Inbox. */
export async function removeList(list: List): Promise<void> {
  await saveLocal(LISTS_TABLE, { ...list, deleted_at: now(), updated_at: now() });
  await changed();
}

/** Wipes this phone's copy on sign-out, so the next account never sees it. */
export async function signOutAndClear(): Promise<void> {
  await syncTasks();
  await supabase?.auth.signOut();
  await clearLocal();
  clearCaptures(); // captured notification text belongs to the account that was signed in
  await refreshReminders([]).catch(() => {});
  await refreshWidgets().catch(() => {});
  emit();
}

/** Live tasks and lists for a screen. Syncs on open, when the app returns to the front, on remote changes, and every minute. */
export function useTasksStore() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const [t, l] = await Promise.all([readTasks(), readLists()]);
    setTasks(t);
    setLists(l);
    setMessage(syncMessage);
    setLoading(false);
  }, []);

  useEffect(() => {
    listeners.add(load);
    load().then(syncTasks);
    const appState = AppState.addEventListener('change', (state) => { if (state === 'active') syncTasks(); });
    const interval = setInterval(syncTasks, 60_000);
    const unwatch = watchTables('tasks_phone', [TASKS_TABLE, LISTS_TABLE], syncSoon);
    return () => {
      listeners.delete(load);
      appState.remove();
      clearInterval(interval);
      unwatch();
    };
  }, [load]);

  return { tasks, lists, loading, message };
}

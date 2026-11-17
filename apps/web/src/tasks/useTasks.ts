import { useCallback, useEffect, useState } from 'react';
import {
  LISTS_TABLE, LIST_COLUMNS, TASKS_TABLE, TASK_COLUMNS, completeTask, localDate, reopenTask,
  type List, type ListColor, type Task, type TaskDraft,
} from '@dirary/shared';
import { supabase } from '../supabase';

const now = () => new Date().toISOString();

/** Loads lists and tasks, keeps them live, and exposes the changes the screen can make. */
export type TasksStore = ReturnType<typeof useTasks>;

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [t, l] = await Promise.all([
      supabase.from(TASKS_TABLE).select(TASK_COLUMNS).is('deleted_at', null).order('created_at').limit(2000),
      supabase.from(LISTS_TABLE).select(LIST_COLUMNS).is('deleted_at', null).order('sort_order').order('created_at'),
    ]);
    const failure = t.error ?? l.error;
    if (failure) setError(friendly(failure.message));
    else {
      setTasks(t.data as unknown as Task[]);
      setLists(l.data as unknown as List[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    if (!supabase) return;
    const client = supabase;
    const channel = client
      .channel('tasks_web')
      .on('postgres_changes', { event: '*', schema: 'public', table: TASKS_TABLE }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: LISTS_TABLE }, load)
      .subscribe();
    return () => { client.removeChannel(channel); };
  }, [load]);

  /** Shows the change right away, saves it, and reloads if saving failed. */
  const save = useCallback(async (apply: () => void, write: () => PromiseLike<{ error: { message: string } | null }>) => {
    apply();
    const { error } = await write();
    if (error) {
      setError(friendly(error.message));
      load();
    } else setError(null);
  }, [load]);

  const addTask = useCallback((draft: TaskDraft) => {
    const stamp = now();
    const task: Task = {
      id: crypto.randomUUID(), ...draft, status: 'todo', completed_at: null,
      created_at: stamp, updated_at: stamp, deleted_at: null,
    };
    return save(() => setTasks((all) => [...all, task]), () => supabase!.from(TASKS_TABLE).insert(task));
  }, [save]);

  const updateTask = useCallback((id: string, patch: Partial<Task>) => {
    const change = { ...patch, updated_at: now() };
    return save(
      () => setTasks((all) => all.map((t) => (t.id === id ? { ...t, ...change } : t))),
      () => supabase!.from(TASKS_TABLE).update(change).eq('id', id),
    );
  }, [save]);

  /** Ticking a repeating task also creates its next occurrence. */
  const toggleTask = useCallback((task: Task) => {
    if (task.status === 'done') return updateTask(task.id, reopenTask(now()));
    const { done, next } = completeTask(task, now(), localDate(), crypto.randomUUID());
    return save(
      () => setTasks((all) => [...all.map((t) => (t.id === task.id ? { ...t, ...done } : t)), ...(next ? [next] : [])]),
      async () => {
        const first = await supabase!.from(TASKS_TABLE).update(done).eq('id', task.id);
        if (first.error || !next) return first;
        return supabase!.from(TASKS_TABLE).insert(next);
      },
    );
  }, [save, updateTask]);

  /**
   * Adds tasks made by the links to Money and Health (bills, planned workouts). Their ids are fixed, so one
   * already in the database (the phone made it, or it was deleted) is skipped rather than brought back.
   */
  const addBillTasks = useCallback(async (rows: Task[]) => {
    if (!supabase || rows.length === 0) return;
    const { data, error: lookup } = await supabase.from(TASKS_TABLE).select('id').in('id', rows.map((r) => r.id));
    if (lookup) return setError(friendly(lookup.message));
    const seen = new Set((data ?? []).map((r) => (r as { id: string }).id));
    const missing = rows.filter((r) => !seen.has(r.id));
    if (missing.length === 0) return;
    await save(() => setTasks((all) => [...all, ...missing.filter((m) => !all.some((t) => t.id === m.id))]),
      () => supabase!.from(TASKS_TABLE).upsert(missing, { onConflict: 'id', ignoreDuplicates: true }));
  }, [save]);

  /** Adds the Workouts list unless a row with its fixed id exists already (made elsewhere, or deleted). */
  const addListIfNew = useCallback(async (list: List) => {
    if (!supabase) return;
    const { data, error: lookup } = await supabase.from(LISTS_TABLE).select('id').eq('id', list.id);
    if (lookup || (data ?? []).length > 0) return;
    await save(() => setLists((all) => (all.some((l) => l.id === list.id) ? all : [...all, list])), () => supabase!.from(LISTS_TABLE).upsert(list, { onConflict: 'id', ignoreDuplicates: true }));
  }, [save]);

  /** Soft delete, so the phone can learn about it when it syncs. */
  const removeTask = useCallback((id: string) => {
    const change = { deleted_at: now(), updated_at: now() };
    return save(() => setTasks((all) => all.filter((t) => t.id !== id)), () => supabase!.from(TASKS_TABLE).update(change).eq('id', id));
  }, [save]);

  const addList = useCallback((name: string, color: ListColor) => {
    const stamp = now();
    const list: List = { id: crypto.randomUUID(), name, color, sort_order: lists.length, created_at: stamp, updated_at: stamp, deleted_at: null };
    save(() => setLists((all) => [...all, list]), () => supabase!.from(LISTS_TABLE).insert(list));
    return list.id;
  }, [lists.length, save]);

  const renameList = useCallback((id: string, name: string) => {
    const change = { name, updated_at: now() };
    return save(() => setLists((all) => all.map((l) => (l.id === id ? { ...l, ...change } : l))), () => supabase!.from(LISTS_TABLE).update(change).eq('id', id));
  }, [save]);

  /** Deleting a list keeps its tasks; they move to the Inbox. */
  const removeList = useCallback((id: string) => {
    const change = { deleted_at: now(), updated_at: now() };
    return save(() => setLists((all) => all.filter((l) => l.id !== id)), () => supabase!.from(LISTS_TABLE).update(change).eq('id', id));
  }, [save]);

  return { tasks, lists, loading, error, addTask, addBillTasks, addListIfNew, updateTask, toggleTask, removeTask, addList, renameList, removeList, reload: load };
}

function friendly(message: string): string {
  if (/relation .* does not exist|schema cache/i.test(message)) return "The task tables aren't in Supabase yet. Run the Phase 1 SQL file, then reload.";
  if (/failed to fetch|network/i.test(message)) return "Couldn't reach the server. Check your connection and try again.";
  return message;
}

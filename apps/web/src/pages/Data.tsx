import { useState } from 'react';
import { Link } from 'react-router-dom';
import { localDate } from '@dirary/shared';
import { supabase } from '../supabase';

/** Every table that holds your data. sync_probe was only the Phase 0 test, so it is left out. */
const TABLES = [
  'lists', 'tasks',
  'accounts', 'categories', 'transactions', 'fixed_expenses', 'money_plans', 'stashes',
  'foods', 'food_logs', 'health_goals', 'water_logs',
  'exercises', 'routines', 'workout_sessions', 'workout_sets', 'body_metrics',
] as const;
type Table = (typeof TABLES)[number];
type Row = Record<string, unknown>;

const CSVS: { file: string; label: string; build: (all: Record<Table, Row[]>) => Row[] }[] = [
  { file: 'tasks', label: 'Tasks', build: (all) => {
    const lists = new Map(all.lists.map((l) => [l.id, l.name]));
    return all.tasks.map((t) => ({ title: t.title, list: lists.get(t.list_id) ?? 'Inbox', status: t.status, due_date: t.due_date, due_time: t.due_time, priority: t.priority, repeats: t.recurrence_rule, completed_at: t.completed_at, notes: t.notes, created_at: t.created_at }));
  } },
  { file: 'transactions', label: 'Transactions', build: (all) => {
    const accounts = new Map(all.accounts.map((a) => [a.id, a.name]));
    const categories = new Map(all.categories.map((c) => [c.id, c.name]));
    return all.transactions.map((t) => ({
      date: t.occurred_at, direction: t.direction, amount: (Number(t.amount_centavos) / 100).toFixed(2), account: accounts.get(t.account_id) ?? '', category: categories.get(t.category_id) ?? '',
      merchant: t.merchant, note: t.note, status: t.status, source: t.source,
    }));
  } },
  { file: 'food-log', label: 'Food log', build: (all) => all.food_logs.map((l) => ({ date: l.eaten_on, meal: l.meal, food: l.name, grams: l.grams, kcal: l.kcal, protein_g: l.protein_g })) },
  { file: 'workout-sets', label: 'Workout sets', build: (all) => {
    const exercises = new Map(all.exercises.map((e) => [e.id, e.name]));
    const sessions = new Map(all.workout_sessions.map((s) => [s.id, s]));
    return all.workout_sets.map((s) => {
      const session = sessions.get(s.session_id);
      return { date: session?.planned_date ?? '', workout: session?.name ?? '', exercise: exercises.get(s.exercise_id) ?? '', set: Number(s.set_index) + 1, weight_kg: s.weight_kg, reps: s.reps };
    });
  } },
  { file: 'body-weight', label: 'Body weight', build: (all) => all.body_metrics.map((m) => ({ date: m.measured_on, weight_kg: m.weight_kg })) },
];

async function readAll(): Promise<Record<Table, Row[]>> {
  if (!supabase) throw new Error('Not connected.');
  const client = supabase;
  const out = {} as Record<Table, Row[]>;
  await Promise.all(TABLES.map(async (table) => {
    const rows: Row[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await client.from(table).select('*').is('deleted_at', null).order('created_at').range(from, from + 999);
      // A table from a phase whose SQL hasn't run yet is simply empty.
      if (error) { if (error.code === '42P01' || /does not exist|schema cache/i.test(error.message)) break; throw new Error(`${table}: ${error.message}`); }
      rows.push(...(data as Row[]));
      if (!data || data.length < 1000) break;
    }
    // user_id is the same on every row and means nothing outside this database.
    out[table] = rows.map(({ user_id: _, ...rest }) => rest);
  }));
  return out;
}

function csv(rows: Row[]): string {
  if (rows.length === 0) return '';
  const cols = Object.keys(rows[0]!);
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    // A leading = + - @ would run as a formula in a spreadsheet.
    const safe = /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n';
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([type === 'text/csv' ? '﻿' + text : text], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Your data: download everything as JSON, or the main tables as CSV for a spreadsheet. */
export function Data() {
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  async function run(key: string, make: (all: Record<Table, Row[]>) => void) {
    setBusy(key);
    setStatus(null);
    try {
      make(await readAll());
    } catch (e) {
      setStatus({ ok: false, text: `Couldn't export: ${e instanceof Error ? e.message : 'something went wrong'}` });
    } finally {
      setBusy(null);
    }
  }
  const stamp = localDate();

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow"><Link to="/">Today</Link></p>
          <h1 className="display">Your data</h1>
        </div>
      </div>

      <section className="card" aria-labelledby="d-json">
        <h2 id="d-json" className="card-label">Everything</h2>
        <p>One JSON file with every task, transaction, food log and workout, as they are stored. Keep it somewhere safe: it holds your finances.</p>
        <div className="row">
          <button type="button" className="btn primary" disabled={busy !== null} onClick={() => run('json', (all) => {
            download(`dirary-${stamp}.json`, JSON.stringify({ app: 'Dirary', exported_at: new Date().toISOString(), tables: all }, null, 2), 'application/json');
            const count = Object.values(all).reduce((s, rows) => s + rows.length, 0);
            setStatus({ ok: true, text: `Downloaded ${count.toLocaleString()} rows.` });
          })}>
            {busy === 'json' ? 'Preparing…' : 'Download JSON'}
          </button>
        </div>
      </section>

      <section className="card" aria-labelledby="d-csv">
        <h2 id="d-csv" className="card-label">For a spreadsheet</h2>
        <p className="muted">CSV files open in Excel or Google Sheets. Amounts are in pesos.</p>
        <div className="row">
          {CSVS.map((c) => (
            <button key={c.file} type="button" className="btn" disabled={busy !== null} onClick={() => run(c.file, (all) => {
              const rows = c.build(all);
              if (rows.length === 0) return setStatus({ ok: true, text: `No ${c.label.toLowerCase()} to export yet.` });
              download(`dirary-${c.file}-${stamp}.csv`, csv(rows), 'text/csv');
              setStatus({ ok: true, text: `Downloaded ${rows.length.toLocaleString()} ${c.label.toLowerCase()} rows.` });
            })}>
              {busy === c.file ? 'Preparing…' : c.label}
            </button>
          ))}
        </div>
      </section>

      {status && <p className={status.ok ? 'note ok' : 'note error'} role={status.ok ? 'status' : 'alert'}>{status.text}</p>}

      <section className="card" aria-labelledby="d-backup">
        <h2 id="d-backup" className="card-label">Weekly backup</h2>
        <p className="muted">
          A GitHub Action copies the whole database every Sunday, encrypts it with your passphrase and keeps it for 90 days.
          Setup and restore steps are in <code>docs/BACKUP.md</code>.
        </p>
        <p className="muted">Bank notifications the phone reads are never in the database, so they are never in an export or a backup.</p>
      </section>
    </div>
  );
}

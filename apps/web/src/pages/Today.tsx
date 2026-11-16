import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { MASCOT_MOODS, type MascotMood } from '@dirary/ui';
import { SYNC_PROBE_COLUMNS, SYNC_PROBE_TABLE, type SyncProbe } from '@dirary/shared';
import { Mascot } from '../Mascot';
import { supabase } from '../supabase';

const MOOD_LINES: Record<MascotMood, string> = {
  happy: 'Default on home, widgets and the app icon.',
  coach: 'Tips, nudges and the chat button.',
  cheer: 'Task done, budget kept, workout logged.',
  sleepy: 'Empty states and nothing due.',
  worried: 'Overdue task, over budget, missed log.',
};

export function Today() {
  const [mood, setMood] = useState<MascotMood>('happy');
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">Phase 0 · Foundation</p>
          <h1 className="display">The shell is up</h1>
        </div>
        <Mascot mood={mood} size={96} />
      </div>
      <section className="card" aria-labelledby="moods-title">
        <h2 id="moods-title" className="display" style={{ fontSize: 24 }}>Ink's five moods</h2>
        <div className="moods">
          {MASCOT_MOODS.map((m) => (
            <button key={m} type="button" className="mood" aria-pressed={m === mood} onClick={() => setMood(m)}>
              <Mascot mood={m} size={104} />
              {m}
            </button>
          ))}
        </div>
        <p className="muted">{MOOD_LINES[mood]}</p>
      </section>
      <SyncTest />
    </div>
  );
}

/** Adds and lists rows in sync_probe. Add one here and it should appear on the phone, and the other way round. */
function SyncTest() {
  const [rows, setRows] = useState<SyncProbe[]>([]);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from(SYNC_PROBE_TABLE).select(SYNC_PROBE_COLUMNS).is('deleted_at', null).order('updated_at', { ascending: false }).limit(20);
    if (error) setError(error.message);
    else setRows(data as SyncProbe[]);
  }, []);

  useEffect(() => {
    load();
    if (!supabase) return;
    const client = supabase;
    const channel = client.channel('sync_probe_web').on('postgres_changes', { event: '*', schema: 'public', table: SYNC_PROBE_TABLE }, load).subscribe();
    return () => { client.removeChannel(channel); };
  }, [load]);

  async function add(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !note.trim()) return;
    setError(null);
    const { error } = await supabase.from(SYNC_PROBE_TABLE).insert({ note: note.trim() });
    if (error) setError(error.message);
    else { setNote(''); load(); }
  }

  return (
    <section className="card" aria-labelledby="sync-title">
      <h2 id="sync-title" className="display" style={{ fontSize: 24 }}>Sync test</h2>
      <p className="muted">Add a note here and it should show up on your phone, and the other way round. This is the Phase 0 exit check.</p>
      <form className="row" onSubmit={add}>
        <label className="field grow">
          Note
          <input className="input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Hello from the web" />
        </label>
        <button className="btn primary" type="submit" style={{ alignSelf: 'flex-end' }}>Add</button>
      </form>
      {error && <p className="note error" role="alert">{error}</p>}
      {rows.length === 0 ? (
        <p className="muted note">No notes yet.</p>
      ) : (
        <ul className="list">
          {rows.map((row) => (
            <li key={row.id}>
              <span className="grow">{row.note}</span>
              <time dateTime={row.updated_at}>{new Date(row.updated_at).toLocaleString()}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

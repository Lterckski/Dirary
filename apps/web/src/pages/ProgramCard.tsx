import { useState, type CSSProperties } from 'react';
import { PROGRAM, PROGRAM_PLACE_LABEL, PROGRESSION, localDate, programDayOf, programDayTitle, programRoutineId, programTarget, type ProgramPlace, type WorkoutSession } from '@dirary/shared';
import { Mascot } from '../Mascot';

const PLACE_KEY = 'dirary.programPlace';
const PLACES = ['gym', 'home'] as const;

/** Gym or Home, as last picked on the card. */
export function savedPlace(): ProgramPlace {
  try { return localStorage.getItem(PLACE_KEY) === 'home' ? 'home' : 'gym'; } catch { return 'gym'; }
}

/** Luther's 7-day program, with a Gym / Home switch for days he can't get to the gym. Opens on today (Monday is Day 1). */
export function ProgramCard({ sessions, onStart }: { sessions: readonly WorkoutSession[]; onStart: (place: ProgramPlace, day: number) => void | Promise<void> }) {
  const date = localDate();
  const today = programDayOf(date);
  const [busy, setBusy] = useState(false);
  const [place, setPlace] = useState<ProgramPlace>(savedPlace);
  const [day, setDay] = useState(today);
  const choosePlace = (p: ProgramPlace) => { setPlace(p); try { localStorage.setItem(PLACE_KEY, p); } catch { /* private window */ } };
  const days = PROGRAM[place];
  const shown = days.find((d) => d.day === day) ?? days[0]!;
  // Today's workout for this day, if you've started it already.
  const mine = sessions.filter((s) => s.routine_id === programRoutineId(place, shown.day) && s.planned_date === date && !s.deleted_at);
  const started = mine.find((s) => !s.done_at) ?? mine[0] ?? null;
  const name = `${shown.title}${shown.focus ? ` (${shown.focus})` : ''}`;

  return (
    <section className="card" aria-labelledby="program-title">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 id="program-title" className="card-label">My program</h2>
        {day !== today && <button type="button" className="program-today" onClick={() => setDay(today)}>Back to today</button>}
      </div>
      <div className="segmented slide-switch program-switch" role="group" aria-label="Where you're training" style={{ '--n': 2, '--i': PLACES.indexOf(place) } as CSSProperties}>
        {PLACES.map((p) => <button key={p} type="button" aria-pressed={place === p} onClick={() => choosePlace(p)}>{PROGRAM_PLACE_LABEL[p]}</button>)}
      </div>
      <div className="program-days" role="group" aria-label="Day">
        {days.map((d) => (
          <button key={d.day} type="button" className={`program-day ${d.kind}${d.day === today ? ' today' : ''}`} aria-pressed={d.day === shown.day}
            aria-label={`${programDayTitle(d)}${d.day === today ? ', today' : ''}`} onClick={() => setDay(d.day)}>{d.day}</button>
        ))}
      </div>
      <div key={`${place}-${shown.day}`} className="program-body">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h3 className="program-day-title display">{programDayTitle(shown)}</h3>
          {shown.day === today && <span className="card-label program-today-tag">Today</span>}
        </div>
        {shown.exercises.map((e, i) => (
          <div key={`${i}-${e.name}`} className="food-row static">
            <span className="grow">
              <span className="task-title">{e.name}</span>
              {e.how && <span className="task-meta">{e.how}</span>}
            </span>
            <span className="target">{programTarget(e.target)}</span>
          </div>
        ))}
        {shown.kind === 'lift' && (
          <button type="button" className={started?.done_at ? 'btn' : 'btn primary big'} disabled={busy}
            onClick={async () => { setBusy(true); try { await onStart(place, shown.day); } finally { setBusy(false); } }}>
            {started?.done_at ? "See today's sets" : started?.started_at ? `Continue ${name}` : `Start ${name}`}
          </button>
        )}
        {shown.note && (
          <div className="coach">
            <span className="coach-badge"><Mascot mood={shown.kind === 'rest' ? 'sleepy' : 'coach'} size={52} /></span>
            <p>{shown.note}</p>
          </div>
        )}
      </div>
      <div className="program-progression">
        <h3 className="card-label">Progression</h3>
        <ul>{PROGRESSION.map((line) => <li key={line}>{line}</li>)}</ul>
      </div>
    </section>
  );
}

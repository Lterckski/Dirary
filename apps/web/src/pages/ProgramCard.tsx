import { useState, type CSSProperties } from 'react';
import { PROGRAM, PROGRAM_PLACE_LABEL, PROGRESSION, localDate, programDayOf, programDayTitle, programTarget, type ProgramPlace } from '@dirary/shared';
import { Mascot } from '../Mascot';

const PLACE_KEY = 'dirary.programPlace';
const PLACES = ['gym', 'home'] as const;

function savedPlace(): ProgramPlace {
  try { return localStorage.getItem(PLACE_KEY) === 'home' ? 'home' : 'gym'; } catch { return 'gym'; }
}

/** Luther's 7-day program, with a Gym / Home switch for days he can't get to the gym. Opens on today (Monday is Day 1). */
export function ProgramCard() {
  const today = programDayOf(localDate());
  const [place, setPlace] = useState<ProgramPlace>(savedPlace);
  const [day, setDay] = useState(today);
  const choosePlace = (p: ProgramPlace) => { setPlace(p); try { localStorage.setItem(PLACE_KEY, p); } catch { /* private window */ } };
  const days = PROGRAM[place];
  const shown = days.find((d) => d.day === day) ?? days[0]!;

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

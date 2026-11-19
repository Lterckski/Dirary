import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  STARTER_EXERCISES, WEEKDAY_NAME, WEEKDAY_SHORT, localDate, WEEK_ORDER, changeLabel, exerciseProgress, formatKg, lastSets, loggedExercises, parseKg, planOf, prefill, routineMinutes,
  setsLabel, targetLabel, todaysWorkout, weekCount, weekStrip, weekdaysLabel, weekdaysOf, weekdaysText, weightSeries, workoutCoach,
  type Exercise, type PlanItem, type ProgressPoint, type Routine, type SetValue, type StarterExercise, type WorkoutSession,
} from '@dirary/shared';
import { Mascot } from '../Mascot';
import { useWorkouts, type WorkoutsStore } from '../health/useWorkouts';
import { useWorkoutTasks } from '../links/useWorkoutTasks';
import { useTasks } from '../tasks/useTasks';
import { Modal } from '../ui';
import { ProgramCard } from './ProgramCard';

const REST_SECONDS = 90;
type Dialog = { kind: 'routine'; routine: Routine | null } | { kind: 'weight' } | null;

/** The Workouts tab of Health: today's workout, the week, your program (gym or home), progress, routines, and the workout in progress. */
export function WorkoutsTab() {
  const store = useWorkouts();
  const tasks = useTasks();
  const link = useWorkoutTasks(tasks, store);
  const { exercises, routines, sessions, sets, metrics, loading, error } = store;
  const [active, setActive] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const today = localDate();

  const { routine, session } = useMemo(() => todaysWorkout(routines, sessions, today), [routines, sessions, today]);
  const coach = workoutCoach({ routine, session, exercises, sets, sessions });
  const week = useMemo(() => weekStrip(routines, sessions, today), [routines, sessions, today]);
  const count = weekCount(week);
  const running = sessions.find((s) => s.id === active) ?? null;

  if (error) return <p className="note error" role="alert">{error}</p>;
  if (loading) return <p className="muted" role="status">Loading your workouts…</p>;
  if (running) return <SessionView store={store} session={running} onFinish={() => { link.finish(running); setActive(null); }} onBack={() => setActive(null)} />;

  const plan = routine ? planOf(routine) : [];
  const name = session?.name ?? routine?.name ?? null;
  const start = (r: Routine | null, existing: WorkoutSession | null) => setActive(store.startWorkout(r, existing).id);

  return (
    <div className="money-cols">
      <div className="money-col">
        <div className="peek">
          <span className="peek-ink" aria-hidden="true"><Mascot mood={coach.mood} size={96} /></span>
          <section className="card safe" aria-labelledby="today-workout">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 id="today-workout" className="card-label">{name ? `Today · ${name}` : 'Today · Rest day'}</h2>
              {plan.length > 0 && !session?.done_at && <span className="muted note amount-note">About {routineMinutes(plan)} min</span>}
            </div>
            {plan.map((item) => {
              const ex = exercises.find((e) => e.id === item.exercise_id);
              const last = lastSets(item.exercise_id, sets, sessions, session?.id);
              return (
                <div key={item.exercise_id} className="food-row static">
                  <span className="grow">
                    <span className="task-title">{ex?.name ?? 'Exercise'}</span>
                    <span className="task-meta">{last.length ? `Last time: ${setsLabel(last)}` : 'First time'}</span>
                  </span>
                  <span className="target">{targetLabel(item)}</span>
                </div>
              );
            })}
            {session?.done_at ? (
              <button type="button" className="btn" onClick={() => setActive(session.id)}>See today's sets</button>
            ) : name ? (
              <button type="button" className="btn primary big" onClick={() => start(routine, session)}>{session?.started_at ? `Continue ${name}` : `Start ${name}`}</button>
            ) : (
              <div className="row wrap-tight">
                {routines.map((r) => <button key={r.id} type="button" className="chip" onClick={() => start(r, null)}>Start {r.name}</button>)}
                <button type="button" className="chip dashed" onClick={() => start(null, null)}>Start an empty workout</button>
              </div>
            )}
            <div className="coach">
              <span className="coach-badge"><Mascot mood={coach.mood} size={52} /></span>
              <p aria-live="polite">{coach.line}</p>
            </div>
          </section>
        </div>

        <section className="card" aria-labelledby="week-title">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 id="week-title" className="card-label">This week</h2>
            <span className="muted note amount-note">{count.done} of {count.planned} workout{count.planned === 1 ? '' : 's'}</span>
          </div>
          <ol className="week" aria-label="This week">
            {week.map((d) => (
              <li key={d.date} className={d.isToday ? 'today' : ''}>
                <span className="wd" aria-hidden="true">{WEEKDAY_SHORT[d.weekday]}</span>
                <span className={`dot ${d.state}`} role="img"
                  aria-label={`${WEEKDAY_NAME[d.weekday]}: ${{ done: 'done', planned: 'planned', missed: 'missed', rest: 'rest day', today: 'planned today' }[d.state]}`}>
                  {d.state === 'done' && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" /></svg>}
                  {d.state === 'rest' && '·'}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="card" aria-labelledby="routines-title">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 id="routines-title" className="card-label">Routines</h2>
            <button type="button" className="btn small" onClick={() => setDialog({ kind: 'routine', routine: null })}>New routine</button>
          </div>
          {routines.length === 0 && <p className="muted">Make a routine, pick its days, and each one shows up in Tasks as well.</p>}
          {routines.map((r) => (
            <button key={r.id} type="button" className="food-row" onClick={() => setDialog({ kind: 'routine', routine: r })}>
              <span className="grow">
                <span className="task-title">{r.name}</span>
                <span className="task-meta">{weekdaysLabel(weekdaysOf(r))} · {planOf(r).length} exercise{planOf(r).length === 1 ? '' : 's'}</span>
              </span>
            </button>
          ))}
        </section>
      </div>

      <div className="money-col">
        <ProgramCard />
        <ProgressCard store={store} onLogWeight={() => setDialog({ kind: 'weight' })} />
      </div>

      {dialog?.kind === 'routine' && <RoutineDialog store={store} routine={dialog.routine} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'weight' && <WeightDialog store={store} last={weightSeries(metrics).at(-1)?.value ?? null} onClose={() => setDialog(null)} />}
    </div>
  );
}

// ---- progress ----

function ProgressCard({ store, onLogWeight }: { store: WorkoutsStore; onLogWeight: () => void }) {
  const logged = useMemo(() => loggedExercises(store.exercises, store.sets), [store.exercises, store.sets]);
  const [pick, setPick] = useState<string | null>(null);
  const shown = pick === 'weight' || logged.some((e) => e.id === pick) ? pick! : logged[0]?.id ?? 'weight';
  const series = shown === 'weight'
    ? { points: weightSeries(store.metrics), unit: 'kg' as const }
    : exerciseProgress(shown, store.sets, store.sessions);
  const label = shown === 'weight' ? 'Body weight' : logged.find((e) => e.id === shown)?.name ?? '';
  const last = series.points.at(-1);
  return (
    <section className="card" aria-labelledby="progress-title">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 id="progress-title" className="card-label">Progress</h2>
        <button type="button" className="btn small" onClick={onLogWeight}>Log weight</button>
      </div>
      <div className="row wrap-tight" role="group" aria-label="Show progress for">
        {logged.slice(0, 6).map((e) => <button key={e.id} type="button" className="chip" aria-pressed={shown === e.id} onClick={() => setPick(e.id)}>{e.name}</button>)}
        <button type="button" className="chip" aria-pressed={shown === 'weight'} onClick={() => setPick('weight')}>Body weight</button>
      </div>
      {last ? (
        <>
          <p className="row" style={{ alignItems: 'baseline', gap: 8 }}>
            <span className="display stat-num">{formatKg(last.value)} {series.unit}</span>
            <span className="change-note">{changeLabel(series.points, series.unit)}</span>
          </p>
          <LineChart points={series.points} label={`${label}, ${series.unit === 'kg' ? 'kilograms' : 'reps'} over time`} />
        </>
      ) : (
        <p className="muted">{shown === 'weight' ? 'Log your weight now and then to see it change here.' : 'Finish a workout to see your progress here.'}</p>
      )}
    </section>
  );
}

/** A small line chart: gridlines with values, one point per day, the latest one filled. */
export function LineChart({ points, label }: { points: readonly ProgressPoint[]; label: string }) {
  const W = 460, H = 150, L = 36, R = 448, T = 10, B = 124;
  const values = points.map((p) => p.value);
  let lo = Math.min(...values), hi = Math.max(...values);
  if (hi - lo < 1) { lo -= 1; hi += 1; }
  const step = niceStep((hi - lo) / 3);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const x = (i: number) => (points.length === 1 ? (L + R) / 2 : L + (i * (R - L)) / (points.length - 1));
  const y = (v: number) => B - ((v - lo) / (hi - lo)) * (B - T);
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  const every = Math.ceil(points.length / 6);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: from ${formatKg(values[0]!)} to ${formatKg(values.at(-1)!)}`}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={R} y1={y(v)} y2={y(v)} className="grid" />
          <text x={L - 8} y={y(v) + 4} textAnchor="end">{formatKg(v)}</text>
        </g>
      ))}
      <path d={points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ')} className="line" />
      {points.map((p, i) => <circle key={p.date} cx={x(i)} cy={y(p.value)} r={i === points.length - 1 ? 5 : 3.5} className={i === points.length - 1 ? 'pt last' : 'pt'} />)}
      {points.map((p, i) => (i % every === 0 || i === points.length - 1) && (
        <text key={`t${p.date}`} x={x(i)} y={H - 4} textAnchor={points.length > 1 && i === points.length - 1 ? 'end' : i === 0 && points.length > 1 ? 'start' : 'middle'}>{new Date(`${p.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</text>
      ))}
    </svg>
  );
}

function niceStep(raw: number): number {
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 0.1)));
  const n = raw / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * pow;
}

// ---- the workout in progress ----

function SessionView({ store, session, onFinish, onBack }: { store: WorkoutsStore; session: WorkoutSession; onFinish: () => void; onBack: () => void }) {
  const routine = store.routines.find((r) => r.id === session.routine_id) ?? null;
  const logged = store.sets.filter((s) => s.session_id === session.id);
  // The exercises: the routine's, plus any you added or logged in this workout.
  const [extra, setExtra] = useState<PlanItem[]>([]);
  const items = useMemo(() => {
    const list: PlanItem[] = routine ? planOf(routine) : [];
    for (const s of logged) if (!list.some((i) => i.exercise_id === s.exercise_id)) list.push({ exercise_id: s.exercise_id, sets: 1, reps: null });
    for (const e of extra) if (!list.some((i) => i.exercise_id === e.exercise_id)) list.push(e);
    return list;
  }, [routine, logged, extra]);
  const [at, setAt] = useState(0);
  const [adding, setAdding] = useState(items.length === 0);
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const elapsed = useClock(session.started_at);
  const item = items[Math.min(at, items.length - 1)];
  const next = items[at + 1];
  const nameOf = (id: string) => store.exercises.find((e) => e.id === id)?.name ?? 'Exercise';

  return (
    <div className="session">
      <header className="session-head">
        <button type="button" className="round-btn" aria-label="Back to Health" onClick={onBack}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></button>
        <div className="session-title"><span className="card-label">{session.name}</span><span className="clock" aria-label="Time so far">{elapsed}</span></div>
        {session.done_at ? <span className="muted">Done</span> : <button type="button" className="btn primary" onClick={onFinish}>Finish</button>}
      </header>

      {items.length > 1 && (
        <div className="row wrap-tight" role="group" aria-label="Exercises">
          {items.map((i, n) => <button key={i.exercise_id} type="button" className="chip" aria-pressed={n === at} onClick={() => setAt(n)}>{nameOf(i.exercise_id)}</button>)}
        </div>
      )}

      {item && (
        <ExerciseCard key={item.exercise_id} store={store} session={session} item={item} index={at} total={items.length} name={nameOf(item.exercise_id)}
          onLogged={() => setRestEnd(Date.now() + REST_SECONDS * 1000)} />
      )}

      {restEnd && <RestTimer end={restEnd} onChange={setRestEnd} />}

      {next && (
        <button type="button" className="food-row" onClick={() => setAt(at + 1)}>
          <span className="grow"><span className="task-meta">Up next</span><span className="task-title">{nameOf(next.exercise_id)} · {targetLabel(next)}</span></span>
          <svg className="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      )}

      {adding ? (
        <ExercisePicker store={store} onPick={(ex) => { setExtra((all) => [...all, { exercise_id: ex.id, sets: 3, reps: 10 }]); setAt(items.length); setAdding(false); }} onCancel={items.length ? () => setAdding(false) : undefined} />
      ) : (
        <button type="button" className="add-meal" onClick={() => setAdding(true)}>+ Add an exercise</button>
      )}
    </div>
  );
}

function ExerciseCard({ store, session, item, index, total, name, onLogged }: {
  store: WorkoutsStore; session: WorkoutSession; item: PlanItem; index: number; total: number; name: string; onLogged: () => void;
}) {
  const last = useMemo(() => lastSets(item.exercise_id, store.sets, store.sessions, session.id), [item.exercise_id, store.sets, store.sessions, session.id]);
  const logged = store.sets.filter((s) => s.session_id === session.id && s.exercise_id === item.exercise_id);
  const [rows, setRows] = useState<{ kg: string; reps: string }[]>(() => prefill(item, last).map((v) => ({ kg: formatKg(v.weight_kg), reps: String(v.reps) })));
  const count = Math.max(rows.length, ...logged.map((s) => s.set_index + 1));

  function tick(i: number) {
    const done = logged.find((s) => s.set_index === i);
    if (done) return store.unlogSet(done.id);
    const kg = parseKg(rows[i]?.kg ?? '0') ?? 0;
    const reps = Math.round(Number(rows[i]?.reps));
    if (!Number.isFinite(reps) || reps < 0 || reps > 1000) return;
    store.logSet(session, item.exercise_id, i, kg, reps);
    if (!session.started_at) store.updateSession(session.id, { started_at: new Date().toISOString() });
    onLogged();
  }
  const edit = (i: number, field: 'kg' | 'reps', value: string) => setRows((all) => {
    const copy = [...all];
    while (copy.length <= i) copy.push(copy[copy.length - 1] ?? { kg: '0', reps: '10' });
    copy[i] = { ...copy[i]!, [field]: value };
    return copy;
  });

  return (
    <section className="card" aria-labelledby="ex-title">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 id="ex-title" className="display ex-title">{name}</h2>
        {total > 1 && <span className="muted note">{index + 1} of {total} exercises</span>}
      </div>
      <p className="muted note">{last.length ? `Last time: ${setsLabel(last)}` : 'First time. Pick a weight you can do with good form.'}</p>
      {Array.from({ length: count }, (_, i) => {
        const done = logged.find((s) => s.set_index === i);
        const v: SetValue | null = done ? { weight_kg: done.weight_kg, reps: done.reps } : null;
        const row = rows[i] ?? rows[rows.length - 1] ?? { kg: '0', reps: '10' };
        return (
          <div key={i} className={done ? 'set-row done' : 'set-row'}>
            <span className="set-n">Set {i + 1}</span>
            <label className="set-field"><span className="sr-only">Set {i + 1} weight in kilograms</span>
              <input inputMode="decimal" value={v ? formatKg(v.weight_kg) : row.kg} disabled={!!done} onChange={(e) => edit(i, 'kg', e.target.value)} onFocus={(e) => e.target.select()} /><span>kg</span>
            </label>
            <span className="times" aria-hidden="true">×</span>
            <label className="set-field"><span className="sr-only">Set {i + 1} reps</span>
              <input inputMode="numeric" value={v ? String(v.reps) : row.reps} disabled={!!done} onChange={(e) => edit(i, 'reps', e.target.value)} onFocus={(e) => e.target.select()} /><span>reps</span>
            </label>
            <span className="grow" />
            <button type="button" className="check set-check" aria-pressed={!!done} aria-label={done ? `Set ${i + 1} done. Tap to undo` : `Set ${i + 1} done`} onClick={() => tick(i)}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" pathLength={1} /></svg>
            </button>
          </div>
        );
      })}
      <button type="button" className="add-meal small" onClick={() => setRows((all) => [...all, all[all.length - 1] ?? { kg: '0', reps: '10' }])}>+ Add a set</button>
    </section>
  );
}

function RestTimer({ end, onChange }: { end: number; onChange: (end: number | null) => void }) {
  const [nowMs, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);
  const left = Math.max(0, Math.ceil((end - nowMs) / 1000));
  useEffect(() => {
    if (left === 0) {
      navigator.vibrate?.(200);
      const t = window.setTimeout(() => onChange(null), 1500);
      return () => window.clearTimeout(t);
    }
  }, [left === 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = REST_SECONDS;
  const C = 2 * Math.PI * 52;
  return (
    <section className="card rest" aria-label="Rest">
      <span className="card-label">{left === 0 ? 'Next set' : 'Rest'}</span>
      <div className="rest-ring">
        <svg viewBox="0 0 132 132" aria-hidden="true">
          <circle cx="66" cy="66" r="52" className="track" />
          <circle cx="66" cy="66" r="52" className="fill" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, left / total))} transform="rotate(-90 66 66)" />
        </svg>
        <span className="display" role="timer" aria-live="off">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>
      </div>
      <div className="row" style={{ gap: 10 }}>
        <button type="button" className="chip" onClick={() => onChange(end + 30_000)}>+30 s</button>
        <button type="button" className="chip" onClick={() => onChange(null)}>Skip rest</button>
      </div>
    </section>
  );
}

function useClock(since: string | null): string {
  const [nowMs, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  if (!since) return '0:00';
  const s = Math.max(0, Math.floor((nowMs - Date.parse(since)) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Your exercises and the starter ones, searchable, plus making a new one. */
function ExercisePicker({ store, onPick, onCancel }: { store: WorkoutsStore; onPick: (exercise: Exercise) => void; onCancel?: () => void }) {
  const [q, setQ] = useState('');
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const match = (name: string) => words.every((w) => name.toLowerCase().split(/[\s-]+/).some((p) => p.startsWith(w)));
  const mine = store.exercises.filter((e) => match(e.name));
  const starters = STARTER_EXERCISES.filter((s) => !store.exercises.some((e) => e.starter_key === s.key || e.name.toLowerCase() === s.name.toLowerCase()) && match(s.name));
  const pickStarter = (s: StarterExercise) => onPick(store.addExercise(s.name, s.muscle_group, s));
  return (
    <section className="card picker-card" aria-label="Add an exercise">
      <label className="search-box">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <span className="sr-only">Find an exercise</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an exercise" autoFocus />
      </label>
      <ul className="ex-list">
        {mine.slice(0, 8).map((e) => <li key={e.id}><button type="button" onClick={() => onPick(e)}><span className="grow">{e.name}</span><span className="source mine">Mine</span></button></li>)}
        {starters.slice(0, 12).map((s) => <li key={s.key}><button type="button" onClick={() => pickStarter(s)}><span className="grow">{s.name}</span><span className="source">{s.muscle_group}</span></button></li>)}
        {q.trim() && <li><button type="button" className="new" onClick={() => onPick(store.addExercise(q, null))}>+ New exercise “{q.trim()}”</button></li>}
      </ul>
      {onCancel && <button type="button" className="link" onClick={onCancel}>Cancel</button>}
    </section>
  );
}

// ---- dialogs ----

function RoutineDialog({ store, routine, onClose }: { store: WorkoutsStore; routine: Routine | null; onClose: () => void }) {
  const [name, setName] = useState(routine?.name ?? '');
  const [days, setDays] = useState<number[]>(routine ? weekdaysOf(routine) : []);
  const [items, setItems] = useState<PlanItem[]>(routine ? planOf(routine) : []);
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const nameOf = (id: string) => store.exercises.find((e) => e.id === id)?.name ?? 'Exercise';
  const change = (i: number, patch: Partial<PlanItem>) => setItems((all) => all.map((it, j) => (j === i ? { ...it, ...patch } : it)));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setProblem('Give the routine a name, like “Push day”.');
    if (items.length === 0) return setProblem('Add at least one exercise.');
    store.saveRoutine({ name: name.trim().slice(0, 40), plan: items, weekdays: weekdaysText(days) }, routine);
    onClose();
  }
  return (
    <Modal title={routine ? 'Edit routine' : 'New routine'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field">Name
          <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Push day" data-autofocus />
        </label>
        <div className="field">Days
          <div className="row wrap-tight" role="group" aria-label="Days">
            {WEEK_ORDER.map((d) => (
              <button key={d} type="button" className="chip day-chip" aria-pressed={days.includes(d)} aria-label={WEEKDAY_NAME[d]}
                onClick={() => setDays((all) => (all.includes(d) ? all.filter((x) => x !== d) : [...all, d]))}>{WEEKDAY_SHORT[d]}</button>
            ))}
          </div>
          <span className="note muted">Each planned day shows up in Tasks, in a Workouts list.</span>
        </div>
        <div className="field">Exercises
          {items.map((it, i) => (
            <div key={it.exercise_id} className="plan-row">
              <span className="grow">{nameOf(it.exercise_id)}</span>
              <label className="mini"><span className="sr-only">Sets</span><input className="input" inputMode="numeric" value={it.sets} onChange={(e) => change(i, { sets: Math.max(1, Math.min(20, Number(e.target.value) || 1)) })} /></label>
              <span aria-hidden="true">×</span>
              <label className="mini"><span className="sr-only">Reps (blank for as many as you can)</span><input className="input" inputMode="numeric" value={it.reps ?? ''} placeholder="max" onChange={(e) => change(i, { reps: e.target.value.trim() ? Math.max(1, Math.min(100, Number(e.target.value) || 1)) : null })} /></label>
              <button type="button" className="chip-x" aria-label={`Remove ${nameOf(it.exercise_id)}`} onClick={() => setItems((all) => all.filter((_, j) => j !== i))}>×</button>
            </div>
          ))}
          {adding ? (
            <ExercisePicker store={store} onPick={(ex) => { if (!items.some((it) => it.exercise_id === ex.id)) setItems((all) => [...all, { exercise_id: ex.id, sets: 3, reps: 10 }]); setAdding(false); }} onCancel={() => setAdding(false)} />
          ) : (
            <button type="button" className="add-meal small" onClick={() => setAdding(true)}>+ Add an exercise</button>
          )}
        </div>
        {problem && <p className="note error" role="alert">{problem}</p>}
        <div className="actions">
          {routine && <button type="button" className="btn danger" onClick={() => { store.removeRoutine(routine.id); onClose(); }}>Delete routine</button>}
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}

function WeightDialog({ store, last, onClose }: { store: WorkoutsStore; last: number | null; onClose: () => void }) {
  const [kg, setKg] = useState(last ? formatKg(last) : '');
  const [problem, setProblem] = useState<string | null>(null);
  function submit(e: FormEvent) {
    e.preventDefault();
    const value = parseKg(kg);
    if (!value || value < 20 || value > 400) return setProblem('Enter your weight in kilograms, like 68.5.');
    store.logWeight(Math.round(value * 10) / 10);
    onClose();
  }
  return (
    <Modal title="Log your weight" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field">Weight today (kg)
          <input className="input narrow" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} data-autofocus onFocus={(e) => e.target.select()} />
        </label>
        {problem && <p className="note error" role="alert">{problem}</p>}
        <div className="actions">
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}


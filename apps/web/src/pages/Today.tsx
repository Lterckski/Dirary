import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  WEEKDAY_NAME, WEEKDAY_SHORT, amountInTask, dayCoach, dayComplete, dayTotals, dayWins, dueLabel, fixedThisMonth, formatKcal, formatPeso, glassesOn, greeting,
  localDate, planOf, routineMinutes, safeToSpend, taskWithoutAmount, todayView, todaysWorkout, topTasks, weekReview, weekStrip,
  type DayWin, type Task,
} from '@dirary/shared';
import { ADD_KINDS, useAddTo } from '../addTo';
import { confettiFrom } from '../confetti';
import { askForNudges, nudgePermission, planNudges } from '../inkNudges';
import { Mascot } from '../Mascot';
import { useHealth } from '../health/useHealth';
import { useWorkouts } from '../health/useWorkouts';
import { useBillTasks } from '../links/useBillTasks';
import { useWorkoutTasks } from '../links/useWorkoutTasks';
import { useMoney } from '../money/useMoney';
import { useTasks } from '../tasks/useTasks';
import { useTicking } from '../tasks/useTicking';
import { TxDialog } from './Money';
import { TaskRow, useToday } from './Tasks';

const toLocal = (iso: string) => localDate(new Date(iso));
/** Whole pesos for Ink's line and the scorecard: "₱1,187 left" reads better than "₱1,187.21 left". */
const pesos = (centavos: number) => formatPeso(Math.trunc(centavos / 100) * 100);
const pct = (part: number, whole: number | null | undefined) => (whole ? Math.max(0, Math.min(100, Math.round((part / whole) * 100))) : 0);

/** Today: one screen that answers "how's my day going?" across tasks, money and health. */
export function Today() {
  const tasks = useTasks();
  const money = useMoney();
  const health = useHealth();
  const workouts = useWorkouts();
  const bills = useBillTasks(tasks, money);
  const workoutLink = useWorkoutTasks(tasks, workouts);
  const addTo = useAddTo();
  const navigate = useNavigate();
  const today = useToday();
  const now = new Date();
  const hour = now.getHours();

  // Ticking here works exactly as on the Tasks tab: a workout's task ticks the workout, a bill's logs the payment,
  // and "Buy dog food ₱450" offers to log the ₱450.
  const [offer, setOffer] = useState<{ amount: number; note: string } | null>(null);
  const [logging, setLogging] = useState<{ amount: number; note: string } | null>(null);
  useEffect(() => {
    if (!offer) return;
    const timer = window.setTimeout(() => setOffer(null), 10000);
    return () => window.clearTimeout(timer);
  }, [offer]);
  const { phases, toggle } = useTicking((task: Task) => { if (!workoutLink.toggle(task)) bills.toggle(task); }, {
    onSaved: (task) => {
      const amount = bills.isBill(task) || money.accounts.length === 0 ? null : amountInTask(task.title);
      if (amount) setOffer({ amount, note: taskWithoutAmount(task.title) });
    },
  });

  const view = useMemo(() => todayView(tasks.tasks, today, toLocal), [tasks.tasks, today]);
  const safe = useMemo(() => safeToSpend(money.plan, money.fixed, money.transactions, today, toLocal), [money.plan, money.fixed, money.transactions, today]);
  const fixed = useMemo(() => fixedThisMonth(money.fixed, money.transactions, today, toLocal), [money.fixed, money.transactions, today]);
  const food = useMemo(() => dayTotals(health.logs, today), [health.logs, today]);
  const workout = useMemo(() => todaysWorkout(workouts.routines, workouts.sessions, today), [workouts.routines, workouts.sessions, today]);
  const strip = useMemo(() => weekStrip(workouts.routines, workouts.sessions, today), [workouts.routines, workouts.sessions, today]);
  const week = useMemo(() => weekReview({
    tasks: tasks.tasks, transactions: money.transactions, categories: money.categories, logs: health.logs,
    routines: workouts.routines, sessions: workouts.sessions, day: today, today, toLocalDate: toLocal,
  }), [tasks.tasks, money.transactions, money.categories, health.logs, workouts.routines, workouts.sessions, today]);

  const workoutName = workout.session?.name ?? workout.routine?.name ?? null;
  const input = {
    tasks: view, safe, fixed, food, goals: health.goals, hour,
    workout: { name: workoutName, done: !!workout.session?.done_at, started: !!workout.session?.started_at },
  };
  const coach = dayCoach(input, pesos);
  const wins = dayWins(input, pesos);
  const complete = dayComplete(wins);
  const loading = tasks.loading || money.loading || health.loading || workouts.loading;
  const errors = [tasks.error, money.error, health.error, workouts.error].filter(Boolean);

  // Finishing the day (the last task, the workout, the protein target): confetti from the scorecard, once a day.
  const scoreRef = useRef<HTMLElement>(null);
  const [party, setParty] = useState(false);
  const was = useRef<boolean | null>(null);
  useEffect(() => {
    if (loading) return;
    const before = was.current;
    was.current = complete;
    if (before !== false || !complete) return;
    let cheered = '';
    try { cheered = localStorage.getItem('dirary:day-cheered') ?? ''; } catch { /* private mode */ }
    if (cheered === today) return;
    try { localStorage.setItem('dirary:day-cheered', today); } catch { /* private mode */ }
    setParty(true);
    confettiFrom(scoreRef.current, { amount: 1.2 });
    window.setTimeout(() => setParty(false), 1400);
  }, [complete, loading, today]);

  // Ink's nudges and today's task reminders, as browser notifications with the bark, while Dirary is open.
  const [nudges, setNudges] = useState(nudgePermission);
  const kcalEaten = food.kcal;
  const workoutDone = !!workout.session?.done_at;
  useEffect(() => {
    if (loading || nudges !== 'granted') return;
    planNudges(tasks.tasks, { openTasks: view.overdue.length + view.dueToday.length, kcalEaten, workoutName, workoutDone });
  }, [loading, nudges, tasks.tasks, view, kcalEaten, workoutName, workoutDone]);

  // A ticked row stays in the list until it has folded away, then the next task takes its place.
  const shown = topTasks(view, 3);
  const left = view.overdue.length + view.dueToday.length;
  const more = left - shown.length;
  const nextBill = fixed.items.find((i) => !i.paid) ?? null;
  const plan = workout.routine ? planOf(workout.routine) : [];
  const glasses = glassesOn(health.water, today);

  return (
    <div className="page money today">
      <header className="hero today-hero">
        <div className="today-hero-text">
          <p className="hero-date">{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1 className="display">{greeting(hour)}</h1>
          <p className="hero-line" aria-live="polite">{loading ? 'Getting your day ready…' : coach.line}</p>
          <div className="add-row" role="group" aria-label="Add">
            {ADD_KINDS.map(({ kind, label }) => (
              <button key={kind} type="button" className="add-chip" onClick={() => addTo(kind)}>
                <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
                {label}
              </button>
            ))}
            {nudges === 'default' && (
              <button type="button" className="add-chip" onClick={() => { void askForNudges().then(() => setNudges(nudgePermission())); }}>
                Let Ink nudge me here
              </button>
            )}
          </div>
        </div>
      </header>

      {errors.length > 0 && <p className="note error" role="alert">{errors[0]}</p>}

      <div className="peek">
        <span className={party ? 'peek-ink hop' : 'peek-ink'} aria-hidden="true"><Mascot mood={loading ? 'happy' : complete ? 'cheer' : coach.mood} size={96} /></span>
        <section ref={scoreRef} className={party ? 'card safe score party' : 'card safe score'} aria-labelledby="score-title">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 id="score-title" className="card-label">Your day</h2>
            {!loading && <span className="muted note amount-note">{complete ? 'All done' : `${wins.filter((w) => w.applies && w.done && w.key !== 'money').length} of ${wins.filter((w) => w.applies && w.key !== 'money').length} done`}</span>}
          </div>
          <ul className="wins">
            {wins.map((w) => <Win key={w.key} win={w} loading={loading} />)}
          </ul>
        </section>
      </div>

      <div className="money-cols today-cols">
        <div className="money-col">
          <section className="card" aria-labelledby="t-tasks">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 id="t-tasks" className="card-label">Tasks</h2>
              <Link viewTransition className="card-link" to="/tasks">{view.total === 0 ? 'Open' : `${view.done} of ${view.total} done`}</Link>
            </div>
            {tasks.loading ? <p className="muted" role="status">Loading…</p> : shown.length === 0 ? (
              <p className="muted">{view.total > 0 ? 'Everything due today is done.' : 'Nothing due today.'}</p>
            ) : (
              <ul className="tasks">
                {shown.map((task) => (
                  <TaskRow key={task.id} task={task} list={tasks.lists.find((l) => l.id === task.list_id)} today={today} showDay={task.due_date !== today}
                    phase={phases[task.id]} onToggle={toggle} onOpen={() => navigate('/tasks')} />
                ))}
              </ul>
            )}
            <div className="row card-foot">
              {more > 0 ? <Link viewTransition className="card-link" to="/tasks">{more} more today</Link> : <span />}
              <button type="button" className="btn small" onClick={() => addTo('task')}>Add a task</button>
            </div>
          </section>

          <section className="card" aria-labelledby="t-money">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 id="t-money" className="card-label">{safe.ready ? (safe.safeToday < 0 ? 'Over today’s limit' : 'Safe to spend today') : 'Spent today'}</h2>
              <Link viewTransition className="card-link" to="/money">Money</Link>
            </div>
            {safe.ready ? (
              <>
                <p className={safe.safeToday < 0 ? 'display today-num late' : 'display today-num'}>{formatPeso(Math.abs(safe.safeToday))}</p>
                <div className={safe.safeToday < 0 ? 'bar thin over' : 'bar thin'} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct(safe.spentToday, safe.dailyLimit)} aria-label="Spent of today's limit">
                  <div style={{ width: `${safe.dailyLimit === 0 ? (safe.spentToday > 0 ? 100 : 0) : pct(safe.spentToday, safe.dailyLimit)}%` }} />
                </div>
                <p className="note muted amount-note">{formatPeso(safe.spentToday)} spent of {formatPeso(safe.dailyLimit)} · {formatPeso(Math.max(0, safe.leftThisMonth))} left this month</p>
              </>
            ) : (
              <>
                <p className="display today-num">{formatPeso(safe.spentToday)}</p>
                <p className="note muted">Set a monthly budget in Money to see what’s safe to spend each day.</p>
              </>
            )}
            {nextBill && (
              <div className="food-row static">
                <span className="grow">
                  <span className="task-title">{nextBill.expense.name}</span>
                  <span className={nextBill.dueIn < 0 ? 'task-meta late' : nextBill.dueIn <= 3 ? 'task-meta soon' : 'task-meta'}>{dueLabel(nextBill)}</span>
                </span>
                <span className="amount">{formatPeso(nextBill.expense.amount_centavos)}</span>
              </div>
            )}
            <div className="row card-foot">
              <span />
              <button type="button" className="btn small" onClick={() => addTo('expense')}>Log an expense</button>
            </div>
          </section>
        </div>

        <div className="money-col">
          <section className="card" aria-labelledby="t-food">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 id="t-food" className="card-label">Food</h2>
              <Link viewTransition className="card-link" to="/health" state={{ tab: 'food' }}>Health</Link>
            </div>
            <p className="display today-num">{formatKcal(food.kcal)}<span className="kcal-of">{health.goals?.kcal_target ? ` of ${formatKcal(health.goals.kcal_target)} kcal` : ' kcal'}</span></p>
            <div className="macro-grid">
              <div>
                <div className="row macro-head"><strong>Protein</strong><span className="muted">{Math.round(food.protein)}{health.goals?.protein_target_g ? ` / ${health.goals.protein_target_g}` : ''} g</span></div>
                <div className="bar thin protein" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct(food.protein, health.goals?.protein_target_g)} aria-label="Protein eaten"><div style={{ width: `${pct(food.protein, health.goals?.protein_target_g)}%` }} /></div>
              </div>
              <div>
                <div className="row macro-head"><strong>Water</strong><span className="muted">{glasses} of {health.goals?.water_glasses ?? 8} glasses</span></div>
                <div className="bar thin" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct(glasses, health.goals?.water_glasses ?? 8)} aria-label="Water drunk"><div style={{ width: `${pct(glasses, health.goals?.water_glasses ?? 8)}%` }} /></div>
              </div>
            </div>
            <div className="row card-foot">
              <button type="button" className="chip" onClick={() => health.tapWater(glasses + 1)}
                aria-label={`Add a glass of water. ${glasses} of ${health.goals?.water_glasses ?? 8} today.`}>+ Glass of water</button>
              <button type="button" className="btn small" onClick={() => addTo('food')}>Log food</button>
            </div>
          </section>

          <section className="card" aria-labelledby="t-workout">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 id="t-workout" className="card-label">Workout</h2>
              <span className="muted note amount-note">{week.workoutsDone} of {week.workoutsPlanned} this week</span>
            </div>
            <p className={workout.session?.done_at ? 'display today-num done' : 'display today-num'}>{workoutName ?? 'Rest day'}</p>
            <p className="note muted">
              {workout.session?.done_at ? 'Done. Nice work.' : plan.length ? `${plan.length} exercise${plan.length === 1 ? '' : 's'} · about ${routineMinutes(plan)} min` : workout.session ? 'Under way' : 'Recovery counts too.'}
            </p>
            <ol className="week small" aria-label="Workouts this week">
              {strip.map((d) => (
                <li key={d.date} className={d.isToday ? 'today' : ''}>
                  <span className="wd" aria-hidden="true">{WEEKDAY_SHORT[d.weekday]}</span>
                  <span className={`dot ${d.state}`} role="img" aria-label={`${WEEKDAY_NAME[d.weekday]}: ${{ done: 'done', planned: 'planned', missed: 'missed', rest: 'rest day', today: 'planned today' }[d.state]}`}>
                    {d.state === 'done' && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" /></svg>}
                    {d.state === 'rest' && '·'}
                  </span>
                </li>
              ))}
            </ol>
            <div className="row card-foot">
              <span />
              <button type="button" className={workoutName && !workout.session?.done_at ? 'btn small primary' : 'btn small'} onClick={() => addTo('workout')}>
                {workout.session?.done_at || !workoutName ? 'Open Workouts' : workout.session?.started_at ? 'Continue' : 'Start'}
              </button>
            </div>
          </section>
        </div>
      </div>

      <Link viewTransition className="card week-link" to="/week">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 className="card-label">This week</h2>
          <span className="card-link">Weekly review</span>
        </div>
        <dl className="recap-figures four">
          <div><dt>Tasks done</dt><dd>{week.tasksDone}</dd></div>
          <div><dt>Spent</dt><dd>{formatPeso(week.spent)}</dd></div>
          <div><dt>Workouts</dt><dd>{week.workoutsDone} of {week.workoutsPlanned}</dd></div>
          <div><dt>Food streak</dt><dd>{week.streak} day{week.streak === 1 ? '' : 's'}</dd></div>
        </dl>
      </Link>

      <p className="note muted today-foot"><Link viewTransition to="/data">Your data: export and backup</Link></p>

      {offer && (
        <div className="offer" role="status">
          <p>Log <strong>{formatPeso(offer.amount)}</strong> for {offer.note}?</p>
          <button type="button" className="btn primary small" onClick={() => { setLogging(offer); setOffer(null); }}>Log it</button>
          <button type="button" className="offer-close" aria-label="Not now" onClick={() => setOffer(null)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      )}
      {logging && <TxDialog tx={null} direction="out" amount={logging.amount} note={logging.note} store={money} onClose={() => setLogging(null)} />}
    </div>
  );
}

function Win({ win, loading }: { win: DayWin; loading: boolean }) {
  const state = loading || !win.applies ? 'off' : win.done ? 'done' : win.key === 'money' ? 'over' : 'open';
  return (
    <li className={`win ${state}`}>
      <span className="win-mark" aria-hidden="true">
        {state === 'done' && <svg viewBox="0 0 16 16"><path d="M3 8.5 6.5 12 13 4.5" /></svg>}
      </span>
      <span className="win-text">
        <span className="win-label">{win.label}</span>
        <span className="win-value">{loading ? '…' : win.value}</span>
      </span>
      <span className="sr-only">{state === 'done' ? (win.key === 'money' ? ', on track' : ', done') : state === 'over' ? ', over the limit' : state === 'off' ? '' : ', not done yet'}</span>
    </li>
  );
}

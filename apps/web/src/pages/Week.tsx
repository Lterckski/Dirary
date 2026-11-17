import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  WEEKDAY_NAME, WEEKDAY_SHORT, addDays, formatKcal, formatPeso, localDate, weekCoach, weekLabel, weekReview, weekStart, weekdayOf,
} from '@dirary/shared';
import { Mascot } from '../Mascot';
import { useHealth } from '../health/useHealth';
import { useWorkouts } from '../health/useWorkouts';
import { useMoney } from '../money/useMoney';
import { useTasks } from '../tasks/useTasks';

const toLocal = (iso: string) => localDate(new Date(iso));
const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

/** The weekly review: tasks done, money by category, workouts and the food streak, Monday to Sunday. */
export function Week() {
  const tasks = useTasks();
  const money = useMoney();
  const health = useHealth();
  const workouts = useWorkouts();
  const [params, setParams] = useSearchParams();
  const today = localDate();
  const thisMonday = weekStart(today);
  const asked = params.get('w');
  const monday = isDate(asked) && weekStart(asked) <= thisMonday ? weekStart(asked) : thisMonday;
  const go = (m: string) => setParams(m === thisMonday ? {} : { w: m }, { replace: true });

  const review = useMemo(() => weekReview({
    tasks: tasks.tasks, transactions: money.transactions, categories: money.categories, logs: health.logs,
    routines: workouts.routines, sessions: workouts.sessions, day: monday, today, toLocalDate: toLocal,
  }), [tasks.tasks, money.transactions, money.categories, health.logs, workouts.routines, workouts.sessions, monday, today]);
  const coach = weekCoach(review, formatPeso);
  const loading = tasks.loading || money.loading || health.loading || workouts.loading;
  const error = tasks.error || money.error || health.error || workouts.error;
  const maxTasks = Math.max(1, ...review.tasksPerDay);
  const maxCat = Math.max(1, ...review.byCategory.map((c) => c.amount));
  const diff = review.spent - review.spentLastWeek;

  return (
    <div className="page money week-page">
      <header className="hero">
        <div>
          <p className="hero-date">{review.isThisWeek ? 'This week' : monday === addDays(thisMonday, -7) ? 'Last week' : 'Weekly review'}</p>
          <h1 className="display">{weekLabel(review.monday)}</h1>
          <div className="week-nav" role="group" aria-label="Choose a week">
            <button type="button" className="add-chip" onClick={() => go(addDays(monday, -7))}>
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>Earlier
            </button>
            <button type="button" className="add-chip" onClick={() => go(addDays(monday, 7))} disabled={review.isThisWeek}>
              Later<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>
            </button>
          </div>
        </div>
      </header>

      {error && <p className="note error" role="alert">{error}</p>}

      <div className="peek">
        <span className="peek-ink" aria-hidden="true"><Mascot mood={loading ? 'happy' : coach.mood} size={96} /></span>
        <section className="card safe" aria-labelledby="w-sum">
          <h2 id="w-sum" className="card-label">The week in short</h2>
          <p className="week-line" aria-live="polite">{loading ? 'Adding up your week…' : coach.line}</p>
          <dl className="recap-figures four">
            <div><dt>Tasks done</dt><dd>{review.tasksDone}</dd></div>
            <div><dt>Spent</dt><dd>{formatPeso(review.spent)}</dd></div>
            <div><dt>Workouts</dt><dd className={review.workoutsPlanned > 0 && review.workoutsDone >= review.workoutsPlanned ? 'kept' : ''}>{review.workoutsDone} of {review.workoutsPlanned}</dd></div>
            <div><dt>Food streak</dt><dd>{review.streak} day{review.streak === 1 ? '' : 's'}</dd></div>
          </dl>
        </section>
      </div>

      <div className="money-cols">
        <div className="money-col">
          <section className="card" aria-labelledby="w-tasks">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 id="w-tasks" className="card-label">Tasks done</h2>
              <Link className="card-link" to="/tasks">Tasks</Link>
            </div>
            <ol className="day-bars">
              {review.days.map((d, i) => (
                <li key={d} className={d === today ? 'today' : ''}>
                  <span className="day-bar-n">{review.tasksPerDay[i] || ''}</span>
                  <span className="day-bar" style={{ height: `${Math.round((review.tasksPerDay[i]! / maxTasks) * 100)}%` }} />
                  <span className="wd" aria-hidden="true">{WEEKDAY_SHORT[weekdayOf(d)]}</span>
                  <span className="sr-only">{WEEKDAY_NAME[weekdayOf(d)]}: {review.tasksPerDay[i]} done</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="card" aria-labelledby="w-money">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 id="w-money" className="card-label">Money spent</h2>
              <Link className="card-link" to="/money">Money</Link>
            </div>
            <p className="display today-num">{formatPeso(review.spent)}</p>
            {review.spentLastWeek > 0 && (review.isThisWeek ? (
              <p className="note muted amount-note">{formatPeso(review.spentLastWeek)} in all of last week</p>
            ) : (
              <p className={diff > 0 ? 'note amount-note late-text' : 'note amount-note ok'}>
                {diff === 0 ? 'Same as the week before' : `${formatPeso(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than the week before`}
              </p>
            ))}
            {review.byCategory.length === 0 ? <p className="muted">No spending this week.</p> : (
              <ul className="cat-bars">
                {review.byCategory.map((c) => (
                  <li key={c.id ?? 'other'}>
                    <div className="row cat-head">
                      <span className="cat-dot" style={{ background: `var(--${c.color})` }} aria-hidden="true" />
                      <span className="grow">{c.name}</span>
                      <span className="amount">{formatPeso(c.amount)}</span>
                    </div>
                    <div className="bar thin" aria-hidden="true"><div style={{ width: `${Math.max(2, Math.round((c.amount / maxCat) * 100))}%`, background: `var(--${c.color})` }} /></div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="money-col">
          <section className="card" aria-labelledby="w-work">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 id="w-work" className="card-label">Workouts</h2>
              <Link className="card-link" to="/health" state={{ tab: 'workouts' }}>Health</Link>
            </div>
            <ol className="week" aria-label="Workouts this week">
              {review.workoutDays.map((d) => (
                <li key={d.date} className={d.isToday ? 'today' : ''}>
                  <span className="wd" aria-hidden="true">{WEEKDAY_SHORT[d.weekday]}</span>
                  <span className={`dot ${d.state}`} role="img" aria-label={`${WEEKDAY_NAME[d.weekday]}: ${{ done: 'done', planned: 'planned', missed: 'missed', rest: 'rest day', today: 'planned today' }[d.state]}`}>
                    {d.state === 'done' && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" /></svg>}
                    {d.state === 'rest' && '·'}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section className="card" aria-labelledby="w-food">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 id="w-food" className="card-label">Food</h2>
              <Link className="card-link" to="/health" state={{ tab: 'food' }}>Health</Link>
            </div>
            <dl className="recap-figures">
              <div><dt>Days logged</dt><dd>{review.foodDays} of {review.isThisWeek ? review.days.filter((d) => d <= today).length : 7}</dd></div>
              <div><dt>Average</dt><dd>{review.avgKcal === null ? '–' : `${formatKcal(review.avgKcal)} kcal`}</dd></div>
              <div><dt>Protein</dt><dd>{review.avgProtein === null ? '–' : `${Math.round(review.avgProtein)} g`}</dd></div>
            </dl>
            <p className="note muted">{review.streak > 0 ? `${review.streak} day${review.streak === 1 ? '' : 's'} in a row with food logged, up to today.` : 'Log a meal today to start a streak.'}</p>
          </section>
        </div>
      </div>
    </div>
  );
}

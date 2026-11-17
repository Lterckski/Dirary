import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import {
  FOOD_SOURCE_LABEL, MEALS, MEAL_LABEL, STARTER_FOODS, amountLabel, dayTotals, foodCoach, formatGrams, formatKcal, glassesOn, localDate, mealAt, nutrition,
  parseGrams, recentFoods, searchFoods, servingsOf,
  type Food, type FoodLog, type FoodMatch, type Meal, type Serving, type StarterFood,
} from '@dirary/shared';
import { Mascot } from '../Mascot';
import { useHealth, type HealthStore } from '../health/useHealth';
import { Modal } from '../ui';

type Pick = { food: Food | null; starter: StarterFood | null };
type Dialog =
  | { kind: 'log'; pick: Pick; grams?: number; meal?: Meal }
  | { kind: 'edit'; log: FoodLog }
  | { kind: 'food'; food: Food | null; name?: string; then?: 'log' }
  | { kind: 'goals' };

/** "1 cup · 158 g", or just "120 g" when it isn't a saved serving. */
function logAmount(log: FoodLog, foods: readonly Food[]): string {
  const food = foods.find((f) => f.id === log.food_id);
  const label = amountLabel(log.grams, food ? servingsOf(food) : []);
  return label.endsWith(' g') ? label : `${label} · ${formatGrams(log.grams)} g`;
}

const pct = (part: number, whole: number | null | undefined) => (whole ? Math.max(0, Math.min(100, Math.round((part / whole) * 100))) : 0);

export function Health() {
  const store = useHealth();
  const { foods, logs, goals, water, loading, error } = store;
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [query, setQuery] = useState('');
  const [forMeal, setForMeal] = useState<Meal | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const today = localDate();
  const hour = new Date().getHours();

  const totals = useMemo(() => dayTotals(logs, today), [logs, today]);
  const coach = foodCoach(totals, goals, hour);
  const again = useMemo(() => recentFoods(logs, foods), [logs, foods]);
  const glasses = glassesOn(water, today);
  const glassGoal = goals?.water_glasses ?? 8;

  // The floating + button starts a search.
  useEffect(() => {
    const focus = () => window.setTimeout(() => search.current?.focus(), 30);
    window.addEventListener('dirary:add', focus);
    return () => window.removeEventListener('dirary:add', focus);
  }, []);

  function choose(pick: Pick, grams?: number) {
    setQuery('');
    setDialog({ kind: 'log', pick, grams, meal: forMeal ?? undefined });
    setForMeal(null);
  }
  function addTo(meal: Meal) {
    setForMeal(meal);
    search.current?.focus();
    search.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  const kcalLeft = goals?.kcal_target ? Math.round(goals.kcal_target - totals.kcal) : null;

  return (
    <div className="page money health">
      <header className="hero">
        <div>
          <p className="hero-date">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1 className="display">Health</h1>
          <div className="segmented slide-switch hero-switch" role="group" aria-label="Health section" style={{ '--n': 2, '--i': 0 } as CSSProperties}>
            <button type="button" aria-pressed="true">Food</button>
            <button type="button" aria-pressed="false" disabled title="Workouts arrive in Phase 3b">Workouts</button>
          </div>
        </div>
      </header>

      {error && <p className="note error" role="alert">{error}</p>}
      {loading && !error && <p className="muted" role="status">Loading your food log…</p>}

      {!loading && !error && (
        <div className="money-cols">
          <div className="money-col">
            <div className="peek">
              <span className="peek-ink" aria-hidden="true"><Mascot mood="happy" size={96} /></span>
              <section className="card safe" aria-labelledby="kcal-title">
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <h2 id="kcal-title" className="card-label">{kcalLeft !== null ? (kcalLeft >= 0 ? 'Calories left today' : 'Calories over today') : 'Eaten today'}</h2>
                  <button type="button" className="round-btn" aria-label="Set daily targets" onClick={() => setDialog({ kind: 'goals' })}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" /></svg>
                  </button>
                </div>
                {kcalLeft !== null ? (
                  <>
                    <p className={kcalLeft < 0 ? 'display safe-amount late' : 'display safe-amount'}>{formatKcal(Math.abs(kcalLeft))}<span className="kcal-of"> of {formatKcal(goals!.kcal_target!)} kcal</span></p>
                    <div className={kcalLeft < 0 ? 'bar over' : 'bar'} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct(totals.kcal, goals!.kcal_target)} aria-label="Calories eaten">
                      <div style={{ width: `${pct(totals.kcal, goals!.kcal_target)}%` }} />
                    </div>
                  </>
                ) : (
                  <p className="display safe-amount">{formatKcal(totals.kcal)}<span className="kcal-of"> kcal</span></p>
                )}
                <div className="macro-grid">
                  <div>
                    <div className="row macro-head"><strong>Protein</strong><span className="muted">{Math.round(totals.protein)}{goals?.protein_target_g ? ` / ${goals.protein_target_g}` : ''} g</span></div>
                    <div className="bar thin protein" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct(totals.protein, goals?.protein_target_g)} aria-label="Protein eaten"><div style={{ width: `${pct(totals.protein, goals?.protein_target_g)}%` }} /></div>
                  </div>
                  <div>
                    <div className="row macro-head"><strong>Eaten</strong><span className="muted">{formatKcal(totals.kcal)} kcal</span></div>
                    <div className="bar thin eaten" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct(totals.kcal, goals?.kcal_target)} aria-label="Calories eaten"><div style={{ width: `${pct(totals.kcal, goals?.kcal_target)}%` }} /></div>
                  </div>
                </div>
                <div className="coach">
                  <span className="coach-badge"><Mascot mood={coach.mood} size={52} /></span>
                  <p aria-live="polite">{coach.line}</p>
                </div>
                {!goals?.kcal_target && !goals?.protein_target_g && <button type="button" className="btn primary" style={{ alignSelf: 'flex-start' }} onClick={() => setDialog({ kind: 'goals' })}>Set daily targets</button>}
              </section>
            </div>

            <section className="card water" aria-labelledby="water-title">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <h2 id="water-title" className="card-label">Water</h2>
                <span className="muted note amount-note">{glasses} of {glassGoal} glasses</span>
              </div>
              <div className="drops" role="group" aria-label="Glasses of water today" style={{ '--n': Math.max(glassGoal, glasses) } as CSSProperties}>
                {Array.from({ length: Math.max(glassGoal, glasses) }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" className="drop" aria-pressed={n <= glasses} aria-label={n <= glasses ? `Glass ${n}, drunk. Tap to undo` : `Glass ${n}`} onClick={() => store.tapWater(n)}>
                    <svg viewBox="0 0 22 28" aria-hidden="true"><path d="M11 2C11 2 3 12 3 18a8 8 0 0 0 16 0C19 12 11 2 11 2z" /></svg>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className="money-col">
            <FoodSearch inputRef={search} query={query} setQuery={setQuery} foods={foods} forMeal={forMeal}
              onPick={choose} onNew={(name) => { setQuery(''); setDialog({ kind: 'food', food: null, name, then: 'log' }); }} onCancelMeal={() => setForMeal(null)} />

            {again.length > 0 && (
              <section className="again" aria-labelledby="again-title">
                <h2 id="again-title" className="card-label">Again?</h2>
                <div className="row wrap-tight">
                  {again.map((r) => (
                    <button key={r.food.id} type="button" className="chip" onClick={() => choose({ food: r.food, starter: null }, r.grams)}>
                      + {r.food.name} <span className="muted">· {r.label}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="card meals" aria-label="Today's meals">
              {MEALS.map((meal) => {
                const m = totals.meals[meal];
                return (
                  <div key={meal} className="meal">
                    <div className="row meal-head"><h2>{MEAL_LABEL[meal]}</h2><span className="muted amount-note">{m.logs.length ? `${formatKcal(m.kcal)} kcal` : '—'}</span></div>
                    {m.logs.map((log) => (
                      <button key={log.id} type="button" className="food-row" onClick={() => setDialog({ kind: 'edit', log })}>
                        <span className="grow">
                          <span className="task-title">{log.name}</span>
                          <span className="task-meta">{logAmount(log, foods)} · {Math.round(log.protein_g)} g protein</span>
                        </span>
                        <span className="amount">{formatKcal(log.kcal)}</span>
                      </button>
                    ))}
                    {m.logs.length === 0 && <button type="button" className="add-meal" onClick={() => addTo(meal)}>+ Add {meal === 'snack' ? 'a snack' : meal}</button>}
                  </div>
                );
              })}
            </section>
          </div>
        </div>
      )}

      {dialog?.kind === 'log' && (
        <LogDialog store={store} pick={dialog.pick} grams={dialog.grams} meal={dialog.meal ?? mealAt(hour)} totals={totals}
          onEditFood={dialog.pick.food ? () => setDialog({ kind: 'food', food: dialog.pick.food }) : undefined} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'edit' && <EditLogDialog store={store} log={dialog.log} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'food' && (
        <FoodDialog store={store} food={dialog.food} name={dialog.name} onClose={() => setDialog(null)}
          onSaved={(food) => {
            // A new food is logged straight away; an edited one goes back to logging it.
            if (dialog.then === 'log' || dialog.food) setDialog({ kind: 'log', pick: { food, starter: null }, meal: forMeal ?? undefined });
            else setDialog(null);
            setForMeal(null);
          }} />
      )}
      {dialog?.kind === 'goals' && <GoalsDialog store={store} onClose={() => setDialog(null)} />}
    </div>
  );
}

function FoodSearch({ inputRef, query, setQuery, foods, forMeal, onPick, onNew, onCancelMeal }: {
  inputRef: React.RefObject<HTMLInputElement | null>; query: string; setQuery: (q: string) => void; foods: Food[]; forMeal: Meal | null;
  onPick: (pick: Pick) => void; onNew: (name: string) => void; onCancelMeal: () => void;
}) {
  const results: FoodMatch[] = useMemo(() => searchFoods(query, foods, STARTER_FOODS), [query, foods]);
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [query]);
  const options = query.trim() ? results.length + 1 : 0;
  function key(e: React.KeyboardEvent) {
    if (!options) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % options); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + options) % options); }
    if (e.key === 'Enter') { e.preventDefault(); pickAt(active); }
    if (e.key === 'Escape') setQuery('');
  }
  function pickAt(i: number) {
    const r = results[i];
    if (r) onPick({ food: r.food, starter: r.starter });
    else onNew(query.trim());
  }
  return (
    <div className="food-search">
      {forMeal && (
        <p className="note muted row" style={{ gap: 8 }}>Adding to <strong>{MEAL_LABEL[forMeal].toLowerCase()}</strong>. <button type="button" className="link" onClick={onCancelMeal}>Cancel</button></p>
      )}
      <label className="search-box">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <span className="sr-only">Search foods</span>
        <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={key} placeholder="Search foods: rice, adobo, egg" autoComplete="off"
          role="combobox" aria-expanded={options > 0} aria-controls="food-results" aria-activedescendant={options ? `food-opt-${active}` : undefined} />
      </label>
      {options > 0 && (
        <ul id="food-results" className="food-results" role="listbox" aria-label="Foods">
          {results.map((r, i) => (
            <li key={r.food?.id ?? r.starter!.key} id={`food-opt-${i}`} role="option" aria-selected={i === active} className={i === active ? 'on' : ''}
              onMouseDown={(e) => e.preventDefault()} onClick={() => pickAt(i)} onMouseEnter={() => setActive(i)}>
              <span className="grow">{r.name}</span>
              <span className={r.source === 'own' ? 'source mine' : 'source'}>{FOOD_SOURCE_LABEL[r.source]}</span>
            </li>
          ))}
          <li id={`food-opt-${results.length}`} role="option" aria-selected={active === results.length} className={active === results.length ? 'on new' : 'new'}
            onMouseDown={(e) => e.preventDefault()} onClick={() => pickAt(results.length)} onMouseEnter={() => setActive(results.length)}>
            + New food “{query.trim()}”
          </li>
        </ul>
      )}
    </div>
  );
}

/** Pick an amount (grams or a serving) and a meal, see what it adds up to, and log it. */
function LogDialog({ store, pick, grams: startGrams, meal: startMeal, totals, onEditFood, onClose }: {
  store: HealthStore; pick: Pick; grams?: number; meal: Meal; totals: ReturnType<typeof dayTotals>; onEditFood?: () => void; onClose: () => void;
}) {
  const source = pick.food ?? pick.starter;
  const servings: Serving[] = pick.food ? servingsOf(pick.food) : pick.starter?.servings ?? [];
  const [gramsText, setGramsText] = useState(String(startGrams ?? servings[0]?.grams ?? 100));
  const [meal, setMeal] = useState<Meal>(startMeal);
  const [naming, setNaming] = useState(false);
  const [servingName, setServingName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  if (!source) return null;
  const grams = parseGrams(gramsText);
  const n = grams ? nutrition(source, grams) : { kcal: 0, protein: 0 };
  const goals = store.goals;
  const kcalAfter = goals?.kcal_target ? Math.round(goals.kcal_target - totals.kcal - n.kcal) : null;
  const proteinAfter = goals?.protein_target_g ? Math.round(goals.protein_target_g - totals.protein - n.protein) : null;
  const step = (d: number) => setGramsText((t) => String(Math.max(1, Math.round((parseGrams(t) ?? 0) + d))));
  const sourceName = pick.food ? (pick.food.source === 'own' ? 'Your food' : FOOD_SOURCE_LABEL[pick.food.source]) : FOOD_SOURCE_LABEL[pick.starter!.source];

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!grams) return setProblem('Enter the grams, like 150.');
    const label = servingName.trim();
    const addServing = naming && label && !servings.some((s) => s.label.toLowerCase() === label.toLowerCase()) ? { label: label.slice(0, 30), grams } : null;
    store.logFood(pick, grams, meal, addServing);
    onClose();
  }

  return (
    <Modal title={source.name} onClose={onClose}>
      <form className="form log-form" onSubmit={submit}>
        <p className="note muted">{sourceName} · {formatKcal(source.kcal_per_100g)} kcal · {source.protein_per_100g} g protein per 100 g
          {onEditFood && <> · <button type="button" className="link inline" onClick={onEditFood}>Edit food</button></>}</p>
        <div className="grams-row">
          <button type="button" className="step" aria-label="10 grams less" onClick={() => step(-10)}>−</button>
          <label className="grams-field">
            <span className="sr-only">Grams</span>
            <input className="display" inputMode="decimal" value={gramsText} onChange={(e) => setGramsText(e.target.value)} data-autofocus onFocus={(e) => e.target.select()} />
            <span aria-hidden="true">g</span>
          </label>
          <button type="button" className="step" aria-label="10 grams more" onClick={() => step(10)}>+</button>
        </div>
        <div className="row wrap-tight" role="group" aria-label="Servings">
          {servings.map((s) => (
            <button key={s.label} type="button" className="chip" aria-pressed={grams === s.grams} onClick={() => { setGramsText(String(s.grams)); setNaming(false); }}>
              {s.label} <span className="muted">{formatGrams(s.grams)} g</span>
            </button>
          ))}
          {!naming && <button type="button" className="chip dashed" onClick={() => setNaming(true)} disabled={!grams}>+ Save {grams ? `${formatGrams(grams)} g` : 'this'} as a serving</button>}
        </div>
        {naming && (
          <label className="field">Name this serving ({grams ? formatGrams(grams) : '…'} g)
            <input className="input" value={servingName} maxLength={30} placeholder="1 plate, 1 piece, 1 scoop" onChange={(e) => setServingName(e.target.value)} />
          </label>
        )}
        <div className="two tiles-2">
          <div className="stat">
            <span className="card-label">Calories</span>
            <span className="display stat-num">{formatKcal(n.kcal)}</span>
            {kcalAfter !== null && <span className="muted note">{kcalAfter >= 0 ? `${formatKcal(kcalAfter)} left after this` : `${formatKcal(-kcalAfter)} over after this`}</span>}
          </div>
          <div className="stat">
            <span className="card-label">Protein</span>
            <span className="display stat-num protein">{Math.round(n.protein)} g</span>
            {proteinAfter !== null && <span className="muted note">{proteinAfter > 0 ? `${proteinAfter} g to go after this` : 'Target reached'}</span>}
          </div>
        </div>
        <div className="segmented slide-switch" role="radiogroup" aria-label="Meal" style={{ '--n': MEALS.length, '--i': MEALS.indexOf(meal) } as CSSProperties}>
          {MEALS.map((m) => <button key={m} type="button" role="radio" aria-checked={meal === m} aria-pressed={meal === m} onClick={() => setMeal(m)}>{m === 'snack' ? 'Snack' : MEAL_LABEL[m]}</button>)}
        </div>
        {problem && <p className="note error" role="alert">{problem}</p>}
        <div className="actions">
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!grams}>Add to {meal === 'snack' ? 'snacks' : MEAL_LABEL[meal].toLowerCase()}</button>
        </div>
      </form>
    </Modal>
  );
}

function EditLogDialog({ store, log, onClose }: { store: HealthStore; log: FoodLog; onClose: () => void }) {
  const food = store.foods.find((f) => f.id === log.food_id) ?? null;
  const servings = food ? servingsOf(food) : [];
  const [gramsText, setGramsText] = useState(formatGrams(log.grams));
  const [meal, setMeal] = useState<Meal>(log.meal);
  const grams = parseGrams(gramsText);
  const per = food ?? { kcal_per_100g: (log.kcal / log.grams) * 100, protein_per_100g: (log.protein_g / log.grams) * 100 };
  const n = grams ? nutrition(per, grams) : { kcal: 0, protein: 0 };
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!grams) return;
    store.updateLog(log, grams, meal);
    onClose();
  }
  return (
    <Modal title={log.name} onClose={onClose}>
      <form className="form log-form" onSubmit={submit}>
        <div className="grams-row">
          <button type="button" className="step" aria-label="10 grams less" onClick={() => setGramsText((t) => String(Math.max(1, Math.round((parseGrams(t) ?? 0) - 10))))}>−</button>
          <label className="grams-field">
            <span className="sr-only">Grams</span>
            <input className="display" inputMode="decimal" value={gramsText} onChange={(e) => setGramsText(e.target.value)} data-autofocus onFocus={(e) => e.target.select()} />
            <span aria-hidden="true">g</span>
          </label>
          <button type="button" className="step" aria-label="10 grams more" onClick={() => setGramsText((t) => String(Math.round((parseGrams(t) ?? 0) + 10)))}>+</button>
        </div>
        {servings.length > 0 && (
          <div className="row wrap-tight" role="group" aria-label="Servings">
            {servings.map((s) => <button key={s.label} type="button" className="chip" aria-pressed={grams === s.grams} onClick={() => setGramsText(String(s.grams))}>{s.label} <span className="muted">{formatGrams(s.grams)} g</span></button>)}
          </div>
        )}
        <p className="muted">{formatKcal(n.kcal)} kcal · {Math.round(n.protein)} g protein</p>
        <div className="segmented slide-switch" role="radiogroup" aria-label="Meal" style={{ '--n': MEALS.length, '--i': MEALS.indexOf(meal) } as CSSProperties}>
          {MEALS.map((m) => <button key={m} type="button" role="radio" aria-checked={meal === m} aria-pressed={meal === m} onClick={() => setMeal(m)}>{m === 'snack' ? 'Snack' : MEAL_LABEL[m]}</button>)}
        </div>
        <div className="actions">
          <button type="button" className="btn danger" onClick={() => { store.removeLog(log.id); onClose(); }}>Remove</button>
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary" disabled={!grams}>Save</button>
        </div>
      </form>
    </Modal>
  );
}

/** Add a food of your own (from its label, or PhilFCT by hand), or change one. */
function FoodDialog({ store, food, name: startName, onSaved, onClose }: { store: HealthStore; food: Food | null; name?: string; onSaved: (food: Food) => void; onClose: () => void }) {
  const [name, setName] = useState(food?.name ?? startName ?? '');
  const [kcal, setKcal] = useState(food ? String(food.kcal_per_100g) : '');
  const [protein, setProtein] = useState(food ? String(food.protein_per_100g) : '');
  const [servings, setServings] = useState<Serving[]>(food ? servingsOf(food) : []);
  const [newLabel, setNewLabel] = useState('');
  const [newGrams, setNewGrams] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  function addServing() {
    const g = parseGrams(newGrams);
    if (!newLabel.trim() || !g) return setProblem('Give the serving a name and its grams, like “1 plate” and 300.');
    setServings((all) => [...all, { label: newLabel.trim().slice(0, 30), grams: g }]);
    setNewLabel('');
    setNewGrams('');
    setProblem(null);
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    const k = Number(kcal.replace(',', '.'));
    const p = Number(protein.replace(',', '.'));
    if (!name.trim()) return setProblem('Give the food a name.');
    if (!kcal.trim() || !Number.isFinite(k) || k < 0 || k > 900) return setProblem('Calories per 100 g should be between 0 and 900.');
    if (!protein.trim() || !Number.isFinite(p) || p < 0 || p > 100) return setProblem('Protein per 100 g should be between 0 and 100.');
    onSaved(store.saveFood({ name: name.trim().slice(0, 80), kcal_per_100g: Math.round(k * 10) / 10, protein_per_100g: Math.round(p * 10) / 10, servings }, food));
  }
  return (
    <Modal title={food ? 'Edit food' : 'New food'} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field">Name
          <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} data-autofocus={!startName || undefined} />
        </label>
        <p className="note muted">From the nutrition label, or look it up in the Philippine Food Composition Tables (PhilFCT). Use the figures per 100 g.</p>
        <div className="two">
          <label className="field">Calories per 100 g
            <input className="input" inputMode="decimal" value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder="157" data-autofocus={startName ? true : undefined} />
          </label>
          <label className="field">Protein per 100 g (g)
            <input className="input" inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="17.6" />
          </label>
        </div>
        <div className="field">Servings
          {servings.length > 0 && (
            <div className="row wrap-tight">
              {servings.map((s, i) => (
                <span key={`${s.label}-${i}`} className="chip">{s.label} <span className="muted">{formatGrams(s.grams)} g</span>
                  <button type="button" className="chip-x" aria-label={`Remove ${s.label}`} onClick={() => setServings((all) => all.filter((_, j) => j !== i))}>×</button>
                </span>
              ))}
            </div>
          )}
          <div className="row serving-add">
            <input className="input" aria-label="Serving name" value={newLabel} maxLength={30} placeholder="1 plate" onChange={(e) => setNewLabel(e.target.value)} />
            <input className="input narrow" aria-label="Serving grams" inputMode="decimal" value={newGrams} placeholder="grams" onChange={(e) => setNewGrams(e.target.value)} />
            <button type="button" className="btn small" onClick={addServing}>Add</button>
          </div>
        </div>
        {problem && <p className="note error" role="alert">{problem}</p>}
        <div className="actions">
          {food && <button type="button" className="btn danger" onClick={() => { store.removeFood(food.id); onClose(); }}>Delete food</button>}
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary">{food ? 'Save' : 'Save and log'}</button>
        </div>
      </form>
    </Modal>
  );
}

function GoalsDialog({ store, onClose }: { store: HealthStore; onClose: () => void }) {
  const g = store.goals;
  const [kcal, setKcal] = useState(g?.kcal_target ? String(g.kcal_target) : '');
  const [protein, setProtein] = useState(g?.protein_target_g ? String(g.protein_target_g) : '');
  const [glasses, setGlasses] = useState(String(g?.water_glasses ?? 8));
  const [problem, setProblem] = useState<string | null>(null);
  function submit(e: FormEvent) {
    e.preventDefault();
    const k = kcal.trim() ? Math.round(Number(kcal.replace(/,/g, ''))) : null;
    const p = protein.trim() ? Math.round(Number(protein)) : null;
    const w = Math.round(Number(glasses));
    if (k !== null && !(k >= 500 && k <= 10000)) return setProblem('Calories should be between 500 and 10,000 a day.');
    if (p !== null && !(p >= 10 && p <= 500)) return setProblem('Protein should be between 10 and 500 g a day.');
    if (!(w >= 1 && w <= 30)) return setProblem('Glasses of water should be between 1 and 30.');
    store.saveGoals({ kcal_target: k, protein_target_g: p, water_glasses: w });
    onClose();
  }
  return (
    <Modal title="Daily targets" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="note muted">Your own numbers. Leave one blank to stop tracking it.</p>
        <div className="two">
          <label className="field">Calories (kcal)
            <input className="input" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value)} placeholder="2200" data-autofocus />
          </label>
          <label className="field">Protein (g)
            <input className="input" inputMode="numeric" value={protein} onChange={(e) => setProtein(e.target.value)} placeholder="120" />
          </label>
        </div>
        <label className="field">Glasses of water
          <input className="input narrow" inputMode="numeric" value={glasses} onChange={(e) => setGlasses(e.target.value)} />
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

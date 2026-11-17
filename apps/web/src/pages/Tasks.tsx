import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  GROUPINGS, GROUPING_LABEL, LIST_COLORS, PRIORITIES, PRIORITY_LABEL, RECURRENCES, RECURRENCE_LABEL, REMINDERS, REMINDER_LABEL, TaskDraft, addDays, asRecurrence, dayLabel,
  defaultReminder, doneView, fromNow, groupTasks, listView, localDate, parseQuickAdd, remindAt, reminderOf, timeLabel, todayCoach, todayView, upcomingView,
  type Grouping, type List, type ListColor, type Priority, type Recurrence, type Reminder, type Task,
} from '@dirary/shared';
import { Mascot } from '../Mascot';
import { Modal, openPicker } from '../ui';
import { useTasks } from '../tasks/useTasks';

type View = 'today' | 'upcoming' | 'inbox' | 'done' | string; // any other string is a list id
const FIXED_VIEWS = ['today', 'upcoming', 'inbox', 'done'];
const toLocal = (iso: string) => localDate(new Date(iso));

export function Tasks() {
  const store = useTasks();
  const { tasks, lists, loading, error } = store;
  const [view, setView] = useState<View>('today');
  const [editing, setEditing] = useState<Task | null>(null);
  const [managing, setManaging] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const [grouping, setGrouping] = useGrouping();
  const today = useToday();

  // The floating + button puts the cursor in the quick-add box.
  useEffect(() => {
    const focus = () => { setView((v) => (v === 'done' ? 'today' : v)); window.setTimeout(() => document.getElementById('quick-title')?.focus(), 30); };
    window.addEventListener('dirary:add', focus);
    return () => window.removeEventListener('dirary:add', focus);
  }, []);

  const listIds = useMemo(() => new Set(lists.map((l) => l.id)), [lists]);
  const listById = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists]);
  const activeList = listById.get(view);
  // If the list being viewed was deleted (here or on another device), fall back to Today.
  useEffect(() => {
    if (!FIXED_VIEWS.includes(view) && !loading && !listIds.has(view)) setView('today');
  }, [view, loading, listIds]);

  const todayData = useMemo(() => todayView(tasks, today, toLocal), [tasks, today]);
  const coach = todayCoach(todayData, justCompleted);

  function toggle(task: Task) {
    if (task.status !== 'done') {
      setJustCompleted(true);
      window.setTimeout(() => setJustCompleted(false), 2500);
    }
    store.toggleTask(task);
  }

  const row = (task: Task, showDay: boolean) => (
    <TaskRow key={task.id} task={task} list={task.list_id ? listById.get(task.list_id) : undefined} today={today} showDay={showDay} onToggle={toggle} onOpen={setEditing} />
  );

  let body;
  if (loading) body = <p className="muted" role="status">Loading your tasks…</p>;
  else if (view === 'today') {
    const { overdue, dueToday, doneToday, total, done } = todayData;
    const percent = total === 0 ? 0 : Math.round((done / total) * 100);
    body = (
      <>
        <section className="card progress" aria-label="Today's progress">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <p className="display progress-count">{done}<span> of {total} done</span></p>
            <p className="progress-pct">{percent}%</p>
          </div>
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Tasks done today">
            <div style={{ width: `${percent}%` }} />
          </div>
          <div className="coach">
            <span className="coach-badge"><Mascot mood={coach.mood} size={52} /></span>
            <p aria-live="polite">{coach.line}</p>
          </div>
        </section>
        {overdue.length > 0 && <Group title="Overdue" tone="red">{overdue.map((t) => row(t, true))}</Group>}
        {dueToday.length > 0 && (
          <div className="group-bar">
            <h2 className="group-title">Today</h2>
            <div className="segmented" role="group" aria-label="Group today's tasks by">
              <span className="segmented-label">Group by</span>
              {GROUPINGS.map((g) => (
                <button key={g} type="button" aria-pressed={grouping === g} onClick={() => setGrouping(g)}>{GROUPING_LABEL[g]}</button>
              ))}
            </div>
          </div>
        )}
        {groupTasks(dueToday, grouping, lists).map((g) => <Group key={g.key} title={g.title} sub>{g.tasks.map((t) => row(t, false))}</Group>)}
        {doneToday.length > 0 && (
          <button type="button" className="done-link" onClick={() => setView('done')}>
            {doneToday.length} done today · <span>View</span>
          </button>
        )}
      </>
    );
  } else if (view === 'upcoming') {
    const groups = upcomingView(tasks, today);
    body = groups.length === 0
      ? <Empty line="Nothing coming up in the next two weeks." />
      : groups.map((g) => <Group key={g.date} title={dayLabel(g.date, today)}>{g.tasks.map((t) => row(t, false))}</Group>);
  } else if (view === 'done') {
    const groups = doneView(tasks, today, toLocal);
    body = groups.length === 0
      ? <Empty line="Nothing finished in the last 30 days yet. Tick a task and it lands here." />
      : (
        <>
          {groups.map((g) => <Group key={g.date} title={dayLabel(g.date, today)}>{g.tasks.map((t) => row(t, false))}</Group>)}
          <p className="note muted">Showing the last 30 days. Untick a task to move it back.</p>
        </>
      );
  } else {
    const { open, done } = listView(tasks, view === 'inbox' ? null : view, listIds);
    body = open.length === 0
      ? <Empty line={done.length > 0 ? 'All done here. Finished tasks are in the Done tab.' : view === 'inbox' ? 'Your Inbox is empty. Tasks without a list land here.' : 'No tasks in this list yet.'} />
      : <Group title="To do">{open.map((t) => row(t, true))}</Group>;
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{dayLabel(today, today) === 'Today' ? new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : ''}</p>
          <h1 className="display">Tasks</h1>
        </div>
      </div>

      <nav className="chips" aria-label="Task views">
        <Chip label="Today" active={view === 'today'} onClick={() => setView('today')} count={todayData.overdue.length + todayData.dueToday.length} />
        <Chip label="Upcoming" active={view === 'upcoming'} onClick={() => setView('upcoming')} />
        <Chip label="Inbox" active={view === 'inbox'} onClick={() => setView('inbox')} />
        {lists.map((l) => <Chip key={l.id} label={l.name} dot={l.color} active={view === l.id} onClick={() => setView(l.id)} />)}
        <Chip label="Done" active={view === 'done'} onClick={() => setView('done')} />
        <button type="button" className="chip ghost" onClick={() => setManaging(true)}>Edit lists</button>
      </nav>

      {view !== 'done' && <QuickAdd
        key={view}
        defaultDate={view === 'today' ? today : view === 'upcoming' ? addDays(today, 1) : null}
        listId={activeList?.id ?? null}
        placeholder={activeList ? `Add a task to ${activeList.name}` : 'Add a task'}
        lists={lists}
        onAdd={store.addTask}
      />}

      {error && <p className="note error" role="alert">{error}</p>}
      {body}

      {editing && (
        <TaskDialog
          task={editing} lists={lists}
          onClose={() => setEditing(null)}
          onSave={(draft) => { store.updateTask(editing.id, draft); setEditing(null); }}
          onDelete={() => { store.removeTask(editing.id); setEditing(null); }}
        />
      )}
      {managing && <ListsDialog lists={lists} onClose={() => setManaging(false)} onAdd={store.addList} onRename={store.renameList} onDelete={store.removeList} />}
    </div>
  );
}

/** Today's date, refreshed when the tab regains focus so the view rolls over after midnight. */
function useToday(): string {
  const [today, setToday] = useState(() => localDate());
  const [, setTick] = useState(0); // redraws once a minute so "in 3 hours" stays right
  useEffect(() => {
    const refresh = () => { setToday(localDate()); setTick((n) => n + 1); };
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => { window.removeEventListener('focus', refresh); window.clearInterval(timer); };
  }, []);
  return today;
}

/** The chosen grouping, remembered in this browser. */
function useGrouping(): [Grouping, (g: Grouping) => void] {
  const [grouping, setGrouping] = useState<Grouping>(() => {
    try {
      const saved = window.localStorage.getItem('dirary.todayGrouping');
      return (GROUPINGS as readonly string[]).includes(saved ?? '') ? (saved as Grouping) : 'time';
    } catch {
      return 'time';
    }
  });
  return [grouping, (g) => {
    setGrouping(g);
    try { window.localStorage.setItem('dirary.todayGrouping', g); } catch { /* private mode: just don't remember */ }
  }];
}

function Chip({ label, active, onClick, dot, count }: { label: string; active: boolean; onClick: () => void; dot?: ListColor; count?: number }) {
  return (
    <button type="button" className="chip" aria-pressed={active} onClick={onClick}>
      {dot && <span className="dot" style={{ background: `var(--${dot})` }} aria-hidden="true" />}
      {label}
      {count ? <span className="chip-count">{count}</span> : null}
    </button>
  );
}

function Group({ title, tone, sub, children }: { title: string; tone?: 'red'; sub?: boolean; children: React.ReactNode }) {
  const Heading = sub ? 'h3' : 'h2';
  return (
    <section className="group">
      <Heading className={tone === 'red' ? 'group-title red' : sub ? 'group-title sub' : 'group-title'}>{title}</Heading>
      <ul className="tasks">{children}</ul>
    </section>
  );
}

function Empty({ line }: { line: string }) {
  return (
    <section className="card empty">
      <Mascot mood="sleepy" size={128} />
      <p className="muted">{line}</p>
    </section>
  );
}

function TaskRow({ task, list, today, showDay, onToggle, onOpen }: {
  task: Task; list: List | undefined; today: string; showDay: boolean; onToggle: (t: Task) => void; onOpen: (t: Task) => void;
}) {
  const done = task.status === 'done';
  const overdue = !done && task.due_date !== null && task.due_date < today;
  const repeat = asRecurrence(task.recurrence_rule);
  const meta = [list?.name, repeat ? RECURRENCE_LABEL[repeat] : null, task.remind_at ? 'Reminder set' : null].filter(Boolean).join(' · ');
  const when = [showDay && task.due_date ? dayLabel(task.due_date, today) : null, task.due_time ? timeLabel(task.due_time) : null].filter(Boolean).join(', ');
  const away = done ? null : fromNow(task.due_date, task.due_time);
  return (
    <li className={done ? 'task done' : 'task'}>
      <button
        type="button" role="checkbox" aria-checked={done} aria-label={`${task.title}, mark ${done ? 'not done' : 'done'}`}
        className={`check p${task.priority}`} onClick={() => onToggle(task)}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4.5" /></svg>
      </button>
      <button type="button" className="task-main" onClick={() => onOpen(task)} aria-label={`Edit ${task.title}`}>
        <span className="task-title">{task.title}</span>
        {done ? list && <span className="task-meta">{list.name}</span> : meta && <span className="task-meta">{meta}</span>}
      </button>
      {task.priority > 0 && !done && (
        <span className={`urgency u${task.priority}`}><span className="sr-only">Urgency: </span>{PRIORITY_LABEL[task.priority]}</span>
      )}
      {(when || away) && !done && (
        <button type="button" className={overdue || away?.endsWith('ago') ? 'when late' : 'when'} onClick={() => onOpen(task)} aria-label={`Due ${[when, away].filter(Boolean).join(', ')}. Change date or time for ${task.title}`}>
          {when}{when && away ? <span className="away"> · {away}</span> : away}
        </button>
      )}
    </li>
  );
}

function QuickAdd({ defaultDate, listId, placeholder, lists, onAdd }: { defaultDate: string | null; listId: string | null; placeholder: string; lists: List[]; onAdd: (d: TaskDraft) => void }) {
  const [text, setText] = useState('');
  const [date, setDate] = useState(defaultDate ?? '');
  const [time, setTime] = useState('');
  const [priority, setPriority] = useState<Priority>(0);
  const today = localDate();

  // Words in the text ("tomorrow 5pm !high every week") win over the fields; the fields fill in what the text doesn't say.
  const read = parseQuickAdd(text, new Date(), lists);
  const dueTime = read.due_time ?? (time || null);
  const dueDate = read.due_date ?? (date || (dueTime ? today : null));
  const urgency = read.priority || priority;
  const understood = [
    read.due_date || read.due_time ? [dueDate ? dayLabel(dueDate, today) : null, dueTime ? timeLabel(dueTime) : null].filter(Boolean).join(', ') : null,
    read.priority ? `${PRIORITY_LABEL[read.priority]} urgency` : null,
    read.recurrence ? RECURRENCE_LABEL[read.recurrence].toLowerCase() : null,
    read.list_id ? `in ${lists.find((l) => l.id === read.list_id)?.name}` : null,
  ].filter(Boolean);

  function submit(event: FormEvent) {
    event.preventDefault();
    const draft = TaskDraft.safeParse({
      title: read.title, notes: null, due_date: dueDate, due_time: dueTime, priority: urgency, list_id: read.list_id ?? listId,
      remind_at: remindAt(dueDate, dueTime, defaultReminder(dueTime)), recurrence_rule: read.recurrence,
    });
    if (!draft.success) return;
    onAdd(draft.data);
    setText('');
    setTime('');
    setPriority(0);
  }
  return (
    <form className="quick" onSubmit={submit}>
      <label className="sr-only" htmlFor="quick-title">New task</label>
      <input id="quick-title" className="input grow" value={text} maxLength={200} placeholder={placeholder} onChange={(e) => setText(e.target.value)} autoComplete="off" aria-describedby="quick-hint" />
      <label className="sr-only" htmlFor="quick-date">Due date</label>
      <input id="quick-date" className="input date" type="date" value={date} onClick={openPicker} onChange={(e) => setDate(e.target.value)} />
      <label className="sr-only" htmlFor="quick-time">Time</label>
      <input id="quick-time" className="input date" type="time" value={time} onClick={openPicker} onChange={(e) => setTime(e.target.value)} />
      <label className="sr-only" htmlFor="quick-urgency">Urgency</label>
      <select id="quick-urgency" className={`input urgency-pick u${priority}`} value={priority} onChange={(e) => setPriority(Number(e.target.value) as Priority)}>
        {PRIORITIES.map((p) => <option key={p} value={p}>{p === 0 ? 'Urgency' : PRIORITY_LABEL[p]}</option>)}
      </select>
      <button className="btn primary" type="submit" disabled={!text.trim()}>Add</button>
      <p id="quick-hint" className="quick-hint" aria-live="polite">
        {understood.length > 0
          ? <>Adds “{read.title}” · <strong>{understood.join(' · ')}</strong></>
          : 'Tip: type it naturally, like “Submit lab report tomorrow 5pm !high #school” or “Gym every weekday 6am”.'}
      </p>
    </form>
  );
}

function TaskDialog({ task, lists, onClose, onSave, onDelete }: { task: Task; lists: List[]; onClose: () => void; onSave: (d: TaskDraft) => void; onDelete: () => void }) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [date, setDate] = useState(task.due_date ?? '');
  const [time, setTime] = useState(task.due_time?.slice(0, 5) ?? '');
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [listId, setListId] = useState(task.list_id && lists.some((l) => l.id === task.list_id) ? task.list_id : '');
  const [repeat, setRepeat] = useState<Recurrence | ''>(asRecurrence(task.recurrence_rule) ?? '');
  const [reminder, setReminder] = useState<Reminder>(reminderOf(task));
  const [problem, setProblem] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    // Repeats and reminders need a date to hang on; a repeat with no date starts today.
    const dueDate = date || (repeat ? localDate() : null);
    const draft = TaskDraft.safeParse({
      title, notes: notes.trim() || null, due_date: dueDate, due_time: time || null, priority, list_id: listId || null,
      remind_at: remindAt(dueDate, time || null, reminder), recurrence_rule: repeat || null,
    });
    if (!draft.success) return setProblem(draft.error.issues[0]?.path[0] === 'due_time' ? 'Pick a date before setting a time.' : 'Give the task a title.');
    onSave(draft.data);
  }

  return (
    <Modal title="Edit task" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label className="field">Title
          <input className="input" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </label>
        <label className="field">Notes
          <textarea className="input area" value={notes} maxLength={2000} rows={3} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="two">
          <label className="field">Due date
            <input className="input" type="date" value={date} onClick={openPicker} onChange={(e) => { setDate(e.target.value); if (!e.target.value) setTime(''); }} />
          </label>
          <label className="field">Time
            <input className="input" type="time" value={time} onClick={openPicker} onChange={(e) => { setTime(e.target.value); if (e.target.value && !date) setDate(localDate()); if (e.target.value && reminder === 'none') setReminder('at'); }} />
          </label>
        </div>
        <div className="two">
          <label className="field">Urgency
            <select className="input" value={priority} onChange={(e) => setPriority(Number(e.target.value) as Priority)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
            </select>
          </label>
          <label className="field">List
            <select className="input" value={listId} onChange={(e) => setListId(e.target.value)}>
              <option value="">Inbox</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        </div>
        <div className="two">
          <label className="field">Repeat
            <select className="input" value={repeat} onChange={(e) => setRepeat(e.target.value as Recurrence | '')}>
              <option value="">Doesn't repeat</option>
              {RECURRENCES.map((r) => <option key={r} value={r}>{RECURRENCE_LABEL[r]}</option>)}
            </select>
          </label>
          <label className="field">Reminder
            <select className="input" value={date || repeat ? reminder : 'none'} disabled={!date && !repeat} onChange={(e) => setReminder(e.target.value as Reminder)}>
              {REMINDERS.map((r) => <option key={r} value={r}>{REMINDER_LABEL[r]}</option>)}
            </select>
          </label>
        </div>
        <p className="note muted">Reminders ring on your phone. With no time set, they go off at 9:00 AM.</p>
        {problem && <p className="note error" role="alert">{problem}</p>}
        <div className="actions">
          <button type="button" className="btn danger" onClick={onDelete}>Delete</button>
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}

function ListsDialog({ lists, onClose, onAdd, onRename, onDelete }: {
  lists: List[]; onClose: () => void; onAdd: (name: string, color: ListColor) => void; onRename: (id: string, name: string) => void; onDelete: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<ListColor>('inkBlue');
  function add(event: FormEvent) {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    onAdd(clean, color);
    setName('');
  }
  return (
    <Modal title="Lists" onClose={onClose}>
      {lists.length === 0 && <p className="muted">No lists yet. Try School, Work or Personal.</p>}
      <ul className="list-rows">
        {lists.map((l) => (
          <li key={l.id}>
            <span className="dot" style={{ background: `var(--${l.color})` }} aria-hidden="true" />
            <input
              className="input grow" defaultValue={l.name} maxLength={40} aria-label={`Name of list ${l.name}`}
              onBlur={(e) => { const next = e.target.value.trim(); if (next && next !== l.name) onRename(l.id, next); else e.target.value = l.name; }} />
            <button type="button" className="btn danger" onClick={() => onDelete(l.id)} aria-label={`Delete list ${l.name}`}>Delete</button>
          </li>
        ))}
      </ul>
      {lists.length > 0 && <p className="note muted">Deleting a list keeps its tasks. They move to the Inbox.</p>}
      <form className="form" onSubmit={add}>
        <label className="field">New list
          <input className="input" value={name} maxLength={40} placeholder="School" onChange={(e) => setName(e.target.value)} />
        </label>
        <fieldset className="swatches">
          <legend className="sr-only">Colour</legend>
          {LIST_COLORS.map((c) => (
            <label key={c} className="swatch">
              <input type="radio" name="list-color" className="sr-only" checked={color === c} onChange={() => setColor(c)} />
              <span style={{ background: `var(--${c})` }} aria-hidden="true" />
              <span className="sr-only">{COLOR_NAMES[c]}</span>
            </label>
          ))}
        </fieldset>
        <div className="actions">
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>Done</button>
          <button type="submit" className="btn primary" disabled={!name.trim()}>Add list</button>
        </div>
      </form>
    </Modal>
  );
}

const COLOR_NAMES: Record<ListColor, string> = { inkBlue: 'Ink blue', tongue: 'Pink', amber: 'Amber', red: 'Red', muted: 'Grey' };

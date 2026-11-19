import { useEffect, useRef, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { ADD_KINDS, markDirection, useAddTo } from './addTo';
import { HealthIcon, MoneyIcon, TasksIcon, TodayIcon } from './icons';
import { Mascot } from './Mascot';
import { ReminderBar } from './ReminderBar';
import { SetupNeeded, SignIn } from './pages/SignIn';
import { Health } from './pages/Health';
import { Money } from './pages/Money';
import { Tasks } from './pages/Tasks';
import { Data } from './pages/Data';
import { Today } from './pages/Today';
import { Week } from './pages/Week';
import { supabase } from './supabase';
import { useSession } from './useSession';

export function App() {
  const session = useSession();
  if (!supabase) return <SetupNeeded />;
  if (session === undefined) return null;
  if (session === null) return <SignIn />;
  return <Shell />;
}

function Shell() {
  const { pathname } = useLocation();
  const addTo = useAddTo();
  const [menu, setMenu] = useState(false);
  useEffect(() => { setMenu(false); }, [pathname]);
  /** The + button adds to the screen you're on. On Today it asks what to add. */
  function add() {
    if (pathname === '/tasks' || pathname === '/money' || pathname === '/health') return window.dispatchEvent(new Event('dirary:add'));
    if (pathname === '/') return setMenu((m) => !m);
    addTo('task');
  }

  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <div className="brand display">
          <span className="brand-badge"><Mascot mood="coach" size={40} /></span>
          Dirary
        </div>
        <NavLink viewTransition onClick={() => markDirection('/')} to="/" end><TodayIcon />Today</NavLink>
        <NavLink viewTransition onClick={() => markDirection('/tasks')} to="/tasks"><TasksIcon />Tasks</NavLink>
        <button type="button" className="fab" aria-label={pathname === '/money' ? 'Add a transaction' : pathname === '/health' ? 'Log food' : pathname === '/' ? 'Add something' : 'Add a task'}
          aria-expanded={pathname === '/' ? menu : undefined} aria-haspopup={pathname === '/' ? 'menu' : undefined} onClick={add}>
          <svg viewBox="0 0 28 28" aria-hidden="true"><path d="M14 5v18M5 14h18" /></svg>
        </button>
        <NavLink viewTransition onClick={() => markDirection('/money')} to="/money"><MoneyIcon />Money</NavLink>
        <NavLink viewTransition onClick={() => markDirection('/health')} to="/health"><HealthIcon />Health</NavLink>
        <NavLink viewTransition to="/data" className="nav-small" style={{ marginTop: 'auto' }}>Your data</NavLink>
        <button className="link" type="button" style={{ textAlign: 'left' }} onClick={() => supabase?.auth.signOut()}>
          Sign out
        </button>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/money" element={<Money />} />
          <Route path="/health" element={<Health />} />
          <Route path="/week" element={<Week />} />
          <Route path="/data" element={<Data />} />
        </Routes>
      </main>
      <ReminderBar />
      {menu && <AddMenu onPick={(kind) => { setMenu(false); addTo(kind); }} onClose={() => setMenu(false)} />}
    </div>
  );
}

/** On Today the + asks what to add. Escape or a tap outside closes it; focus starts on the first choice. */
function AddMenu({ onPick, onClose }: { onPick: (kind: (typeof ADD_KINDS)[number]['kind']) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const first = ref.current?.querySelector('button');
    first?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); (document.querySelector('.fab') as HTMLElement | null)?.focus(); }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const items = [...(ref.current?.querySelectorAll('button') ?? [])];
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
      e.preventDefault();
    };
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node) && !(e.target as Element).closest('.fab')) onClose(); };
    window.addEventListener('keydown', key);
    window.addEventListener('pointerdown', away);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', away); };
  }, [onClose]);
  return (
    <div ref={ref} className="add-menu" role="menu" aria-label="Add">
      {ADD_KINDS.map(({ kind, label }) => (
        <button key={kind} type="button" role="menuitem" onClick={() => onPick(kind)}>{label}</button>
      ))}
    </div>
  );
}

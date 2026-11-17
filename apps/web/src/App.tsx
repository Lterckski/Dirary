import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { HealthIcon, MoneyIcon, TasksIcon, TodayIcon } from './icons';
import { Mascot } from './Mascot';
import { SetupNeeded, SignIn } from './pages/SignIn';
import { Health } from './pages/Health';
import { Money } from './pages/Money';
import { Tasks } from './pages/Tasks';
import { Today } from './pages/Today';
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
  const navigate = useNavigate();
  /** The + button adds to the screen you're on; from Today it starts a task. */
  function add() {
    const here = pathname === '/tasks' || pathname === '/money' || pathname === '/health';
    if (!here) navigate('/tasks');
    window.setTimeout(() => window.dispatchEvent(new Event('dirary:add')), here ? 0 : 80);
  }

  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <div className="brand display">
          <span className="brand-badge"><Mascot mood="coach" size={40} /></span>
          Dirary
        </div>
        <NavLink to="/" end><TodayIcon />Today</NavLink>
        <NavLink to="/tasks"><TasksIcon />Tasks</NavLink>
        <button type="button" className="fab" aria-label={pathname === '/money' ? 'Add a transaction' : pathname === '/health' ? 'Log food' : 'Add a task'} onClick={add}>
          <svg viewBox="0 0 28 28" aria-hidden="true"><path d="M14 5v18M5 14h18" /></svg>
        </button>
        <NavLink to="/money"><MoneyIcon />Money</NavLink>
        <NavLink to="/health"><HealthIcon />Health</NavLink>
        <button className="link" type="button" style={{ marginTop: 'auto', textAlign: 'left' }} onClick={() => supabase?.auth.signOut()}>
          Sign out
        </button>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/money" element={<Money />} />
          <Route path="/health" element={<Health />} />
        </Routes>
      </main>
    </div>
  );
}

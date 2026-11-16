import { NavLink, Route, Routes } from 'react-router-dom';
import { HealthIcon, MoneyIcon, TasksIcon, TodayIcon } from './icons';
import { Mascot } from './Mascot';
import { ComingSoon } from './pages/ComingSoon';
import { SetupNeeded, SignIn } from './pages/SignIn';
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

  return (
    <div className="shell">
      <nav className="nav" aria-label="Main">
        <div className="brand display">
          <span className="brand-badge"><Mascot mood="coach" size={40} /></span>
          Dirary
        </div>
        <NavLink to="/" end><TodayIcon />Today</NavLink>
        <NavLink to="/tasks"><TasksIcon />Tasks</NavLink>
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
          <Route path="/health" element={<ComingSoon title="Health" phase="Phase 3" line="Meals and workouts arrive in Phase 3." />} />
        </Routes>
      </main>
    </div>
  );
}

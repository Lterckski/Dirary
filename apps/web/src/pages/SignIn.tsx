import { useState, type FormEvent } from 'react';
import { Mascot } from '../Mascot';
import { supabase } from '../supabase';

export function SetupNeeded() {
  return (
    <div className="center">
      <div className="card">
        <Mascot mood="sleepy" size={120} />
        <h1 className="display" style={{ fontSize: 30 }}>Connect Supabase</h1>
        <p className="muted">
          Copy <code>apps/web/.env.example</code> to <code>.env.local</code>, fill in your project URL and publishable key, then restart the dev server. The README has the steps.
        </p>
      </div>
    </div>
  );
}

export function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <div className="center">
      <form className="card" onSubmit={submit}>
        <Mascot mood="happy" size={120} />
        <h1 className="display" style={{ fontSize: 34 }}>Dirary</h1>
        <p className="muted">Sign in to your diary of tasks, money and health.</p>
        <label className="field">
          Email
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          Password
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="note error" role="alert">{error}</p>}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}

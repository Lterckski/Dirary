import { Mascot } from '../Mascot';

export function ComingSoon({ title, phase, line }: { title: string; phase: string; line: string }) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{phase}</p>
          <h1 className="display">{title}</h1>
        </div>
      </div>
      <section className="card" style={{ alignItems: 'center', textAlign: 'center', padding: 40 }}>
        <Mascot mood="sleepy" size={160} />
        <p className="muted">{line}</p>
      </section>
    </div>
  );
}

import { SNOOZE_MINUTES } from '@dirary/shared';
import { Mascot } from './Mascot';
import { cancelReminder, snoozeReminder, useRingingReminders } from './inkNudges';

/** Task reminders that went off, each with "Remind me in 15 min" and "Cancel", like on the phone. */
export function ReminderBar() {
  const reminders = useRingingReminders();
  if (reminders.length === 0) return null;
  return (
    <div className="reminder-bar" role="region" aria-label="Reminders" aria-live="polite">
      {reminders.map((r) => (
        <div key={r.taskId} className="reminder-card">
          <Mascot mood="coach" size={48} />
          <div className="reminder-text">
            <strong>{r.title}</strong>
            <span className="muted">{r.body}</span>
          </div>
          <div className="chips">
            <button type="button" className="chip" onClick={() => snoozeReminder(r.taskId)}>Remind me in {SNOOZE_MINUTES} min</button>
            <button type="button" className="chip" onClick={() => cancelReminder(r.taskId)}>Cancel</button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Date helpers that work in the device's local time, so "today" means today in Cebu, not in UTC. */

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD for a moment, in local time. */
export function localDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return localDate(new Date(y, m - 1, d + days));
}

/** "Today", "Tomorrow", "Yesterday", or e.g. "Wed, Nov 18". */
export function dayLabel(date: string, today: string = localDate()): string {
  if (date === today) return 'Today';
  if (date === addDays(today, 1)) return 'Tomorrow';
  if (date === addDays(today, -1)) return 'Yesterday';
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const value = new Date(y, m - 1, d);
  const sameYear = y === Number(today.slice(0, 4));
  return value.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** "5:00 PM" from "17:00" or "17:00:00". */
export function timeLabel(time: string): string {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${pad(m)} ${suffix}`;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/**
 * How far away a due date is: "in 3 hours", "in 2 days", "45 min ago".
 * With a time it counts to that moment; without one it counts whole days. Returns null for an untimed task due today.
 */
export function fromNow(dueDate: string | null, dueTime: string | null, now: Date = new Date()): string | null {
  if (!dueDate) return null;
  const [y, m, d] = dueDate.split('-').map(Number) as [number, number, number];
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000);
  const phrase = (amount: string, past: boolean) => (past ? `${amount} ago` : `in ${amount}`);

  if (dueTime) {
    const [hh, mm] = dueTime.split(':').map(Number) as [number, number];
    const diff = new Date(y, m - 1, d, hh, mm).getTime() - now.getTime();
    const minutes = Math.round(Math.abs(diff) / 60_000);
    if (minutes < 1) return 'now';
    if (minutes < 60) return phrase(`${minutes} min`, diff < 0);
    if (minutes < 24 * 60) return phrase(plural(Math.round(minutes / 60), 'hour'), diff < 0);
  }
  if (days === 0) return dueTime ? phrase(plural(24, 'hour'), false) : null;
  return phrase(plural(Math.abs(days), 'day'), days < 0);
}

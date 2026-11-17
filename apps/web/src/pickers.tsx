/**
 * Date and time fields drawn in Dirary's own style, replacing the browser's pickers (which can't be themed).
 * Each is a button that opens a small popover under it. The popover uses the browser's popover API, so a
 * click outside or Escape closes it, and it works inside a <dialog>. Values match the native inputs:
 * dates "YYYY-MM-DD", times "HH:MM" (24-hour), "" for none.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { addDays, localDate } from '@dirary/shared';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parts = (iso: string) => ({ y: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)) - 1, d: Number(iso.slice(8, 10)) });
const dateOf = (iso: string) => { const p = parts(iso); return new Date(p.y, p.m, p.d); };

/** "Tue, Nov 17" this year, "Tue, Nov 17, 2027" otherwise. */
export function dateText(iso: string): string {
  const d = dateOf(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** "5:00 PM" from "17:00". */
export function timeText(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 || 12}:${hhmm.slice(3, 5)} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Shared popover plumbing: open under the trigger, keep it on screen, track whether it's open. */
function usePopover() {
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const el = pop.current;
    if (!el) return;
    const onToggle = (e: Event) => setOpen((e as ToggleEvent).newState === 'open');
    el.addEventListener('toggle', onToggle);
    return () => el.removeEventListener('toggle', onToggle);
  }, []);
  const place = () => {
    const t = trigger.current?.getBoundingClientRect();
    const el = pop.current;
    if (!t || !el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(8, Math.min(t.left, window.innerWidth - w - 8));
    const below = t.bottom + 8;
    const top = below + h > window.innerHeight - 8 && t.top - h - 8 > 8 ? t.top - h - 8 : below;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  };
  const show = () => {
    const el = pop.current;
    if (!el) return;
    if (el.matches(':popover-open')) return el.hidePopover();
    el.showPopover();
    place();
  };
  const hide = () => { if (pop.current?.matches(':popover-open')) pop.current.hidePopover(); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  return { trigger, pop, open, show, hide };
}

const CalendarIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
);
const ClockIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
);
const Chevron = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d={dir === 'left' ? 'M14.5 6l-6 6 6 6' : 'M9.5 6l6 6-6 6'} /></svg>
);

/** The label above a field, or a hidden one, plus the field. A div, not a <label>, so clicks in the popover stay there. */
function Field({ label, hideLabel, labelId, className, children }: { label: string; hideLabel?: boolean; labelId: string; className?: string; children: ReactNode }) {
  return (
    <div className={['field', 'picker', className].filter(Boolean).join(' ')}>
      <span id={labelId} className={hideLabel ? 'sr-only' : undefined}>{label}</span>
      {children}
    </div>
  );
}

export function DatePicker({ value, onChange, label, hideLabel, placeholder = 'Date', clearable = true, className }: {
  value: string; onChange: (iso: string) => void; label: string; hideLabel?: boolean; placeholder?: string; clearable?: boolean; className?: string;
}) {
  const id = useId();
  const { trigger, pop, open, show, hide } = usePopover();
  const today = localDate();
  const [view, setView] = useState(() => parts(value || today));
  const [focus, setFocus] = useState(value || today);
  const grid = useRef<HTMLDivElement>(null);

  // Each time it opens, start on the chosen date (or today).
  useEffect(() => {
    if (!open) return;
    const start = value || today;
    setView(parts(start));
    setFocus(start);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (open) grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus();
  }, [open, focus]);

  const pick = (iso: string) => { onChange(iso); hide(); };
  const move = (iso: string) => { setFocus(iso); const p = parts(iso); setView({ y: p.y, m: p.m, d: 1 }); };
  const shiftMonth = (by: number) => setView((v) => { const d = new Date(v.y, v.m + by, 1); return { y: d.getFullYear(), m: d.getMonth(), d: 1 }; });
  function onKey(e: KeyboardEvent) {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (e.key in step) { e.preventDefault(); move(addDays(focus, step[e.key]!)); }
    else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      const d = dateOf(focus);
      const next = new Date(d.getFullYear(), d.getMonth() + (e.key === 'PageUp' ? -1 : 1), 1);
      const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      move(toIso(next.getFullYear(), next.getMonth(), Math.min(d.getDate(), last)));
    }
  }

  const first = new Date(view.y, view.m, 1);
  const start = addDays(toIso(view.y, view.m, 1), -first.getDay());
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weeks = Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7));
  const quick: [string, string][] = [['Today', today], ['Tomorrow', addDays(today, 1)], ['Next week', addDays(today, 7)]];

  return (
    <Field label={label} hideLabel={hideLabel} labelId={`${id}-l`} className={className}>
      <button ref={trigger} type="button" className={value ? 'input picker-trigger' : 'input picker-trigger blank'} onClick={show}
        aria-labelledby={`${id}-l ${id}-v`} aria-haspopup="dialog" aria-expanded={open}>
        <span id={`${id}-v`}>{value ? dateText(value) : placeholder}</span>
        <CalendarIcon />
      </button>
      <div ref={pop} popover="auto" className="picker-pop" role="dialog" aria-label={`Choose ${label.toLowerCase()}`}>
        <div className="cal-head">
          <button type="button" className="cal-nav" onClick={() => shiftMonth(-1)} aria-label="Previous month"><Chevron dir="left" /></button>
          <p className="cal-title" aria-live="polite">{MONTHS[view.m]} <span>{view.y}</span></p>
          <button type="button" className="cal-nav" onClick={() => shiftMonth(1)} aria-label="Next month"><Chevron dir="right" /></button>
        </div>
        <div ref={grid} className="cal-grid" role="grid" aria-label={`${MONTHS[view.m]} ${view.y}`} onKeyDown={onKey}>
          <div role="row" className="cal-row">{WEEKDAYS.map((d, i) => <span key={i} role="columnheader" className="cal-wd" aria-label={WEEKDAY_NAMES[i]}>{d}</span>)}</div>
          {weeks.map((week, w) => (
            <div key={w} role="row" className="cal-row">
              {week.map((iso) => {
                const p = parts(iso);
                const cls = ['cal-day', p.m !== view.m && 'out', iso === today && 'today', iso === value && 'on'].filter(Boolean).join(' ');
                return (
                  <span key={iso} role="gridcell" aria-selected={iso === value}>
                    <button type="button" className={cls} data-day={iso} tabIndex={iso === focus ? 0 : -1} onClick={() => pick(iso)} onFocus={() => setFocus(iso)}
                      aria-label={`${dateOf(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}${iso === today ? ', today' : ''}`}>
                      {p.d}
                    </button>
                  </span>
                );
              })}
            </div>
          ))}
        </div>
        <div className="picker-foot">
          {quick.map(([name, iso]) => <button key={name} type="button" className={iso === value ? 'chip on' : 'chip'} onClick={() => pick(iso)}>{name}</button>)}
          <span className="picker-gap" />
          {clearable && value && <button type="button" className="link" onClick={() => pick('')}>Clear</button>}
        </div>
      </div>
    </Field>
  );
}

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = ['00', '15', '30', '45'];
const PRESETS: [string, string][] = [['9 AM', '09:00'], ['Noon', '12:00'], ['5 PM', '17:00'], ['8 PM', '20:00']];

export function TimePicker({ value, onChange, label, hideLabel, placeholder = 'Time', clearable = true, className }: {
  value: string; onChange: (hhmm: string) => void; label: string; hideLabel?: boolean; placeholder?: string; clearable?: boolean; className?: string;
}) {
  const id = useId();
  const { trigger, pop, open, show, hide } = usePopover();
  const body = useRef<HTMLDivElement>(null);
  const now = new Date();
  const h24 = value ? Number(value.slice(0, 2)) : null;
  const minute = value ? value.slice(3, 5) : '00';
  const pm = h24 === null ? now.getHours() >= 12 : h24 >= 12;
  const hour12 = h24 === null ? null : h24 % 12 || 12;

  useLayoutEffect(() => {
    if (open) (body.current?.querySelector<HTMLButtonElement>('.hour.on') ?? body.current?.querySelector<HTMLButtonElement>('.hour'))?.focus();
  }, [open]);

  const set = (h: number, m: string, isPm: boolean) => onChange(`${pad((h % 12) + (isPm ? 12 : 0))}:${m}`);
  const odd = value !== '' && !MINUTES.includes(minute);

  return (
    <Field label={label} hideLabel={hideLabel} labelId={`${id}-l`} className={className}>
      <button ref={trigger} type="button" className={value ? 'input picker-trigger' : 'input picker-trigger blank'} onClick={show}
        aria-labelledby={`${id}-l ${id}-v`} aria-haspopup="dialog" aria-expanded={open}>
        <span id={`${id}-v`}>{value ? timeText(value) : placeholder}</span>
        <ClockIcon />
      </button>
      <div ref={pop} popover="auto" className="picker-pop time" role="dialog" aria-label={`Choose ${label.toLowerCase()}`}>
        <div ref={body} className="time-body">
          <p className="cal-title">{value ? timeText(value) : 'Pick a time'}</p>
          <div className="time-presets" role="group" aria-label="Common times">
            {PRESETS.map(([name, hhmm]) => <button key={hhmm} type="button" className={value === hhmm ? 'chip on' : 'chip'} onClick={() => { onChange(hhmm); hide(); }}>{name}</button>)}
          </div>
          <div className="time-label">Hour</div>
          <div className="hours" role="group" aria-label="Hour">
            {HOURS.map((h) => <button key={h} type="button" className={hour12 === h ? 'hour on' : 'hour'} aria-pressed={hour12 === h} onClick={() => set(h, minute, pm)}>{h}</button>)}
          </div>
          <div className="time-row">
            <div className="segmented slide-switch" role="group" aria-label="Minutes" style={{ '--n': MINUTES.length, '--i': Math.max(0, MINUTES.indexOf(minute)) } as CSSProperties} data-none={odd || hour12 === null ? '' : undefined}>
              {MINUTES.map((m) => <button key={m} type="button" aria-pressed={!odd && hour12 !== null && minute === m} onClick={() => set(hour12 ?? 12, m, pm)}>:{m}</button>)}
            </div>
            <div className="segmented slide-switch" role="group" aria-label="AM or PM" style={{ '--n': 2, '--i': pm ? 1 : 0 } as CSSProperties}>
              <button type="button" aria-pressed={!pm} onClick={() => set(hour12 ?? 9, minute, false)}>AM</button>
              <button type="button" aria-pressed={pm} onClick={() => set(hour12 ?? 5, minute, true)}>PM</button>
            </div>
          </div>
        </div>
        <div className="picker-foot">
          {clearable && value && <button type="button" className="link" onClick={() => { onChange(''); hide(); }}>Clear</button>}
          <span className="picker-gap" />
          <button type="button" className="btn primary small" onClick={hide}>Done</button>
        </div>
      </div>
    </Field>
  );
}

/** A date and a time side by side for one moment, kept as "YYYY-MM-DDTHH:MM" like a datetime-local input. */
export function DateTimePicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [date, time] = [value.slice(0, 10), value.slice(11, 16)];
  return (
    <div className="two picker-pair" role="group" aria-label={label}>
      <DatePicker label={label} value={date} clearable={false} onChange={(d) => onChange(`${d}T${time || '12:00'}`)} />
      <TimePicker label="Time" value={time} clearable={false} onChange={(t) => onChange(`${date}T${t}`)} />
    </div>
  );
}

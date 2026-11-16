import type { ReactNode } from 'react';

const Icon = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {children}
  </svg>
);
export const TodayIcon = () => (
  <Icon><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Icon>
);
export const TasksIcon = () => (
  <Icon><path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 1.5-2M4 12l1 1 1.5-2M4 18l1 1 1.5-2" /></Icon>
);
export const MoneyIcon = () => (
  <Icon><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10h18M16 14.5h1.5" /></Icon>
);
export const HealthIcon = () => (
  <Icon><path d="M12 20s-8.5-5.5-8.5-11.2c0-2.6 2-4.5 4.4-4.5 1.7 0 3.2 1 4.1 2.4.9-1.4 2.4-2.4 4.1-2.4 2.4 0 4.4 1.9 4.4 4.5C20.5 14.5 12 20 12 20z" /></Icon>
);

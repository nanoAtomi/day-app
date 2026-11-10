import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';

const ICONS = {
  // A clock: what is on right now.
  now: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  // Stacked blocks on a line: the day's timeline.
  day: 'M5 4v16M9 6h10v4H9zM9 14h7v4H9z',
  // A calendar page: the week.
  week: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  // Three dots: everything else.
  more: 'M5 12h.01M12 12h.01M19 12h.01',
} as const;

const VIEWS: { to: string; key: keyof typeof ICONS; end: boolean }[] = [
  { to: '/', key: 'now', end: true },
  { to: '/day', key: 'day', end: false },
  { to: '/week', key: 'week', end: false },
  { to: '/more', key: 'more', end: false },
];

/** Wide screens: "Now" and the timeline share the start page; the rest sits in the top bar. */
const DESKTOP: { to: string; key: string; end: boolean }[] = [
  { to: '/', key: 'today', end: true },
  { to: '/week', key: 'week', end: false },
  { to: '/templates', key: 'templates', end: false },
];

export function ViewLinks() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  return DESKTOP.map((view) => (
    <NavLink
      key={view.key}
      to={view.to}
      end={view.end}
      className={({ isActive }) =>
        `rounded-full px-3.5 py-1.5 text-sm font-medium ${isActive || (view.key === 'today' && pathname === '/day') ? 'bg-ink/5 text-ink dark:bg-white/10' : 'text-slate-500 hover:text-ink'}`
      }
    >
      {t(`nav.${view.key}`)}
    </NavLink>
  ));
}

function NavIcon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth={name === 'more' ? 3 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

/**
 * Phones: the views in thumb reach. Sticky at the end of the page, not fixed: iOS Safari
 * moves fixed bars while its own toolbar shrinks and grows. The shadow reaches far down in
 * the bar's colour, so an overscroll bounce looks like the bar growing, not lifting off.
 * Templates (and later statistics, settings) live under "More".
 */
export function BottomNav() {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('nav.main')} className="sticky bottom-0 z-20 flex border-t border-line bg-surface/90 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_100vh_0_100vh_var(--surface)] backdrop-blur-xl lg:hidden">
      {VIEWS.map((view) => (
        <NavLink
          key={view.key}
          to={view.to}
          end={view.end}
          className={({ isActive }) =>
            `group flex min-w-0 flex-1 flex-col items-center gap-1 pt-2 pb-1.5 text-[11px] ${isActive ? 'font-semibold text-brand' : 'text-slate-500 dark:text-slate-400'}`
          }
        >
          {({ isActive }) => (
            <>
              <span className={`grid h-8 w-14 place-items-center rounded-full transition-colors ${isActive ? 'bg-brand/15' : 'group-hover:bg-ink/5 dark:group-hover:bg-white/5'}`}>
                <NavIcon name={view.key} />
              </span>
              <span className="max-w-full truncate">{t(`nav.${view.key}`)}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

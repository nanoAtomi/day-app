import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { AccountMenu, type PlatformUser } from './AccountMenu';

export { initials, menuIconClass, menuItemClass, type PlatformUser } from './AccountMenu';

/*
 * Shell "top bar" (blueprint template - copy into `src/components/` with
 * AccountMenu.tsx; the other shell is PlatformSidebar). Apps may restyle it later:
 *
 *   [‹ PORTAL] │ 💡 App name   <nav links>                         (AB)
 *
 * Left: back to the portal in the platform's wordmark style, then the app's name - a
 * link to the app's start page that scrolls back up when already there (as "Nicasso"
 * on nicasso.de). Right: the account menu (the portal's profile panel). Phones use the
 * app's bottom nav for its views. The legal pages (templates/frontend/legal) show the
 * same bar as static HTML. The bar also lays the platform's background behind the page
 * (PlatformBackdrop: the three lights of nicasso.de and the portal).
 *
 * Texts (de/en): platform.portal, platform.portalTitle + AccountMenu's.
 */

interface Props {
  appName: string;
  /** An emoji, or a small element (e.g. the app's gradient tile). */
  appIcon: ReactNode;
  user: PlatformUser;
  /** The app's views (from md up; phones and small tablets use the bottom nav). */
  nav?: ReactNode;
  navLabel?: string;
  /** Desktop-only extras next to the avatar, e.g. the app's main call to action. */
  actions?: ReactNode;
  /** App-specific entries at the top of the account menu (e.g. an admin view on phones). */
  menuItems?: ReactNode;
}

export function PlatformBar({ appName, appIcon, user, nav, navLabel, actions, menuItems }: Props) {
  return (
    <>
    <PlatformBackdrop />
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 pt-[env(safe-area-inset-top)] backdrop-blur-md dark:border-white/10 dark:bg-[#15161b]/85">
      {/* Same width and height as nicasso.de's and the portal's header: the avatar sits in the same spot. */}
      <div className="mx-auto flex h-16 w-[min(1180px,calc(100%-32px))] items-center gap-3 md:w-[min(1180px,calc(100%-64px))]">
        {user.portalUrl && (
          <>
            <PortalChip url={user.portalUrl} />
            <span aria-hidden className="h-6 w-px bg-slate-200 dark:bg-white/10" />
          </>
        )}
        <AppHomeLink appName={appName} appIcon={appIcon} />
        {nav && <nav aria-label={navLabel ?? appName} className="ml-4 hidden items-center gap-1 md:flex">{nav}</nav>}
        <div className="ml-auto flex items-center gap-3">
          {actions && <div className="hidden items-center gap-3 md:flex">{actions}</div>}
          <AccountMenu user={user} items={menuItems} />
        </div>
      </div>
    </header>
    </>
  );
}

/** One of the three lights: a soft round gradient (no blur filter - iOS Safari chokes on window-sized ones). */
const light = 'absolute rounded-full bg-[radial-gradient(closest-side,var(--glow)_25%,transparent)]';

/**
 * The platform's background, as on nicasso.de and in the portal: three faint lights behind
 * the page - blue top left, teal in the middle, purple bottom right. Fixed, so they stay while
 * the page scrolls; cards keep their own surface on top.
 */
export function PlatformBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className={`${light} -top-[12vmax] -left-[14vmax] h-[46vmax] w-[46vmax] [--glow:rgb(79_123_240/.15)] dark:[--glow:rgb(79_123_240/.2)]`} />
      <div className={`${light} top-[30%] left-[55%] h-[26vmax] w-[26vmax] [--glow:rgb(45_212_191/.1)] dark:[--glow:rgb(45_212_191/.12)]`} />
      <div className={`${light} -right-[12vmax] -bottom-[14vmax] h-[40vmax] w-[40vmax] [--glow:rgb(217_70_239/.1)] dark:[--glow:rgb(217_70_239/.15)]`} />
    </div>
  );
}

/** "‹ PORTAL" - the way back, in the wordmark style. */
export function PortalChip({ url }: { url: string }) {
  const { t } = useTranslation();
  return (
    <a
      href={url}
      title={t('platform.portalTitle')}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-slate-100 px-3 text-[11px] font-bold tracking-[0.3em] text-slate-700 uppercase transition-colors hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"
    >
      <span aria-hidden className="text-sm tracking-normal">‹</span>
      {t('platform.portal')}
    </a>
  );
}

/** Icon and name: to the start page; on the start page back up to the top. */
export function AppHomeLink({ appName, appIcon }: { appName: string; appIcon: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <Link
      to="/"
      onClick={(event) => {
        if (pathname === '/') event.preventDefault();
        window.scrollTo({ top: 0, behavior: pathname === '/' ? 'smooth' : 'auto' });
      }}
      className="flex min-h-10 min-w-0 items-center gap-2 rounded-full"
    >
      <span aria-hidden className="text-xl leading-none">{appIcon}</span>
      <span className="truncate text-base font-bold tracking-tight">{appName}</span>
    </Link>
  );
}

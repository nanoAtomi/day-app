import { useTranslation } from 'react-i18next';

/*
 * The footer every app shows (blueprint template - copy into `src/components/`). The
 * same as nicasso.de's, the studio's and the portal's:
 *
 *   Desktop (700 px+)                               Phone
 *   ──────────────────────────────────────────      ───────────────────────
 *   NICASSO · Handmade.      Privacy   Terms of use      NICASSO · Handmade.
 *                                                       Privacy  Terms of use
 *
 * Links are the app's legal pages (static, public: templates/frontend/legal), sorted by
 * their label so every app lists them in the same order. Render it at the end of the
 * app's <main> - the main's bottom padding keeps it clear of the bottom nav. Quick pages
 * show no footer.
 *
 * Texts (de/en): platform.made, platform.legal, platform.privacy, platform.terms.
 */

export interface FooterLink {
  href: string;
  label: string;
}

/** The legal pages every app has - extend only with more pages of the same kind. */
export function useLegalLinks(): FooterLink[] {
  const { t } = useTranslation();
  return [
    { href: '/privacy/', label: t('platform.privacy') },
    { href: '/terms/', label: t('platform.terms') },
  ];
}

export function AppFooter({ links }: { links?: FooterLink[] }) {
  const { t, i18n } = useTranslation();
  const legal = useLegalLinks();
  const sorted = [...(links ?? legal)].sort((a, b) => a.label.localeCompare(b.label, i18n.resolvedLanguage));
  return (
    <footer className="mt-16 border-t border-slate-200/80 py-8 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
      <div className="flex flex-col items-center gap-3 text-center min-[700px]:flex-row min-[700px]:justify-between min-[700px]:text-left">
        <span>
          <span className="font-bold tracking-[0.35em] text-slate-900 uppercase dark:text-white">Nicasso</span> · {t('platform.made')}
        </span>
        <nav aria-label={t('platform.legal')} className="flex flex-wrap justify-center gap-5">
          {sorted.map((link) => (
            // Plain links: the legal pages are static pages, not routes of the app.
            <a key={link.href} href={link.href} className="hover:text-slate-900 dark:hover:text-white">
              {link.label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}

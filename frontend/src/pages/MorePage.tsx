import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

/** Phones: what doesn't fit into the bottom bar. Grows with statistics and settings. */
export function MorePage() {
  const { t } = useTranslation();
  const items = [{ to: '/templates', icon: '🧩', title: t('templates.title'), text: t('templates.lead') }];
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-5 text-2xl font-bold tracking-tight sm:text-3xl">{t('nav.more')}</h1>
      <ul className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
        {items.map((item) => (
          <li key={item.to} className="border-b border-line last:border-0">
            <Link to={item.to} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-ink/[0.03] dark:hover:bg-white/[0.04]">
              <span aria-hidden className="grid size-10 place-items-center rounded-2xl bg-ink/5 text-xl dark:bg-white/10">{item.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{item.title}</span>
                <span className="block truncate text-sm text-slate-500 dark:text-slate-400">{item.text}</span>
              </span>
              <span aria-hidden className="text-slate-400">›</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

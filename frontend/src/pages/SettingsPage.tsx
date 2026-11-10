import { useTranslation } from 'react-i18next';
import { useMe, useUpdateMe, type DelayMode } from '../api/day';
import { PageHeader, usePhone } from '../components/ui';

const MODES: DelayMode[] = ['fixed', 'cascade'];

/** Settings: for now the delay mode; notifications and calendars join later. */
export function SettingsPage() {
  const { t } = useTranslation();
  const me = useMe();
  const update = useUpdateMe();
  const phone = usePhone();
  const mode = me.data?.delay_mode ?? 'fixed';

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('settings.title')} back={phone ? { to: '/more', label: t('nav.more') } : undefined} />
      <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="font-semibold">{t('delay.title')}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('delay.lead')}</p>
        <div role="radiogroup" aria-label={t('delay.title')} className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-ink/5 p-1 dark:bg-white/[0.06]">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => update.mutate({ delay_mode: m })}
              className={`min-h-11 rounded-xl text-sm font-medium transition ${mode === m ? 'bg-surface text-ink shadow-sm' : 'text-slate-500 hover:text-ink dark:text-slate-400'}`}
            >
              {t(`delay.name.${m}`)}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{t(`delay.hint.${mode}`)}</p>
      </section>
    </div>
  );
}

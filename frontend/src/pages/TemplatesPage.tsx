import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useSetWeekday, useTemplates, type Template } from '../api/day';
import { TemplateSheet } from '../components/TemplateSheet';
import { PageHeader, primaryButton, usePhone } from '../components/ui';
import { TemplateIcon, weekdayName } from '../lib/templates';
import { formatMinute } from '../lib/time';

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

/** All templates: whole days with the weekdays that start from them, and modules. */
export function TemplatesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const templates = useTemplates();
  const [creating, setCreating] = useState(false);
  // Phones reach templates through "More"; wide screens have them in the top bar.
  const phone = usePhone();
  const all = templates.data ?? [];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('templates.title')} lead={t('templates.lead')} back={phone ? { to: '/more', label: t('nav.more') } : undefined}>
        <button type="button" className={primaryButton} onClick={() => setCreating(true)}>
          + {t('template.new')}
        </button>
      </PageHeader>
      {templates.error && <p className="text-red-700 dark:text-red-400">{t('error.load', { message: templates.error.message })}</p>}
      {templates.isPending && <p className="text-slate-500">{t('loading')}</p>}
      {templates.data && all.length === 0 && <p className="rounded-3xl border border-line bg-surface p-6 text-slate-500 dark:text-slate-400">{t('templates.empty')}</p>}

      {(['day', 'module'] as const).map((kind) => {
        const list = all.filter((x) => x.kind === kind);
        if (list.length === 0) return null;
        return (
          <section key={kind} className="mb-8">
            <h2 className="mb-2 px-1 text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{t(`templates.section.${kind}`)}</h2>
            <ul className="space-y-3">
              {list.map((template) => (
                <TemplateRow key={template.id} template={template} all={all} />
              ))}
            </ul>
          </section>
        );
      })}
      {creating && <TemplateSheet onClose={() => setCreating(false)} onCreated={(created) => navigate(`/templates/${created.id}`)} />}
    </div>
  );
}

function TemplateRow({ template, all }: { template: Template; all: Template[] }) {
  const { t, i18n } = useTranslation();
  const setWeekday = useSetWeekday();
  const language = i18n.resolvedLanguage ?? 'en';
  const first = template.blocks[0];
  const last = template.blocks.reduce((end, b) => Math.max(end, b.start_minute + b.duration_minutes), 0);

  return (
    <li className="rounded-3xl border border-line bg-surface p-4 shadow-sm">
      <Link to={`/templates/${template.id}`} className="flex min-w-0 items-center gap-3">
        <TemplateIcon template={template} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{template.name}</span>
          <span className="block truncate text-sm text-slate-500 dark:text-slate-400">
            {t('templates.summary', { count: template.blocks.length })}
            {first && ` · ${formatMinute(first.start_minute)}–${formatMinute(last)}`}
          </span>
        </span>
        <span aria-hidden className="text-slate-400">›</span>
      </Link>
      {template.kind === 'day' && (
        <div className="mt-3 grid grid-cols-7 gap-1" role="group" aria-label={t('templates.weekdays', { name: template.name })}>
          {WEEKDAYS.map((weekday) => {
            const on = template.weekdays.includes(weekday);
            const other = all.find((x) => x.id !== template.id && x.weekdays.includes(weekday));
            return (
              <button
                key={weekday}
                type="button"
                aria-pressed={on}
                title={!on && other ? t('templates.takenBy', { name: other.name }) : undefined}
                onClick={() => setWeekday.mutate({ weekday, templateId: on ? null : template.id })}
                className={`min-h-10 min-w-0 rounded-xl text-sm font-medium transition active:scale-95 ${
                  on ? 'bg-brand text-white shadow-sm shadow-brand/30' : 'bg-ink/5 text-slate-600 hover:bg-ink/10 dark:bg-white/[0.07] dark:text-slate-300'
                }`}
              >
                {weekdayName(weekday, language)}
              </button>
            );
          })}
        </div>
      )}
    </li>
  );
}

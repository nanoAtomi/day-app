import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStats, type DayStats } from '../api/stats';
import { PageHeader, usePhone } from '../components/ui';
import { formatDate } from '../lib/time';

const CHART_PX = 140;
// A non-breaking space keeps "80 %" on one line.
const pct = (rate: number | null) => (rate === null ? '–' : `${Math.round(rate * 100)}\u00a0%`);

/** How much of the plan happened: streak, this week, the last four weeks day by day, what gets skipped. */
export function StatsPage() {
  const { t } = useTranslation();
  const stats = useStats(28);
  const phone = usePhone();
  const back = phone ? { to: '/more', label: t('nav.more') } : undefined;

  if (!stats.data) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={t('stats.title')} back={back} />
        <p className={stats.error ? 'text-red-700 dark:text-red-400' : 'text-slate-500'}>{stats.error ? t('error.load', { message: stats.error.message }) : t('loading')}</p>
      </div>
    );
  }

  const { days, weeks, streak, often_skipped } = stats.data;
  const thisWeek = weeks[weeks.length - 1];
  const tracked = days.some((d) => d.rate !== null);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('stats.title')} lead={t('stats.lead')} back={back} />
      <div className="grid grid-cols-2 gap-3">
        <Tile label={t('stats.streak')} value={t('stats.days', { count: streak })} hint={t('stats.streakHint')} icon="🔥" />
        <Tile label={t('stats.thisWeek')} value={pct(thisWeek?.rate ?? null)} hint={thisWeek ? t('stats.ofDue', { done: thisWeek.done, total: thisWeek.done + thisWeek.skipped + thisWeek.missed }) : ''} icon="✅" />
      </div>

      <section aria-labelledby="per-day" className="mt-4 rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <h2 id="per-day" className="font-semibold">{t('stats.perDay')}</h2>
        {tracked ? <DayChart days={days} /> : <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t('stats.empty')}</p>}
      </section>

      <section aria-labelledby="skipped" className="mt-4 rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <h2 id="skipped" className="font-semibold">{t('stats.oftenSkipped')}</h2>
        {often_skipped.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t('stats.nothingSkipped')}</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {often_skipped.map((s) => (
              <li key={s.title} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0 truncate font-medium">{s.title}</span>
                <span className="shrink-0 text-sm text-slate-500 tabular-nums dark:text-slate-400">{t('stats.skippedOf', { skipped: s.skipped, total: s.total })}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value, hint, icon }: { label: string; value: string; hint: string; icon: string }) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-4 shadow-sm">
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
        <span aria-hidden>{icon}</span> {label}
      </p>
      <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
    </section>
  );
}

/** One bar per day (share done), one hue; tap or hover a day for its numbers. */
function DayChart({ days }: { days: DayStats[] }) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? 'en';
  // Start with the latest day that had something due.
  const [picked, setPicked] = useState<DayStats>(() => [...days].reverse().find((d) => d.rate !== null) ?? days[days.length - 1]);
  const total = (d: DayStats) => d.done + d.skipped + d.missed;

  return (
    <div className="mt-4">
      <div className="relative" style={{ height: CHART_PX }}>
        {[1, 0.5, 0].map((line) => (
          <div key={line} aria-hidden className="absolute inset-x-0 border-t border-line" style={{ top: (1 - line) * CHART_PX }}>
            <span className="absolute -top-2 right-0 bg-surface pl-1 text-[10px] text-slate-400 tabular-nums">{line * 100} %</span>
          </div>
        ))}
        <div className="absolute inset-0 right-9 flex items-end gap-[2px]">
          {days.map((d) => {
            const label = d.rate === null ? t('stats.barEmpty', { day: formatDate(d.date, language) }) : t('stats.bar', { day: formatDate(d.date, language), rate: pct(d.rate), done: d.done, total: total(d) });
            return (
              <button
                key={d.date}
                type="button"
                aria-label={label}
                aria-pressed={picked.date === d.date}
                title={label}
                onClick={() => setPicked(d)}
                onMouseEnter={() => setPicked(d)}
                className="group flex h-full min-w-0 flex-1 items-end"
              >
                {d.rate === null ? (
                  <span aria-hidden className="h-0.5 w-full rounded-full bg-slate-300 dark:bg-white/15" />
                ) : (
                  <span
                    aria-hidden
                    className={`w-full rounded-t-[4px] transition-opacity ${picked.date === d.date ? 'bg-brand' : 'bg-brand/60 group-hover:bg-brand/80'}`}
                    style={{ height: Math.max(3, d.rate * CHART_PX) }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div aria-hidden className="mr-9 mt-1 flex justify-between text-[10px] text-slate-400">
        <span>{formatDate(days[0].date, language, { day: 'numeric', month: 'short' })}</span>
        <span>{t('day.today')}</span>
      </div>
      <p role="status" className="mt-3 rounded-2xl bg-ink/[0.03] px-3 py-2 text-sm dark:bg-white/[0.04]">
        <span className="font-semibold">{formatDate(picked.date, language)}</span>
        {' · '}
        {picked.rate === null ? t('stats.nothingDue') : t('stats.detail', { done: picked.done, skipped: picked.skipped, missed: picked.missed, rate: pct(picked.rate) })}
      </p>
    </div>
  );
}

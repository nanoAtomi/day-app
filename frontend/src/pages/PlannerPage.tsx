import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { useDay, type Day } from '../api/day';
import { BlockSheet, type SheetTarget } from '../components/BlockSheet';
import { NowPanel, newBlockAt } from '../components/NowPanel';
import { Timeline } from '../components/Timeline';
import { linkButton, primaryButton } from '../components/ui';
import { nowAndNext } from '../lib/plan';
import { addDays, formatDate } from '../lib/time';
import { useClock } from '../lib/useClock';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The planner. Phones show one view at a time - "Now" at `/`, the timeline at `/day` -
 * while wide screens show both: "Now" on the left, the timeline on the right. The day in
 * view lives in the URL (`/day?date=2026-11-10`), so back and reload keep it.
 */
export function PlannerPage({ view, timeZone }: { view: 'now' | 'day'; timeZone: string }) {
  const { t, i18n } = useTranslation();
  const clock = useClock(timeZone);
  const [params] = useSearchParams();
  const requested = params.get('date');
  const date = view === 'day' && requested && DATE.test(requested) ? requested : clock.date;
  const isToday = date === clock.date;

  const today = useDay(clock.date);
  const shown = useDay(date);
  const [sheet, setSheet] = useState<{ date: string; target: SheetTarget } | null>(null);
  const open = (on: string) => (target: SheetTarget) => setSheet({ date: on, target });

  const language = i18n.resolvedLanguage ?? 'en';
  const dayLink = (on: string) => (on === clock.date ? '/day' : `/day?date=${on}`);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <section aria-label={t('nav.now')} className={`${view === 'now' ? '' : 'hidden lg:block'}`}>
        <div className="lg:sticky lg:top-20">
          <h1 className="mb-4 text-2xl font-bold tracking-tight sm:text-3xl">{formatDate(clock.date, language)}</h1>
          <Loaded day={today.data} error={today.error}>
            {(day) => <NowPanel date={clock.date} blocks={day.blocks} minute={clock.minute} onOpen={open(clock.date)} />}
          </Loaded>
          {view === 'now' && (
            <Link to="/day" className={`${linkButton} mt-4 inline-flex items-center lg:hidden`}>
              {t('now.toDay')} →
            </Link>
          )}
        </div>
      </section>

      <section aria-label={t('nav.day')} className={`min-w-0 ${view === 'day' ? '' : 'hidden lg:block'}`}>
        <div className="sticky top-14 z-10 -mx-4 mb-4 flex items-center gap-1 bg-canvas/85 px-4 py-2 backdrop-blur sm:top-16 lg:mx-0 lg:rounded-2xl lg:px-2">
          <Link to={dayLink(addDays(date, -1))} aria-label={t('day.previous')} className="grid size-11 shrink-0 place-items-center rounded-full text-xl hover:bg-ink/5 dark:hover:bg-white/10">
            ‹
          </Link>
          <h2 className="min-w-0 flex-1 truncate text-center text-lg font-semibold">{isToday ? t('day.today') : formatDate(date, language)}</h2>
          <Link to={dayLink(addDays(date, 1))} aria-label={t('day.next')} className="grid size-11 shrink-0 place-items-center rounded-full text-xl hover:bg-ink/5 dark:hover:bg-white/10">
            ›
          </Link>
          {!isToday && (
            <Link to="/day" className={`${linkButton} inline-flex items-center`}>
              {t('day.toToday')}
            </Link>
          )}
          <button type="button" aria-label={t('block.new')} onClick={() => open(date)(newBlockAt(isToday ? clock.minute : 8 * 60))} className={`${primaryButton} size-11 shrink-0 px-0 text-xl`}>
            +
          </button>
        </div>
        <Loaded day={shown.data} error={shown.error}>
          {(day) => (
            <>
              {day.blocks.length === 0 && <p className="mb-4 text-center text-sm text-slate-500 dark:text-slate-400">{t('day.emptyHint')}</p>}
              <Timeline
                key={date}
                blocks={day.blocks}
                nowMinute={isToday ? clock.minute : null}
                currentId={isToday ? (nowAndNext(day.blocks, clock.minute).current?.id ?? null) : null}
                onOpen={open(date)}
              />
            </>
          )}
        </Loaded>
      </section>

      {sheet && <BlockSheet key={JSON.stringify(sheet)} date={sheet.date} target={sheet.target} onClose={() => setSheet(null)} />}
    </div>
  );
}

/** Spinner only on the very first load; cached days show at once. */
function Loaded({ day, error, children }: { day: Day | undefined; error: Error | null; children: (day: Day) => ReactNode }) {
  const { t } = useTranslation();
  if (day) return <>{children(day)}</>;
  if (error) return <p className="text-red-700 dark:text-red-400">{t('error.load', { message: error.message })}</p>;
  return <p className="text-slate-500">{t('loading')}</p>;
}

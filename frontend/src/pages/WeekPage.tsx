import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSetDayTemplate, useTemplates, useWeek, type Template, type WeekDay } from '../api/day';
import { field, linkButton, useConfirm } from '../components/ui';
import { look } from '../lib/categories';
import { isoWeek, mondayOf } from '../lib/templates';
import { addDays, formatDate } from '../lib/time';
import { useClock } from '../lib/useClock';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
// The mini timelines show 6:00 to 24:00.
const FROM = 6 * 60;
const SPAN = 24 * 60 - FROM;

/**
 * Seven days side by side (on phones one under the other), each with a mini timeline and
 * its template. The week lives in the URL (`/week?start=2026-11-09`).
 */
export function WeekPage({ timeZone }: { timeZone: string }) {
  const { t, i18n } = useTranslation();
  const clock = useClock(timeZone);
  const [params] = useSearchParams();
  const requested = params.get('start');
  const monday = mondayOf(requested && DATE.test(requested) ? requested : clock.date);
  const week = useWeek(monday);
  const templates = useTemplates();
  const language = i18n.resolvedLanguage ?? 'en';
  const dayTemplates = (templates.data ?? []).filter((x) => x.kind === 'day');
  const weekLink = (start: string) => (start === mondayOf(clock.date) ? '/week' : `/week?start=${start}`);

  return (
    <div>
      <div className="mb-5 flex items-center gap-1">
        <Link to={weekLink(addDays(monday, -7))} aria-label={t('week.previous')} className="grid size-11 shrink-0 place-items-center rounded-full text-xl hover:bg-ink/5 dark:hover:bg-white/10">
          ‹
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <h1 className="text-2xl font-bold tracking-tight">{t('week.title', { week: isoWeek(monday) })}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {formatDate(monday, language, { day: 'numeric', month: 'short' })} – {formatDate(addDays(monday, 6), language, { day: 'numeric', month: 'short' })}
          </p>
        </div>
        <Link to={weekLink(addDays(monday, 7))} aria-label={t('week.next')} className="grid size-11 shrink-0 place-items-center rounded-full text-xl hover:bg-ink/5 dark:hover:bg-white/10">
          ›
        </Link>
      </div>
      {monday !== mondayOf(clock.date) && (
        <p className="-mt-3 mb-4 text-center">
          <Link to="/week" className={`${linkButton} inline-flex items-center`}>
            {t('week.thisWeek')}
          </Link>
        </p>
      )}

      {week.data ? (
        <ol className="grid grid-cols-1 gap-3 md:grid-cols-7 md:gap-2">
          {week.data.map((day) => (
            <DayColumn key={day.date} day={day} isToday={day.date === clock.date} isPast={day.date < clock.date} templates={dayTemplates} language={language} />
          ))}
        </ol>
      ) : week.error ? (
        <p className="text-red-700 dark:text-red-400">{t('error.load', { message: week.error.message })}</p>
      ) : (
        <p className="text-slate-500">{t('loading')}</p>
      )}
    </div>
  );
}

function DayColumn({ day, isToday, isPast, templates, language }: { day: WeekDay; isToday: boolean; isPast: boolean; templates: Template[]; language: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const setTemplate = useSetDayTemplate(day.date);
  const open = () => navigate(`/day?date=${day.date}`);

  const change = async (value: string) => {
    const templateId = value ? Number(value) : null;
    // An opened day may hold changes to its template blocks: they go with the old template.
    if (day.stored && day.blocks.some((b) => b.source === 'template')) {
      const ok = await confirm({ title: t('week.switchTitle'), message: t('week.switchText'), confirmLabel: t('week.switch') });
      if (!ok) return;
    }
    setTemplate.mutate(templateId);
  };

  return (
    <li className={`min-w-0 rounded-3xl border bg-surface p-3 shadow-sm ${isToday ? 'border-brand ring-2 ring-brand/20' : 'border-line'} ${isPast ? 'opacity-70' : ''}`}>
      <button type="button" onClick={open} className="flex w-full min-w-0 items-baseline justify-between gap-2 text-left md:flex-col md:items-start md:gap-0">
        <span className={`font-semibold ${isToday ? 'text-brand' : ''}`}>{formatDate(day.date, language, { weekday: 'long' })}</span>
        <span className="text-sm text-slate-500 dark:text-slate-400">{formatDate(day.date, language, { day: 'numeric', month: 'short' })}</span>
      </button>
      <label className="mt-2 block">
        <span className="sr-only">{t('week.template', { day: formatDate(day.date, language) })}</span>
        <select className={`${field} min-h-10 py-1.5 text-sm md:rounded-xl md:px-2 md:!pr-6 md:text-xs md:![background-position:right_0.4rem_center]`} value={day.template_id ?? ''} disabled={isPast} onChange={(e) => void change(e.target.value)}>
          <option value="">{t('week.noTemplate')}</option>
          {templates.map((x) => (
            <option key={x.id} value={x.id}>
              {x.icon} {x.name}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={open} aria-label={t('week.open', { day: formatDate(day.date, language) })} className="mt-3 block w-full">
        {/* Phones: one strip from left to right. From md: a column from top to bottom. */}
        <span className="relative block h-5 overflow-hidden rounded-lg bg-ink/5 md:h-72 dark:bg-white/[0.06]">
          {day.blocks.map((b) => {
            const from = Math.max(0, ((b.start_minute - FROM) / SPAN) * 100);
            const size = Math.max(0.8, ((Math.min(b.end_minute, 24 * 60) - Math.max(b.start_minute, FROM)) / SPAN) * 100);
            if (b.end_minute <= FROM) return null;
            return (
              <span
                key={b.id}
                title={b.title}
                className={`absolute rounded-[3px] ${look(b.category).bar} ${b.status === 'open' ? 'opacity-85' : 'opacity-35'} max-md:inset-y-0 md:inset-x-0`}
                style={{ ['--from' as string]: `${from}%`, ['--size' as string]: `${size}%` }}
                data-mini
              />
            );
          })}
        </span>
        <span className="mt-1.5 block text-left text-xs text-slate-500 dark:text-slate-400">{t('week.blocks', { count: day.blocks.length })}</span>
      </button>
    </li>
  );
}

import { useTranslation } from 'react-i18next';
import { useUpdateBlock, type Block } from '../api/day';
import { look } from '../lib/categories';
import { nowAndNext } from '../lib/plan';
import { DAY_MINUTES, formatDuration, formatMinute } from '../lib/time';
import type { SheetTarget } from './BlockSheet';
import { primaryButton, secondaryButton } from './ui';

const EXTEND_MINUTES = 15;

/**
 * "What's on right now": the running block big, with the time left as a bar and the three
 * things one does with it - done, skip, 15 more minutes. Below it the block after.
 */
export function NowPanel({ date, blocks, minute, onOpen }: { date: string; blocks: Block[]; minute: number; onOpen: (target: SheetTarget) => void }) {
  const { t } = useTranslation();
  const update = useUpdateBlock(date);
  const { current, next } = nowAndNext(blocks, minute);
  const units = { h: t('time.h'), min: t('time.min') };

  if (!current) {
    const freeUntil = next ? t('now.freeUntil', { time: formatMinute(next.start_minute) }) : null;
    return (
      <div className="space-y-4">
        <section className="rounded-3xl border border-line bg-surface p-6 shadow-sm">
          <p className="text-4xl" aria-hidden>
            {blocks.length === 0 ? '🌱' : next ? '☕' : '🌙'}
          </p>
          <h2 className="mt-3 text-2xl font-bold tracking-tight">{blocks.length === 0 ? t('now.emptyTitle') : next ? t('now.freeTitle') : t('now.doneTitle')}</h2>
          <p className="mt-1 text-slate-500 dark:text-slate-400">{blocks.length === 0 ? t('now.emptyText') : (freeUntil ?? t('now.doneText'))}</p>
          {blocks.length === 0 && (
            <button type="button" className={`${primaryButton} mt-5`} onClick={() => onOpen(newBlockAt(minute))}>
              {t('now.addFirst')}
            </button>
          )}
        </section>
        {next && <NextCard block={next} minute={minute} units={units} onOpen={onOpen} />}
      </div>
    );
  }

  const style = look(current.category);
  const total = current.end_minute - current.start_minute;
  const left = current.end_minute - minute;
  const progress = Math.min(100, Math.max(0, ((minute - current.start_minute) / total) * 100));

  return (
    <div className="space-y-4">
      <section aria-label={t('now.current')} className={`overflow-hidden rounded-3xl border border-line bg-gradient-to-br ${style.hero} bg-surface p-6 shadow-sm`}>
        <button type="button" onClick={() => onOpen({ block: current })} className="block w-full min-w-0 text-left">
          <span className="text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{t('now.label')}</span>
          <span className="mt-2 flex min-w-0 items-center gap-3">
            <span aria-hidden className="text-4xl">{style.icon}</span>
            <span className="min-w-0 truncate text-3xl font-bold tracking-tight">{current.title}</span>
          </span>
          <span className="mt-1 block text-slate-600 tabular-nums dark:text-slate-300">
            {formatMinute(current.start_minute)} – {formatMinute(current.end_minute)}
          </span>
        </button>

        <div className="mt-6">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-lg font-semibold">{t('now.left', { duration: formatDuration(left, units) })}</span>
            <span className="text-sm text-slate-500 tabular-nums dark:text-slate-400">{Math.round(progress)} %</span>
          </div>
          <div
            role="progressbar"
            aria-label={t('now.progress')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            className="mt-2 h-3 overflow-hidden rounded-full bg-ink/10 dark:bg-white/10"
          >
            <div className={`h-full rounded-full ${style.bar} transition-[width] duration-700`} style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-2">
          <button type="button" className={`${primaryButton} gap-1.5 px-2 whitespace-nowrap`} onClick={() => update.mutate({ id: current.id, status: 'done' })}>
            <span aria-hidden className="max-sm:hidden">✓</span>
            {t('now.done')}
          </button>
          <button type="button" className={`${secondaryButton} bg-surface/60 px-2 whitespace-nowrap`} onClick={() => update.mutate({ id: current.id, status: 'skipped' })}>
            {t('now.skip')}
          </button>
          <button
            type="button"
            className={`${secondaryButton} bg-surface/60 px-2 whitespace-nowrap`}
            disabled={current.end_minute >= DAY_MINUTES}
            onClick={() => update.mutate({ id: current.id, end_minute: Math.min(DAY_MINUTES, current.end_minute + EXTEND_MINUTES) })}
          >
            {t('now.extend')}
          </button>
        </div>
      </section>
      {next && <NextCard block={next} minute={minute} units={units} onOpen={onOpen} />}
    </div>
  );
}

function NextCard({ block, minute, units, onOpen }: { block: Block; minute: number; units: { h: string; min: string }; onOpen: (target: SheetTarget) => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={() => onOpen({ block })}
      className="flex w-full min-w-0 items-center gap-3 rounded-3xl border border-line bg-surface p-4 text-left shadow-sm transition hover:bg-ink/[0.02] dark:hover:bg-white/[0.03]"
    >
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl bg-ink/5 text-2xl dark:bg-white/10">
        {look(block.category).icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">{t('now.next')}</span>
        <span className="block truncate font-semibold">{block.title}</span>
      </span>
      <span className="shrink-0 text-right text-sm tabular-nums">
        <span className="block font-semibold">{formatMinute(block.start_minute)}</span>
        <span className="block text-slate-500 dark:text-slate-400">{t('now.in', { duration: formatDuration(block.start_minute - minute, units) })}</span>
      </span>
    </button>
  );
}

/** A new hour-long block from the next quarter hour on. */
export function newBlockAt(minute: number): SheetTarget {
  const start = Math.min(DAY_MINUTES - 60, Math.ceil(minute / 15) * 15);
  return { start, end: start + 60 };
}

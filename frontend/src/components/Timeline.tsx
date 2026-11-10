import { useEffect, useRef, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Block } from '../api/day';
import { look } from '../lib/categories';
import { placeBlocks } from '../lib/plan';
import { DAY_MINUTES, formatMinute } from '../lib/time';
import type { SheetTarget } from './BlockSheet';

/** Height of one hour on the timeline. */
export const HOUR_PX = 64;
const GUTTER = '3.25rem';
const NEW_BLOCK_MINUTES = 60;

/**
 * The day as a vertical line of hours with its blocks on it. Overlapping blocks stand side
 * by side with an amber mark; calendar entries are hatched. Tapping a block opens it,
 * tapping a free spot adds a block there.
 */
export function Timeline({ blocks, nowMinute, currentId, onOpen }: { blocks: Block[]; nowMinute: number | null; currentId: number | null; onOpen: (target: SheetTarget) => void }) {
  const { t } = useTranslation();
  const grid = useRef<HTMLDivElement>(null);
  const nowLine = useRef<HTMLDivElement>(null);

  const first = Math.min(6 * 60, ...blocks.map((b) => b.start_minute));
  const startHour = Math.floor(first / 60);
  const hours = Array.from({ length: 24 - startHour }, (_, i) => startHour + i);
  const top = (minute: number) => ((minute - startHour * 60) / 60) * HOUR_PX;

  // Today: start with the current hour in view.
  useEffect(() => {
    nowLine.current?.scrollIntoView?.({ block: 'center' });
  }, []);

  const addAt = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || !grid.current) return;
    const y = event.clientY - grid.current.getBoundingClientRect().top;
    const start = Math.min(DAY_MINUTES - 15, startHour * 60 + Math.floor((y / HOUR_PX) * 4) * 15);
    onOpen({ start, end: Math.min(DAY_MINUTES, start + NEW_BLOCK_MINUTES) });
  };

  return (
    <div
      ref={grid}
      onClick={addAt}
      className="relative cursor-copy select-none"
      style={{ height: hours.length * HOUR_PX }}
      aria-label={t('day.timeline')}
    >
      {hours.map((hour) => (
        <div key={hour} className="pointer-events-none absolute inset-x-0 border-t border-line" style={{ top: top(hour * 60) }}>
          <span className="absolute -top-2.5 left-0 w-11 bg-canvas pr-1 text-right text-xs text-slate-400 tabular-nums">{formatMinute(hour * 60)}</span>
        </div>
      ))}

      {placeBlocks(blocks).map(({ block, lane, lanes, overlaps }) => {
        const height = Math.max(((block.end_minute - block.start_minute) / 60) * HOUR_PX - 2, 22);
        const roomy = height >= 44;
        const style = look(block.category);
        return (
          <button
            key={block.id}
            type="button"
            onClick={() => onOpen({ block })}
            className={`absolute z-[1] isolate flex min-w-0 overflow-hidden rounded-xl border-l-4 bg-surface px-2 text-left text-sm shadow-sm transition hover:brightness-[0.97] active:scale-[0.99] ${style.block} ${
              roomy ? 'flex-col justify-start py-1' : 'items-center gap-2'
            } ${block.source === 'calendar' ? 'hatched' : ''} ${block.status === 'done' ? 'opacity-55' : ''} ${block.status === 'skipped' ? 'opacity-40' : ''} ${
              block.id === currentId ? 'ring-2 ring-brand ring-offset-1 ring-offset-canvas' : overlaps ? 'ring-2 ring-amber-500/80' : ''
            }`}
            style={{
              top: top(block.start_minute) + 1,
              height,
              left: `calc(${GUTTER} + (100% - ${GUTTER}) * ${lane / lanes})`,
              width: `calc((100% - ${GUTTER}) / ${lanes} - 4px)`,
            }}
          >
            <span aria-hidden className={`absolute inset-0 -z-10 ${style.tint}`} />
            <span className={`flex min-w-0 items-center gap-1.5 font-semibold ${block.status === 'skipped' ? 'line-through' : ''}`}>
              <span aria-hidden>{block.status === 'done' ? '✓' : style.icon}</span>
              <span className="truncate">{block.title}</span>
              {overlaps && (
                <span className="text-amber-600 dark:text-amber-400" title={t('day.overlap')} aria-label={t('day.overlap')}>
                  ⚠
                </span>
              )}
            </span>
            <span className={`shrink-0 text-xs tabular-nums opacity-75 ${roomy ? '' : 'ml-auto'}`}>
              {formatMinute(block.start_minute)}–{formatMinute(block.end_minute)}
            </span>
          </button>
        );
      })}

      {nowMinute !== null && nowMinute >= startHour * 60 && (
        <div ref={nowLine} className="pointer-events-none absolute right-0 flex items-center" style={{ top: top(nowMinute), left: `calc(${GUTTER} - 0.375rem)` }} aria-hidden>
          <span className="relative z-[2] size-3 rounded-full bg-red-500 shadow" />
          <span className="h-0.5 flex-1 bg-red-500" />
        </div>
      )}
    </div>
  );
}

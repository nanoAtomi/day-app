import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Block } from '../api/day';
import { look } from '../lib/categories';
import { dragTimes, placeBlocks, type DragMode } from '../lib/plan';
import { DAY_MINUTES, formatMinute } from '../lib/time';
import type { SheetTarget } from './BlockSheet';

/** Height of one hour on the timeline. */
export const HOUR_PX = 64;
const GUTTER = '3.25rem';
const NEW_BLOCK_MINUTES = 60;
// A finger has to rest this long on a block before it moves - otherwise the page scrolls.
const LONG_PRESS_MS = 350;

interface Drag {
  id: number;
  mode: DragMode;
  pointerId: number;
  touch: boolean;
  y0: number;
  start0: number;
  end0: number;
  start: number;
  end: number;
  /** Moving for real (mouse moved, long press done, or the edge grabbed). */
  active: boolean;
}

/**
 * The day as a vertical line of hours with its blocks on it. Overlapping blocks stand side
 * by side with an amber mark; calendar entries are hatched. Tapping a block opens it,
 * tapping a free spot adds a block there. With `onChange`, blocks move by dragging (on
 * touch after a long press) and get longer or shorter at their bottom edge.
 */
export function Timeline({
  blocks,
  nowMinute,
  currentId,
  onOpen,
  onChange,
}: {
  blocks: Block[];
  nowMinute: number | null;
  currentId: number | null;
  onOpen: (target: SheetTarget) => void;
  onChange?: (block: Block, start: number, end: number) => void;
}) {
  const { t } = useTranslation();
  const grid = useRef<HTMLDivElement>(null);
  const nowLine = useRef<HTMLDivElement>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const pressTimer = useRef<number | undefined>(undefined);
  const swallowClick = useRef(false);
  const setDrag = (next: Drag | null) => {
    dragRef.current = next;
    setDragState(next);
  };

  const first = Math.min(6 * 60, ...blocks.map((b) => b.start_minute));
  const startHour = Math.floor(first / 60);
  const hours = Array.from({ length: 24 - startHour }, (_, i) => startHour + i);
  const top = (minute: number) => ((minute - startHour * 60) / 60) * HOUR_PX;

  // Today: start with the current hour in view.
  useEffect(() => {
    nowLine.current?.scrollIntoView?.({ block: 'center' });
  }, []);

  // While a block is held, the finger moves it instead of the page (iOS needs a
  // non-passive listener to be stopped).
  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    const hold = (event: TouchEvent) => dragRef.current?.active && event.preventDefault();
    el.addEventListener('touchmove', hold, { passive: false });
    return () => el.removeEventListener('touchmove', hold);
  }, []);

  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const end = () => {
      window.clearTimeout(pressTimer.current);
      setDrag(null);
    };
    const move = (event: PointerEvent) => {
      const d = dragRef.current;
      if (!d || event.pointerId !== d.pointerId) return;
      const dy = event.clientY - d.y0;
      if (!d.active) {
        if (Math.abs(dy) < (d.touch ? 8 : 4)) return;
        // A finger that moves before the long press is scrolling the page.
        if (d.touch) return end();
      }
      const next = dragTimes(d.mode, d.start0, d.end0, (dy / HOUR_PX) * 60);
      if (next.start !== d.start || next.end !== d.end || !d.active) setDrag({ ...d, ...next, active: true });
    };
    const up = (event: PointerEvent) => {
      const d = dragRef.current;
      if (!d || event.pointerId !== d.pointerId) return;
      if (d.active) {
        swallowClick.current = true;
        window.setTimeout(() => (swallowClick.current = false), 0);
        const block = blocks.find((b) => b.id === d.id);
        if (block && (d.start !== d.start0 || d.end !== d.end0)) onChange?.(block, d.start, d.end);
      }
      end();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', end);
    };
  }, [dragging, blocks, onChange]);

  const grab = (event: ReactPointerEvent<HTMLButtonElement>, block: Block) => {
    if (!onChange || block.source === 'calendar' || event.button > 0) return;
    const mode: DragMode = (event.target as HTMLElement).closest('[data-resize]') ? 'resize' : 'move';
    const touch = event.pointerType !== 'mouse';
    const d: Drag = { id: block.id, mode, pointerId: event.pointerId, touch, y0: event.clientY, start0: block.start_minute, end0: block.end_minute, start: block.start_minute, end: block.end_minute, active: mode === 'resize' };
    setDrag(d);
    if (touch && mode === 'move') {
      pressTimer.current = window.setTimeout(() => {
        if (dragRef.current?.id !== block.id) return;
        setDrag({ ...dragRef.current, active: true });
        navigator.vibrate?.(10);
      }, LONG_PRESS_MS);
    }
  };

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

      {placeBlocks(blocks).map(({ block: planned, lane, lanes, overlaps }) => {
        const held = drag?.id === planned.id && drag.active ? drag : null;
        const block = held ? { ...planned, start_minute: held.start, end_minute: held.end } : planned;
        const movable = onChange !== undefined && block.source !== 'calendar';
        const height = Math.max(((block.end_minute - block.start_minute) / 60) * HOUR_PX - 2, 22);
        const roomy = height >= 44;
        const style = look(block.category);
        return (
          <button
            key={block.id}
            type="button"
            onClick={() => !swallowClick.current && onOpen({ block: planned })}
            onPointerDown={(e) => grab(e, planned)}
            onContextMenu={(e) => movable && e.preventDefault()}
            className={`group absolute isolate [-webkit-touch-callout:none] ${held ? 'z-20 cursor-grabbing shadow-xl ring-2 ring-brand' : 'z-[1]'} flex min-w-0 overflow-hidden rounded-xl border-l-4 bg-surface px-2 text-left text-sm shadow-sm ${style.block} ${
              roomy ? 'flex-col justify-start py-1' : 'items-center gap-2'
            } ${block.source === 'calendar' ? 'hatched' : ''} ${block.status === 'done' ? 'opacity-55' : ''} ${block.status === 'skipped' ? 'opacity-40' : ''} ${
              held ? '' : block.id === currentId ? 'ring-2 ring-brand ring-offset-1 ring-offset-canvas' : overlaps ? 'ring-2 ring-amber-500/80' : ''
            } ${held ? '' : 'transition hover:brightness-[0.97] active:scale-[0.99]'}`}
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
            {/* Short and squeezed beside another block: the title gets the room, the times are in the sheet. */}
            {(roomy || lanes === 1) && (
              <span className={`shrink-0 text-xs tabular-nums opacity-75 ${roomy ? '' : 'ml-auto'}`}>
                {formatMinute(block.start_minute)}–{formatMinute(block.end_minute)}
              </span>
            )}
            {movable && block.status === 'open' && (
              // The bottom edge: pull it to make the block longer or shorter.
              <span data-resize aria-hidden className="absolute inset-x-0 bottom-0 flex h-3.5 cursor-ns-resize touch-none items-end justify-center pb-1">
                <span className="h-1 w-8 rounded-full bg-current opacity-25 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-25" />
              </span>
            )}
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

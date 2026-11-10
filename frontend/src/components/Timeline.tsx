import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { Block } from '../api/day';
import { calendarLook, look } from '../lib/categories';
import { clampEnd, dragTimes, fitEnd, placeBlocks, type DragMode } from '../lib/plan';
import { DAY_MINUTES, formatMinute } from '../lib/time';
import type { SheetTarget } from './BlockSheet';
import { subtaskCount } from './SubtaskList';

/** Height of one hour on the timeline. */
export const HOUR_PX = 64;
const GUTTER = '3.25rem';
const GUTTER_PX = 52;
// Room above 0:00 and below 24:00 for their labels.
const PAD_PX = 12;
const NEW_BLOCK_MINUTES = 60;
// A finger has to rest this long before a block moves or a new one appears - otherwise the page scrolls.
const LONG_PRESS_MS = 350;
// Held near the top (below the bars) or the bottom (above the nav): the page scrolls along.
const EDGE_TOP_PX = 150;
const EDGE_BOTTOM_PX = 110;
const SCROLL_STEP_PX = 12;
const HOURS = Array.from({ length: 25 }, (_, i) => i);

type Mode = DragMode | 'create';

interface Drag {
  /** The block held, or 0 for a new one being placed. */
  id: number;
  mode: Mode;
  pointerId: number;
  touch: boolean;
  /** Where the pointer went down, on the page (scrolling counts). */
  pageY0: number;
  start0: number;
  end0: number;
  start: number;
  end: number;
  /** Moving for real (mouse moved, long press done, or the edge grabbed). */
  active: boolean;
  /** Dragged onto the hours on the left: letting go cancels. */
  cancel: boolean;
  clientX: number;
  clientY: number;
}

const top = (minute: number) => PAD_PX + (minute / 60) * HOUR_PX;

/**
 * The whole day, 0:00 to 24:00, as a vertical line of hours with its blocks on it.
 * Overlapping blocks stand side by side with an amber mark; calendar entries are hatched;
 * the red line is now. Tapping a block opens it, tapping a free spot adds a block there.
 * Holding a free spot (a long press on touch, a drag with the mouse) shows a new block that
 * follows the pointer; letting go opens it, letting go over the hours cancels. With
 * `onChange`, blocks move the same way and get longer or shorter at their bottom edge.
 * `scrollKey` scrolls to now (or the first block) whenever it changes.
 */
export function Timeline({
  blocks,
  nowMinute,
  currentId,
  onOpen,
  onChange,
  scrollKey,
  pushesOn = false,
}: {
  blocks: Block[];
  nowMinute: number | null;
  currentId: number | null;
  onOpen: (target: SheetTarget) => void;
  onChange?: (block: Block, start: number, end: number) => void;
  scrollKey?: string;
  /** Delay mode `cascade`: a longer block may run into the next (the server pushes it on). */
  pushesOn?: boolean;
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

  // Into view: now on today, else the first block (or the morning).
  const firstStart = blocks.length ? Math.min(...blocks.map((b) => b.start_minute)) : 7 * 60;
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (nowLine.current) return nowLine.current.scrollIntoView?.({ block: 'center' });
      const el = grid.current;
      if (!el || typeof window.scrollTo !== 'function') return;
      try {
        window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY + top(firstStart) - EDGE_TOP_PX) });
      } catch {
        // jsdom has no scrolling.
      }
    });
    return () => cancelAnimationFrame(frame);
    // Only when asked to (a tap on "Day", another date) - not on every change of the blocks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey]);

  // While something is held, the finger moves it instead of the page (iOS needs a
  // non-passive listener to be stopped).
  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    const hold = (event: TouchEvent) => dragRef.current?.active && event.preventDefault();
    el.addEventListener('touchmove', hold, { passive: false });
    return () => el.removeEventListener('touchmove', hold);
  }, []);

  /** Where the held thing lands for a pointer at (clientX, clientY). */
  const follow = (d: Drag, clientX: number, clientY: number): Drag => {
    const dy = clientY + window.scrollY - d.pageY0;
    let next = dragTimes(d.mode === 'resize' ? 'resize' : 'move', d.start0, d.end0, (dy / HOUR_PX) * 60);
    if (d.mode === 'create') {
      // A new block lands on quarter hours; existing ones move in 5-minute steps.
      const start = Math.min(DAY_MINUTES - 15, Math.round(next.start / 15) * 15);
      next = { start, end: fitEnd(blocks, start, NEW_BLOCK_MINUTES) };
    } else if (d.mode === 'resize' && !pushesOn) {
      next = { ...next, end: clampEnd(blocks, { id: d.id, start_minute: d.start0, end_minute: d.end0 }, next.end) };
    }
    const left = grid.current?.getBoundingClientRect().left ?? 0;
    const cancel = d.mode !== 'resize' && clientX < left + GUTTER_PX;
    return { ...d, ...next, cancel, clientX, clientY, active: true };
  };

  const dragging = drag !== null;
  const active = drag?.active ?? false;
  useEffect(() => {
    if (!dragging) return;
    const end = () => {
      window.clearTimeout(pressTimer.current);
      setDrag(null);
    };
    const move = (event: PointerEvent) => {
      const d = dragRef.current;
      if (!d || event.pointerId !== d.pointerId) return;
      if (!d.active) {
        if (Math.abs(event.clientY + window.scrollY - d.pageY0) < (d.touch ? 8 : 4) && Math.abs(event.clientX - d.clientX) < (d.touch ? 8 : 4)) return;
        // A finger that moves before the long press is scrolling the page.
        if (d.touch) return end();
      }
      setDrag(follow(d, event.clientX, event.clientY));
    };
    const up = (event: PointerEvent) => {
      const d = dragRef.current;
      if (!d || event.pointerId !== d.pointerId) return;
      if (d.active) {
        swallowClick.current = true;
        window.setTimeout(() => (swallowClick.current = false), 0);
        if (!d.cancel) {
          if (d.mode === 'create') onOpen({ start: d.start, end: d.end });
          else {
            const block = blocks.find((b) => b.id === d.id);
            if (block && (d.start !== d.start0 || d.end !== d.end0)) onChange?.(block, d.start, d.end);
          }
        }
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
    // follow() only reads refs and the grid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, blocks, onChange, onOpen]);

  // Held near the top or bottom of the screen: scroll on, the held thing stays under the finger.
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      const d = dragRef.current;
      if (!d?.active || typeof window.scrollBy !== 'function') return;
      const step = d.clientY < EDGE_TOP_PX ? -SCROLL_STEP_PX : d.clientY > window.innerHeight - EDGE_BOTTOM_PX ? SCROLL_STEP_PX : 0;
      if (!step) return;
      window.scrollBy(0, step);
      setDrag(follow(d, d.clientX, d.clientY));
    }, 16);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const begin = (event: ReactPointerEvent, d: Omit<Drag, 'pointerId' | 'touch' | 'pageY0' | 'start' | 'end' | 'active' | 'cancel' | 'clientX' | 'clientY'>) => {
    const touch = event.pointerType !== 'mouse';
    const held: Drag = {
      ...d,
      pointerId: event.pointerId,
      touch,
      pageY0: event.clientY + window.scrollY,
      start: d.start0,
      end: d.end0,
      // Mouse: starts on the first movement. Touch: only after a long press - also at the
      // edge, so scrolling over it never changes a block by accident.
      active: false,
      cancel: false,
      clientX: event.clientX,
      clientY: event.clientY,
    };
    setDrag(held);
    if (touch) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = window.setTimeout(() => {
        const current = dragRef.current;
        if (!current || current.pointerId !== held.pointerId) return;
        setDrag({ ...current, active: true });
        navigator.vibrate?.(10);
      }, LONG_PRESS_MS);
    }
  };

  const grab = (event: ReactPointerEvent<HTMLButtonElement>, block: Block) => {
    if (!onChange || block.source === 'calendar' || event.button > 0) return;
    event.stopPropagation();
    const mode: DragMode = (event.target as HTMLElement).closest('[data-resize]') ? 'resize' : 'move';
    begin(event, { id: block.id, mode, start0: block.start_minute, end0: block.end_minute });
  };

  /** The quarter hour under the pointer, so a new block starts there. */
  const minuteAt = (clientY: number) => {
    const y = clientY - (grid.current?.getBoundingClientRect().top ?? 0) - PAD_PX;
    return Math.max(0, Math.min(DAY_MINUTES - 15, Math.floor((y / HOUR_PX) * 4) * 15));
  };

  const press = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.button > 0) return;
    const start = minuteAt(event.clientY);
    begin(event, { id: 0, mode: 'create', start0: start, end0: fitEnd(blocks, start, NEW_BLOCK_MINUTES) });
  };

  const addAt = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || swallowClick.current) return;
    const start = minuteAt(event.clientY);
    onOpen({ start, end: fitEnd(blocks, start, NEW_BLOCK_MINUTES) });
  };

  const creating = drag?.mode === 'create' && drag.active ? drag : null;

  return (
    <div
      ref={grid}
      onClick={addAt}
      onPointerDown={press}
      onContextMenu={(e) => e.preventDefault()}
      className="relative cursor-copy select-none [-webkit-touch-callout:none]"
      style={{ height: 24 * HOUR_PX + 2 * PAD_PX }}
      aria-label={t('day.timeline')}
    >
      {HOURS.map((hour) => (
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
        const style = block.source === 'calendar' ? { ...look('other'), ...calendarLook(block.color), icon: '📅' } : look(block.category);
        return (
          <button
            key={block.id}
            type="button"
            onClick={() => !swallowClick.current && onOpen({ block: planned })}
            onPointerDown={(e) => grab(e, planned)}
            onContextMenu={(e) => movable && e.preventDefault()}
            className={`group absolute isolate [-webkit-touch-callout:none] ${held ? `z-20 cursor-grabbing shadow-xl ring-2 ${held.cancel ? 'opacity-50 ring-red-500' : 'ring-brand'}` : 'z-[1]'} flex min-w-0 overflow-hidden rounded-xl border-l-4 bg-surface px-2 text-left text-sm shadow-sm ${style.block} ${
              roomy ? 'flex-col justify-start py-1' : 'items-center gap-2'
            } ${block.status === 'done' ? 'opacity-55' : ''} ${block.status === 'skipped' ? 'opacity-40' : ''} ${
              held ? '' : block.id === currentId ? 'ring-2 ring-inset ring-brand' : overlaps ? 'ring-2 ring-inset ring-amber-500/80' : ''
            } ${held ? '' : 'transition hover:brightness-[0.97] active:scale-[0.99]'}`}
            style={{
              top: top(block.start_minute) + 1,
              height,
              left: `calc(${GUTTER} + (100% - ${GUTTER}) * ${lane / lanes})`,
              width: `calc((100% - ${GUTTER}) / ${lanes} - 4px)`,
            }}
          >
            <span aria-hidden className={`absolute inset-0 -z-10 ${style.tint} ${block.source === 'calendar' ? 'hatched' : ''}`} />
            <span className={`flex min-w-0 items-center gap-1.5 font-semibold ${block.status === 'skipped' ? 'line-through' : ''}`}>
              <span aria-hidden>{block.status === 'done' ? '✓' : style.icon}</span>
              <span className="truncate">{block.title}</span>
              {subtaskCount(block) && <span className="shrink-0 text-xs font-normal tabular-nums opacity-70">☑ {subtaskCount(block)}</span>}
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
              // Only the grip in the middle of the bottom edge changes the length; the rest of
              // the block moves it.
              <span data-resize aria-hidden className="absolute bottom-0 left-1/2 flex h-4 w-14 -translate-x-1/2 cursor-ns-resize items-end justify-center pb-1">
                <span className="h-1 w-8 rounded-full bg-current opacity-30 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-30" />
              </span>
            )}
          </button>
        );
      })}

      {creating && (
        <div
          aria-hidden
          className={`pointer-events-none absolute z-20 flex flex-col justify-start rounded-xl border-2 border-dashed px-2 py-1 text-sm font-semibold shadow-xl ${
            creating.cancel ? 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-300' : 'border-brand bg-brand/15 text-ink'
          }`}
          style={{ top: top(creating.start) + 1, height: ((creating.end - creating.start) / 60) * HOUR_PX - 2, left: GUTTER, right: 0 }}
        >
          <span>{creating.cancel ? t('day.dropToCancel') : t('block.new')}</span>
          <span className="text-xs font-normal tabular-nums opacity-75">
            {formatMinute(creating.start)}–{formatMinute(creating.end)}
          </span>
        </div>
      )}
      {drag?.active && drag.cancel && drag.mode !== 'create' && (
        <p aria-hidden className="pointer-events-none fixed inset-x-0 bottom-28 z-30 mx-auto w-fit rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {t('day.dropToCancel')}
        </p>
      )}

      {nowMinute !== null && (
        // In front of the blocks: now is always visible.
        <div ref={nowLine} className="pointer-events-none absolute right-0 z-10 flex items-center" style={{ top: top(nowMinute) - 6, left: `calc(${GUTTER} - 0.375rem)` }} aria-hidden>
          <span className="size-3 rounded-full bg-red-500 shadow ring-2 ring-canvas" />
          <span className="h-0.5 flex-1 bg-red-500 shadow-[0_0_0_1px_var(--canvas)]" />
        </div>
      )}
    </div>
  );
}

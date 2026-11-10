import type { Block } from '../api/day';

/** A block placed on the timeline: its column and how many columns its group of overlaps has. */
export interface Placed {
  block: Block;
  lane: number;
  lanes: number;
  /** Shares time with another block - marked on the timeline. */
  overlaps: boolean;
}

/**
 * Side by side where blocks overlap: each group of blocks that touch in time gets as many
 * columns as it needs at its busiest, every block the first free one.
 */
export function placeBlocks(blocks: Block[]): Placed[] {
  const sorted = [...blocks].sort((a, b) => a.start_minute - b.start_minute || b.end_minute - a.end_minute || a.id - b.id);
  const placed: Placed[] = [];
  let group: Placed[] = [];
  let groupEnd = -1;
  let laneEnds: number[] = [];

  const closeGroup = () => {
    const lanes = laneEnds.length;
    for (const p of group) {
      p.lanes = lanes;
      p.overlaps = lanes > 1 && group.some((o) => o !== p && o.block.start_minute < p.block.end_minute && p.block.start_minute < o.block.end_minute);
    }
    group = [];
    laneEnds = [];
  };

  for (const block of sorted) {
    if (block.start_minute >= groupEnd) {
      closeGroup();
      groupEnd = -1;
    }
    let lane = laneEnds.findIndex((end) => end <= block.start_minute);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(block.end_minute);
    } else {
      laneEnds[lane] = block.end_minute;
    }
    const p: Placed = { block, lane, lanes: 1, overlaps: false };
    group.push(p);
    placed.push(p);
    groupEnd = Math.max(groupEnd, block.end_minute);
  }
  closeGroup();
  return placed;
}

/**
 * What is on right now: the open block running at this minute (the latest started, if
 * several overlap), and the next open block that starts after it - or after now.
 */
export function nowAndNext(blocks: Block[], minute: number): { current: Block | null; next: Block | null } {
  const open = blocks.filter((b) => b.status === 'open').sort((a, b) => a.start_minute - b.start_minute || a.id - b.id);
  const running = open.filter((b) => b.start_minute <= minute && minute < b.end_minute);
  const current = running.length ? running[running.length - 1] : null;
  const next = open.find((b) => b !== current && b.start_minute > minute) ?? null;
  return { current, next };
}

export type DragMode = 'move' | 'resize';
const MIN_MINUTES = 5;
const DAY = 24 * 60;

/**
 * Where a dragged block lands: moved as a whole (its length stays, it stays within the
 * day) or its end pulled (at least 5 minutes long, 24:00 at the latest). Snaps to 5 minutes.
 */
export function dragTimes(mode: DragMode, start: number, end: number, deltaMinutes: number): { start: number; end: number } {
  const delta = Math.round(deltaMinutes / 5) * 5;
  if (mode === 'resize') return { start, end: Math.min(DAY, Math.max(start + MIN_MINUTES, end + delta)) };
  const length = end - start;
  const moved = Math.min(DAY - length, Math.max(0, start + delta));
  return { start: moved, end: moved + length };
}

/**
 * Where a new block ends: `length` minutes after `start`, but no later than the next block
 * begins - a new block fills the gap instead of running into the next one (at least 5 minutes).
 */
export function fitEnd(blocks: Block[], start: number, length = 60): number {
  const next = blocks.filter((b) => b.start_minute > start).reduce((min, b) => Math.min(min, b.start_minute), DAY);
  return Math.max(start + MIN_MINUTES, Math.min(start + length, next, DAY));
}

/**
 * Pulling a block's end down stops at the next block's start (delay mode `fixed`), so no
 * thin overlap appears. Already overlapping blocks keep their current end as the limit.
 */
export function clampEnd(blocks: Block[], block: { id: number; start_minute: number; end_minute: number }, end: number): number {
  const next = blocks
    .filter((b) => b.id !== block.id && b.start_minute > block.start_minute)
    .reduce((min, b) => Math.min(min, b.start_minute), DAY);
  return Math.min(end, Math.max(block.end_minute, next));
}

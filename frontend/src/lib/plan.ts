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

import { describe, expect, it } from 'vitest';
import type { Block } from '../api/day';
import { dragTimes, nowAndNext, placeBlocks } from './plan';

let id = 0;
const block = (start: number, end: number, extra: Partial<Block> = {}): Block => ({
  id: ++id,
  start_minute: start,
  end_minute: end,
  title: `b${id}`,
  category: 'other',
  source: 'manual',
  status: 'open',
  actual_start: null,
  actual_end: null,
  subtasks: [],
  ...extra,
});

describe('placeBlocks', () => {
  it('keeps blocks that follow each other in one column', () => {
    const placed = placeBlocks([block(420, 450), block(450, 480)]);
    expect(placed.map((p) => [p.lane, p.lanes, p.overlaps])).toEqual([
      [0, 1, false],
      [0, 1, false],
    ]);
  });

  it('puts overlapping blocks side by side and marks them', () => {
    const work = block(540, 1020);
    const meeting = block(600, 660);
    const lunch = block(720, 780);
    const evening = block(1080, 1140);
    const placed = new Map(placeBlocks([work, meeting, lunch, evening]).map((p) => [p.block.id, p]));
    expect(placed.get(work.id)).toMatchObject({ lane: 0, lanes: 2, overlaps: true });
    expect(placed.get(meeting.id)).toMatchObject({ lane: 1, lanes: 2, overlaps: true });
    // The meeting's column is free again by lunch.
    expect(placed.get(lunch.id)).toMatchObject({ lane: 1, lanes: 2, overlaps: true });
    expect(placed.get(evening.id)).toMatchObject({ lane: 0, lanes: 1, overlaps: false });
  });
});

describe('nowAndNext', () => {
  it('finds the running block and the one after', () => {
    const breakfast = block(420, 450);
    const bath = block(450, 480);
    expect(nowAndNext([bath, breakfast], 430)).toEqual({ current: breakfast, next: bath });
  });

  it('skips blocks already done and shows a gap as free time', () => {
    const breakfast = block(420, 450, { status: 'done' });
    const bath = block(460, 480);
    expect(nowAndNext([breakfast, bath], 440)).toEqual({ current: null, next: bath });
    expect(nowAndNext([breakfast, bath], 500)).toEqual({ current: null, next: null });
  });

  it('picks the latest started of overlapping blocks', () => {
    const work = block(540, 1020);
    const meeting = block(600, 660);
    expect(nowAndNext([work, meeting], 610)).toEqual({ current: meeting, next: null });
  });
});

describe('dragTimes', () => {
  it('moves a block as a whole, snapped to 5 minutes and within the day', () => {
    expect(dragTimes('move', 420, 450, 17)).toEqual({ start: 435, end: 465 });
    expect(dragTimes('move', 420, 450, -999)).toEqual({ start: 0, end: 30 });
    expect(dragTimes('move', 1380, 1410, 120)).toEqual({ start: 1410, end: 1440 });
  });

  it('pulls the end, never shorter than 5 minutes or past midnight', () => {
    expect(dragTimes('resize', 420, 450, 31)).toEqual({ start: 420, end: 480 });
    expect(dragTimes('resize', 420, 450, -60)).toEqual({ start: 420, end: 425 });
    expect(dragTimes('resize', 1380, 1410, 90)).toEqual({ start: 1380, end: 1440 });
  });
});

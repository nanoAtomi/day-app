import { describe, expect, it } from 'vitest';
import { isoWeek, mondayOf, weekdayName } from './templates';

describe('week helpers', () => {
  it('finds the Monday of a week', () => {
    expect(mondayOf('2026-11-10')).toBe('2026-11-09');
    expect(mondayOf('2026-11-15')).toBe('2026-11-09');
    expect(mondayOf('2026-11-09')).toBe('2026-11-09');
  });

  it('counts ISO weeks', () => {
    expect(isoWeek('2026-11-10')).toBe(46);
    expect(isoWeek('2027-01-01')).toBe(53);
    expect(isoWeek('2026-01-01')).toBe(1);
  });

  it('names weekdays from Monday', () => {
    expect(weekdayName(0, 'de')).toBe('Mo');
    expect(weekdayName(6, 'en', 'long')).toBe('Sunday');
  });
});

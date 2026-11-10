import { describe, expect, it } from 'vitest';
import { addDays, clockIn, formatDuration, formatMinute, parseTime } from './time';

describe('time helpers', () => {
  it('formats and parses times of day', () => {
    expect(formatMinute(450)).toBe('07:30');
    expect(formatMinute(1440)).toBe('24:00');
    expect(parseTime('7:30')).toBe(450);
    expect(parseTime('24:00')).toBe(1440);
    expect(parseTime('7:75')).toBeNull();
    expect(parseTime('soon')).toBeNull();
  });

  it('reads the clock in the user time zone', () => {
    // 23:30 UTC on 10 Nov is already 00:30 on 11 Nov in Berlin (winter time).
    expect(clockIn('Europe/Berlin', new Date('2026-11-10T23:30:00Z'))).toEqual({ date: '2026-11-11', minute: 30 });
    // Summer time: UTC+2.
    expect(clockIn('Europe/Berlin', new Date('2026-07-01T06:15:00Z'))).toEqual({ date: '2026-07-01', minute: 495 });
  });

  it('moves between days across month ends and clock changes', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-29', -1)).toBe('2026-03-28');
  });

  it('says how long', () => {
    const units = { h: 'h', min: 'min' };
    expect(formatDuration(40, units)).toBe('40 min');
    expect(formatDuration(60, units)).toBe('1 h');
    expect(formatDuration(75, units)).toBe('1 h 15 min');
    expect(formatDuration(0.2, units)).toBe('1 min');
  });
});

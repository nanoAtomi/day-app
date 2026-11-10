/** Times of day are minutes after local midnight (the backend's start_minute/end_minute). */
export const DAY_MINUTES = 24 * 60;

/** 450 → "07:30". */
export function formatMinute(minute: number): string {
  const m = Math.max(0, Math.min(DAY_MINUTES, Math.round(minute)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** "07:30" → 450; null for anything else. "24:00" is the end of the day. */
export function parseTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const minute = Number(match[1]) * 60 + Number(match[2]);
  return Number(match[2]) < 60 && minute <= DAY_MINUTES ? minute : null;
}

/** Rounds to the nearest step (15 minutes on the timeline). */
export function snap(minute: number, step = 15): number {
  return Math.round(minute / step) * step;
}

/** Today's date and the minute of the day in a time zone (the user's, Europe/Berlin by default). */
export function clockIn(timeZone: string, at: Date = new Date()): { date: string; minute: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minute: Number(parts.hour) * 60 + Number(parts.minute) + Number(parts.second) / 60,
  };
}

/** "2026-11-10" plus n days, without time-zone surprises. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "Dienstag, 10. November" in the active language. */
export function formatDate(date: string, language: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long' }): string {
  return new Intl.DateTimeFormat(language, { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
}

/** 75 → "1 h 15 min", 40 → "40 min". */
export function formatDuration(minutes: number, units: { h: string; min: string }): string {
  const m = Math.max(0, Math.ceil(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} ${units.min}`;
  return rest === 0 ? `${h} ${units.h}` : `${h} ${units.h} ${rest} ${units.min}`;
}

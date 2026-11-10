import type { Block, Template } from '../api/day';
import { addDays } from './time';

/** The backend's template colours, as the gradient behind the template's icon. */
export const TEMPLATE_COLORS = ['blue', 'teal', 'amber', 'rose', 'violet', 'slate'] as const;

const GRADIENT: Record<string, string> = {
  blue: 'from-sky-400 to-blue-600',
  teal: 'from-emerald-400 to-teal-600',
  amber: 'from-amber-300 to-orange-500',
  rose: 'from-pink-400 to-rose-600',
  violet: 'from-violet-400 to-purple-600',
  slate: 'from-slate-400 to-slate-600',
};

export function gradient(color: string): string {
  return GRADIENT[color] ?? GRADIENT.blue;
}

/** A template's blocks in the shape the timeline draws. */
export function templateBlocks(template: Template): Block[] {
  return template.blocks.map((b) => ({
    id: b.id,
    start_minute: b.start_minute,
    end_minute: b.start_minute + b.duration_minutes,
    title: b.title,
    category: b.category,
    source: 'template',
    status: 'open',
    actual_start: null,
    actual_end: null,
    subtasks: b.subtasks.map((title, i) => ({ id: i, title, done: false })),
  }));
}

/** Monday of the week the date is in. */
export function mondayOf(date: string): string {
  const weekday = (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -weekday);
}

/** 0 = Monday → "Mo" / "Mon" in the active language. */
export function weekdayName(weekday: number, language: string, width: 'short' | 'long' = 'short'): string {
  // 2024-01-01 was a Monday.
  return new Intl.DateTimeFormat(language, { weekday: width, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + weekday, 12)));
}

/** ISO week number of a date. */
export function isoWeek(date: string): number {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86_400_000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

export function TemplateIcon({ template, size = 'size-10 text-xl' }: { template: Pick<Template, 'icon' | 'color'>; size?: string }) {
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${gradient(template.color)} ${size} shadow-sm`}>
      {template.icon || '🗓️'}
    </span>
  );
}

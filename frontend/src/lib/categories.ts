/** What a block is about - the backend's CATEGORIES, with an emoji and a colour each. */
export const CATEGORIES = ['meal', 'care', 'commute', 'work', 'chores', 'sport', 'leisure', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

interface Look {
  icon: string;
  /** Block on the timeline: coloured edge and readable text in light and dark ... */
  block: string;
  /** ... on this tint, laid over the surface so hour lines never show through. */
  tint: string;
  /** The big card on "Now": a soft gradient. */
  hero: string;
  /** The progress bar. */
  bar: string;
}

export const LOOK: Record<Category, Look> = {
  meal: { icon: '🍳', block: 'border-amber-500 text-amber-950 dark:text-amber-100', tint: 'bg-amber-100 dark:bg-amber-500/20', hero: 'from-amber-400/25 to-orange-500/10', bar: 'bg-amber-500' },
  care: { icon: '🛁', block: 'border-cyan-500 text-cyan-950 dark:text-cyan-100', tint: 'bg-cyan-100 dark:bg-cyan-500/20', hero: 'from-cyan-400/25 to-sky-500/10', bar: 'bg-cyan-500' },
  commute: { icon: '🚆', block: 'border-slate-500 text-slate-900 dark:text-slate-100', tint: 'bg-slate-200 dark:bg-slate-500/25', hero: 'from-slate-400/30 to-slate-500/10', bar: 'bg-slate-500' },
  work: { icon: '💼', block: 'border-blue-500 text-blue-950 dark:text-blue-100', tint: 'bg-blue-100 dark:bg-blue-500/20', hero: 'from-blue-500/25 to-indigo-500/10', bar: 'bg-blue-500' },
  chores: { icon: '🧹', block: 'border-lime-600 text-lime-950 dark:text-lime-100', tint: 'bg-lime-100 dark:bg-lime-500/20', hero: 'from-lime-400/25 to-green-500/10', bar: 'bg-lime-600' },
  sport: { icon: '🏋️', block: 'border-rose-500 text-rose-950 dark:text-rose-100', tint: 'bg-rose-100 dark:bg-rose-500/20', hero: 'from-rose-400/25 to-pink-500/10', bar: 'bg-rose-500' },
  leisure: { icon: '🎮', block: 'border-violet-500 text-violet-950 dark:text-violet-100', tint: 'bg-violet-100 dark:bg-violet-500/20', hero: 'from-violet-400/25 to-purple-500/10', bar: 'bg-violet-500' },
  other: { icon: '⭐', block: 'border-teal-500 text-teal-950 dark:text-teal-100', tint: 'bg-teal-100 dark:bg-teal-500/20', hero: 'from-teal-400/25 to-emerald-500/10', bar: 'bg-teal-500' },
};

export function look(category: string): Look {
  return LOOK[(CATEGORIES as readonly string[]).includes(category) ? (category as Category) : 'other'];
}

/** Calendar entries take their calendar's colour instead of a category's. */
const CALENDAR: Record<string, { block: string; tint: string; dot: string }> = {
  slate: { block: 'border-slate-500 text-slate-900 dark:text-slate-100', tint: 'bg-slate-100 dark:bg-slate-500/20', dot: 'bg-slate-500' },
  blue: { block: 'border-blue-500 text-blue-950 dark:text-blue-100', tint: 'bg-blue-50 dark:bg-blue-500/15', dot: 'bg-blue-500' },
  teal: { block: 'border-teal-500 text-teal-950 dark:text-teal-100', tint: 'bg-teal-50 dark:bg-teal-500/15', dot: 'bg-teal-500' },
  amber: { block: 'border-amber-500 text-amber-950 dark:text-amber-100', tint: 'bg-amber-50 dark:bg-amber-500/15', dot: 'bg-amber-500' },
  rose: { block: 'border-rose-500 text-rose-950 dark:text-rose-100', tint: 'bg-rose-50 dark:bg-rose-500/15', dot: 'bg-rose-500' },
  violet: { block: 'border-violet-500 text-violet-950 dark:text-violet-100', tint: 'bg-violet-50 dark:bg-violet-500/15', dot: 'bg-violet-500' },
};

export function calendarLook(color: string | null | undefined) {
  return CALENDAR[color ?? 'slate'] ?? CALENDAR.slate;
}

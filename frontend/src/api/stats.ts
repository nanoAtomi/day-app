import { useQuery } from '@tanstack/react-query';
import { api } from './client';

export interface DayStats {
  date: string;
  done: number;
  skipped: number;
  missed: number;
  /** done / everything that was due; null when nothing was. */
  rate: number | null;
}

export interface Stats {
  days: DayStats[];
  weeks: (Omit<DayStats, 'date'> & { start: string })[];
  streak: number;
  often_skipped: { title: string; skipped: number; total: number }[];
}

export function useStats(days = 28) {
  return useQuery({ queryKey: ['stats', days], queryFn: () => api<Stats>(`/api/stats?days=${days}`) });
}

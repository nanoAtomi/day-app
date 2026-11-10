import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export interface CalendarSource {
  id: number;
  name: string;
  color: string;
  /** Only the host - the full address works like a password and never comes back. */
  host: string;
  last_sync_at: string | null;
  /** Error code of the last sync (see `calendar.errors.*`), null when it worked. */
  last_error: string | null;
  events: number;
}

export const CALENDAR_COLORS = ['slate', 'blue', 'teal', 'amber', 'rose', 'violet'] as const;

export function useCalendars() {
  return useQuery({ queryKey: ['calendars'], queryFn: () => api<CalendarSource[]>('/api/calendars') });
}

/** Calendars change what every day shows. */
function useCalendarMutation<V, R>(request: (vars: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['calendars'] });
      void queryClient.invalidateQueries({ queryKey: ['day'] });
      void queryClient.invalidateQueries({ queryKey: ['week'] });
    },
  });
}

export function useAddCalendar() {
  return useCalendarMutation((input: { name: string; url: string; color: string }) => api<CalendarSource>('/api/calendars', { method: 'POST', body: input }));
}

export function useSyncCalendar() {
  return useCalendarMutation((id: number) => api<CalendarSource>(`/api/calendars/${id}/sync`, { method: 'POST' }));
}

export function useDeleteCalendar() {
  return useCalendarMutation((id: number) => api<null>(`/api/calendars/${id}`, { method: 'DELETE' }));
}

/** The error code from a refused address ({"detail": {"code": ...}}). */
export function errorCode(error: unknown): string {
  const detail = (error as { detail?: { detail?: { code?: string } } })?.detail?.detail;
  return detail?.code ?? 'unreadable';
}

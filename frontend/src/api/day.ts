import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export interface Me {
  id: number;
  username: string;
  email: string | null;
  display_name: string;
  timezone: string;
  delay_mode: 'fixed' | 'cascade';
  notify_lead_minutes: number | null;
  portal_url: string | null;
  logout_url: string | null;
  feedback_url: string | null;
  /** A superuser's "view as"; null for everyone else. */
  view: 'superuser' | 'admin' | 'user' | null;
}

export interface Subtask {
  id: number;
  title: string;
  done: boolean;
}

export type BlockStatus = 'open' | 'done' | 'skipped';

export interface Block {
  id: number;
  start_minute: number;
  end_minute: number;
  title: string;
  category: string;
  source: 'template' | 'manual' | 'calendar';
  status: BlockStatus;
  actual_start: string | null;
  actual_end: string | null;
  subtasks: Subtask[];
}

export interface Day {
  date: string;
  template_id: number | null;
  delay_mode: 'fixed' | 'cascade';
  delay_mode_override: 'fixed' | 'cascade' | null;
  blocks: Block[];
}

export interface BlockInput {
  start_minute: number;
  end_minute: number;
  title: string;
  category: string;
}

export type BlockChange = Partial<BlockInput> & { status?: BlockStatus };

export function useMe() {
  return useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/api/me'), staleTime: 5 * 60_000 });
}

const dayKey = (date: string) => ['day', date] as const;

export function useDay(date: string) {
  return useQuery({ queryKey: dayKey(date), queryFn: () => api<Day>(`/api/days/${date}`) });
}

const byStart = (a: Block, b: Block) => a.start_minute - b.start_minute || a.id - b.id;

/** Changes show at once; the server's answer replaces them, an error rolls them back. */
function useDayMutation<V>(date: string, request: (vars: V) => Promise<unknown>, optimistic: (day: Day, vars: V) => Day) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onMutate: async (vars: V) => {
      await queryClient.cancelQueries({ queryKey: dayKey(date) });
      const before = queryClient.getQueryData<Day>(dayKey(date));
      if (before) queryClient.setQueryData<Day>(dayKey(date), optimistic(before, vars));
      return { before };
    },
    onError: (_error, _vars, context) => {
      if (context?.before) queryClient.setQueryData(dayKey(date), context.before);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: dayKey(date) }),
  });
}

export function useCreateBlock(date: string) {
  return useDayMutation(
    date,
    (input: BlockInput) => api<Block>(`/api/days/${date}/blocks`, { method: 'POST', body: input }),
    (day, input) => ({
      ...day,
      blocks: [
        ...day.blocks,
        { ...input, id: -Date.now(), source: 'manual' as const, status: 'open' as const, actual_start: null, actual_end: null, subtasks: [] },
      ].sort(byStart),
    }),
  );
}

export function useUpdateBlock(date: string) {
  return useDayMutation(
    date,
    ({ id, ...change }: BlockChange & { id: number }) => api<Block>(`/api/blocks/${id}`, { method: 'PATCH', body: change }),
    (day, { id, ...change }) => ({ ...day, blocks: day.blocks.map((b) => (b.id === id ? { ...b, ...change } : b)).sort(byStart) }),
  );
}

export function useDeleteBlock(date: string) {
  return useDayMutation(
    date,
    (id: number) => api<null>(`/api/blocks/${id}`, { method: 'DELETE' }),
    (day, id) => ({ ...day, blocks: day.blocks.filter((b) => b.id !== id) }),
  );
}

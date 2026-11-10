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
  notify_start: boolean;
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
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: dayKey(date) });
      void queryClient.invalidateQueries({ queryKey: ['week'] });
    },
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

// ------------------------------------------------------------- templates

export interface TemplateBlock {
  id: number;
  start_minute: number;
  duration_minutes: number;
  title: string;
  category: string;
  subtasks: string[];
}

export type TemplateKind = 'day' | 'module';

export interface Template {
  id: number;
  name: string;
  color: string;
  icon: string;
  kind: TemplateKind;
  /** Weekdays (0 = Monday) that start from this template. */
  weekdays: number[];
  blocks: TemplateBlock[];
}

export interface TemplateInput {
  name: string;
  color: string;
  icon: string;
  kind?: TemplateKind;
}

export type TemplateBlockInput = Omit<TemplateBlock, 'id'>;

export function useTemplates() {
  return useQuery({ queryKey: ['templates'], queryFn: () => api<Template[]>('/api/templates') });
}

/** Weeks and not-yet-opened days are previews of the templates: refresh them after a change. */
function useTemplateMutation<V, R>(request: (vars: V) => Promise<R>, onDone?: (result: R) => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (result) => onDone?.(result),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['templates'] });
      void queryClient.invalidateQueries({ queryKey: ['week'] });
    },
  });
}

export function useCreateTemplate(onCreated?: (t: Template) => void) {
  return useTemplateMutation((input: TemplateInput) => api<Template>('/api/templates', { method: 'POST', body: input }), onCreated);
}

export function useUpdateTemplate() {
  return useTemplateMutation(({ id, ...input }: Partial<TemplateInput> & { id: number }) => api<Template>(`/api/templates/${id}`, { method: 'PATCH', body: input }));
}

export function useDeleteTemplate() {
  return useTemplateMutation((id: number) => api<null>(`/api/templates/${id}`, { method: 'DELETE' }));
}

export function useAddTemplateBlock(templateId: number) {
  return useTemplateMutation((input: TemplateBlockInput) => api<Template>(`/api/templates/${templateId}/blocks`, { method: 'POST', body: input }));
}

export function useUpdateTemplateBlock() {
  return useTemplateMutation(({ id, ...input }: Partial<TemplateBlockInput> & { id: number }) => api<Template>(`/api/template-blocks/${id}`, { method: 'PATCH', body: input }));
}

export function useDeleteTemplateBlock() {
  return useTemplateMutation((id: number) => api<Template>(`/api/template-blocks/${id}`, { method: 'DELETE' }));
}

export function useSetWeekday() {
  return useTemplateMutation(({ weekday, templateId }: { weekday: number; templateId: number | null }) =>
    api<null>(`/api/weekdays/${weekday}`, { method: 'PUT', body: { template_id: templateId } }),
  );
}

// ------------------------------------------------------------- week and day templates

export interface WeekDay extends Day {
  /** False: not opened yet - a preview of its template. */
  stored: boolean;
}

export function useWeek(from: string) {
  return useQuery({ queryKey: ['week', from], queryFn: () => api<WeekDay[]>(`/api/days?from=${from}&days=7`) });
}

/** A day changed as a whole: show the answer at once and refresh the week around it. */
function useWholeDayMutation<V>(date: string, request: (vars: V) => Promise<Day>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: (day) => queryClient.setQueryData(dayKey(date), day),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: dayKey(date) });
      void queryClient.invalidateQueries({ queryKey: ['week'] });
    },
  });
}

export function useSetDayTemplate(date: string) {
  return useWholeDayMutation(date, (templateId: number | null) => api<Day>(`/api/days/${date}/template`, { method: 'PUT', body: { template_id: templateId } }));
}

export function useInsertModule(date: string) {
  return useWholeDayMutation(date, ({ templateId, start }: { templateId: number; start: number }) =>
    api<Day>(`/api/days/${date}/modules`, { method: 'POST', body: { template_id: templateId, start_minute: start } }),
  );
}

// ------------------------------------------------------------- delay mode

export type DelayMode = 'fixed' | 'cascade';

/** The day's own delay mode; null follows the user's default. */
export function useSetDayDelayMode(date: string) {
  return useWholeDayMutation(date, (mode: DelayMode | null) => api<Day>(`/api/days/${date}`, { method: 'PATCH', body: { delay_mode: mode } }));
}

export function useUpdateMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: Partial<Pick<Me, 'delay_mode' | 'notify_lead_minutes' | 'notify_start' | 'timezone'>>) => api<Me>('/api/me', { method: 'PATCH', body: change }),
    onSuccess: (me) => queryClient.setQueryData(['me'], me),
    // Days follow the default unless they have their own.
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['day'] }),
  });
}

// ------------------------------------------------------------- subtasks

const withSubtasks = (day: Day, blockId: number, change: (subtasks: Subtask[]) => Subtask[]): Day => ({
  ...day,
  blocks: day.blocks.map((b) => (b.id === blockId ? { ...b, subtasks: change(b.subtasks) } : b)),
});

export function useAddSubtask(date: string) {
  return useDayMutation(
    date,
    ({ blockId, title }: { blockId: number; title: string }) => api<Subtask>(`/api/blocks/${blockId}/subtasks`, { method: 'POST', body: { title } }),
    (day, { blockId, title }) => withSubtasks(day, blockId, (list) => [...list, { id: -Date.now(), title, done: false }]),
  );
}

export function useUpdateSubtask(date: string) {
  return useDayMutation(
    date,
    ({ id, ...change }: { id: number; blockId: number; title?: string; done?: boolean }) => {
      const body: { title?: string; done?: boolean } = {};
      if (change.title !== undefined) body.title = change.title;
      if (change.done !== undefined) body.done = change.done;
      return api<Subtask>(`/api/subtasks/${id}`, { method: 'PATCH', body });
    },
    (day, { id, blockId, title, done }) =>
      withSubtasks(day, blockId, (list) => list.map((s) => (s.id === id ? { ...s, ...(title !== undefined ? { title } : {}), ...(done !== undefined ? { done } : {}) } : s))),
  );
}

export function useDeleteSubtask(date: string) {
  return useDayMutation(
    date,
    ({ id }: { id: number; blockId: number }) => api<null>(`/api/subtasks/${id}`, { method: 'DELETE' }),
    (day, { id, blockId }) => withSubtasks(day, blockId, (list) => list.filter((s) => s.id !== id)),
  );
}

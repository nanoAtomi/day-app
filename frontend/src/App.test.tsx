import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { Block, Day, Me } from './api/day';
import i18n from './i18n';

const me: Me = {
  id: 1,
  username: 'alice',
  email: 'alice@example.com',
  display_name: 'Alice',
  timezone: 'Europe/Berlin',
  delay_mode: 'fixed',
  notify_lead_minutes: null,
  notify_start: true,
  portal_url: 'https://portal.example',
  logout_url: 'https://portal.example/logout',
  feedback_url: 'https://portal.example/feedback?app=day',
  view: null,
};

const block = (id: number, start: number, end: number, title: string, category: string): Block => ({
  id,
  start_minute: start,
  end_minute: end,
  title,
  category,
  source: 'manual',
  status: 'open',
  actual_start: null,
  actual_end: null,
  subtasks: [],
});

let day: Day;
let requests: { method: string; url: string; body: unknown }[];

function renderApp(path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('App', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('de');
    // 10 Nov 2026, 07:40 in Berlin.
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-10T06:40:00Z') });
    day = {
      date: '2026-11-10',
      template_id: null,
      delay_mode: 'fixed',
      delay_mode_override: null,
      blocks: [block(1, 420, 450, 'Frühstück', 'meal'), block(2, 450, 480, 'Bad/Anziehen', 'care'), block(3, 480, 540, 'Arbeitsweg', 'commute')],
    };
    requests = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        requests.push({ method, url, body });
        if (url === '/api/me') return Response.json(me);
        if (url.startsWith('/api/days/')) return Response.json({ ...day, date: url.slice('/api/days/'.length) });
        if (url === '/api/templates') return Response.json([]);
        if (/^\/api\/subtasks\/\d+$/.test(url)) return Response.json({ id: Number(url.split('/').pop()), title: 'x', done: body?.done ?? false });
        if (/^\/api\/blocks\/\d+\/subtasks$/.test(url)) return Response.json({ id: 99, title: body.title, done: false }, { status: 201 });
        if (/^\/api\/days\/[\d-]+$/.test(url) && method === 'PATCH') {
          day = { ...day, delay_mode: body.delay_mode ?? 'fixed', delay_mode_override: body.delay_mode };
          return Response.json(day);
        }
        const match = /^\/api\/blocks\/(\d+)$/.exec(url);
        if (match && method === 'PATCH') {
          day = { ...day, blocks: day.blocks.map((b) => (b.id === Number(match[1]) ? { ...b, ...body } : b)) };
          return Response.json(day.blocks.find((b) => b.id === Number(match[1])));
        }
        return Response.json({ detail: 'Not found' }, { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows the running block with its time left and the next one', async () => {
    renderApp();
    const current = await screen.findByRole('region', { name: 'Aktueller Block' });
    expect(within(current).getByText('Bad/Anziehen')).toBeInTheDocument();
    expect(within(current).getByText('noch 20 min')).toBeInTheDocument();
    expect(within(current).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '33');
    // Up next (the timeline beside it shows the block too).
    expect(screen.getByRole('button', { name: /Danach\s*Arbeitsweg\s*08:00\s*in 20 min/ })).toBeInTheDocument();
  });

  it('marks the block done and extends it by 15 minutes', async () => {
    const user = userEvent.setup();
    renderApp();
    const current = await screen.findByRole('region', { name: 'Aktueller Block' });
    await user.click(within(current).getByRole('button', { name: '+15 min' }));
    expect(requests).toContainEqual({ method: 'PATCH', url: '/api/blocks/2', body: { end_minute: 495 } });
    await user.click(within(current).getByRole('button', { name: /Erledigt/ }));
    expect(requests).toContainEqual({ method: 'PATCH', url: '/api/blocks/2', body: { status: 'done' } });
  });

  it('welcomes an empty day with a way to add the first block', async () => {
    day = { ...day, blocks: [] };
    renderApp();
    expect(await screen.findByText('Noch ziemlich leer hier.')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Ersten Block anlegen' }));
    expect(await screen.findByRole('textbox', { name: 'Was steht an?' })).toBeInTheDocument();
  });

  it('opens another day from the URL', async () => {
    renderApp('/day?date=2026-11-12');
    expect(await screen.findByRole('heading', { name: /12\. November/ })).toBeInTheDocument();
    expect(requests.some((r) => r.url === '/api/days/2026-11-12')).toBe(true);
  });

  it('moves a block by dragging and pulls its end', async () => {
    renderApp('/day');
    const commute = (await screen.findAllByRole('button', { name: /Arbeitsweg/ })).at(-1)!;
    // An hour is 64 px: drag 64 px down = one hour later.
    fireEvent.pointerDown(commute, { pointerId: 1, pointerType: 'mouse', button: 0, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 200, clientY: 164 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 200, clientY: 164 });
    await waitFor(() => expect(requests).toContainEqual({ method: 'PATCH', url: '/api/blocks/3', body: { start_minute: 540, end_minute: 600 } }));

    // The grip of the (moved) commute, now 09:00-10:00: 16 px = 15 minutes longer.
    const commuteAgain = (await screen.findAllByRole('button', { name: /Arbeitsweg/ })).at(-1)!;
    fireEvent.pointerDown(commuteAgain.querySelector('[data-resize]')!, { pointerId: 2, pointerType: 'mouse', button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 200, clientY: 216 });
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 200, clientY: 216 });
    await waitFor(() => expect(requests.some((r) => r.method === 'PATCH' && r.url === '/api/blocks/3' && (r.body as { end_minute: number }).end_minute === 615)).toBe(true));

    // Pulling breakfast down stops where the bath begins (07:30) - no thin overlap.
    const breakfast = (await screen.findAllByRole('button', { name: /Frühstück/ })).at(-1)!;
    fireEvent.pointerDown(breakfast.querySelector('[data-resize]')!, { pointerId: 5, pointerType: 'mouse', button: 0, clientX: 200, clientY: 300 });
    fireEvent.pointerMove(window, { pointerId: 5, clientX: 200, clientY: 364 });
    fireEvent.pointerUp(window, { pointerId: 5, clientX: 200, clientY: 364 });
    expect(requests.some((r) => r.method === 'PATCH' && r.url === '/api/blocks/1')).toBe(false);

    // On touch the grip needs a long press: a finger moving at once is scrolling.
    fireEvent.pointerDown(commuteAgain.querySelector('[data-resize]')!, { pointerId: 6, pointerType: 'touch', button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(window, { pointerId: 6, clientX: 200, clientY: 260 });
    fireEvent.pointerUp(window, { pointerId: 6, clientX: 200, clientY: 260 });
    expect(requests.filter((r) => r.method === 'PATCH' && r.url === '/api/blocks/3')).toHaveLength(2);
  });

  it('switches the day to pushing back', async () => {
    const user = userEvent.setup();
    renderApp('/day');
    await user.click(await screen.findByRole('switch', { name: 'Bei Verspätung nachrutschen' }));
    await waitFor(() => expect(requests).toContainEqual({ method: 'PATCH', url: '/api/days/2026-11-10', body: { delay_mode: 'cascade' } }));
  });

  it('keeps the keyboard closed on phones when adding a block', async () => {
    document.documentElement.classList.add('phone');
    try {
      day = { ...day, blocks: [] };
      renderApp();
      await userEvent.setup().click(await screen.findByRole('button', { name: 'Ersten Block anlegen' }));
      expect(await screen.findByRole('textbox', { name: 'Was steht an?' })).not.toHaveFocus();
    } finally {
      document.documentElement.classList.remove('phone');
    }
  });

  it('places a new block by holding a free spot and opens it', async () => {
    day = { ...day, blocks: [] };
    renderApp('/day');
    const grid = await screen.findByLabelText('Zeitleiste');
    // 12 px padding + 8 hours of 64 px: 08:00. Dragging 32 px down: half an hour later.
    fireEvent.pointerDown(grid, { pointerId: 3, pointerType: 'mouse', button: 0, clientX: 200, clientY: 12 + 8 * 64 + 5 });
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 200, clientY: 12 + 8 * 64 + 37 });
    fireEvent.pointerUp(window, { pointerId: 3, clientX: 200, clientY: 12 + 8 * 64 + 37 });
    expect(await screen.findByRole('heading', { name: 'Neuer Block' })).toBeInTheDocument();
    expect(screen.getByLabelText('Beginn')).toHaveValue('08:30');
    expect(screen.getByLabelText('Ende')).toHaveValue('09:30');
  });

  it('cancels placing a block when it is dragged onto the hours', async () => {
    day = { ...day, blocks: [] };
    renderApp('/day');
    const grid = await screen.findByLabelText('Zeitleiste');
    fireEvent.pointerDown(grid, { pointerId: 4, pointerType: 'mouse', button: 0, clientX: 200, clientY: 600 });
    fireEvent.pointerMove(window, { pointerId: 4, clientX: 10, clientY: 640 });
    expect(screen.getAllByText('Loslassen zum Abbrechen').length).toBeGreaterThan(0);
    fireEvent.pointerUp(window, { pointerId: 4, clientX: 10, clientY: 640 });
    expect(screen.queryByRole('heading', { name: 'Neuer Block' })).not.toBeInTheDocument();
  });

  it('ticks off subtasks of the running block and adds new ones in its sheet', async () => {
    const user = userEvent.setup();
    day = {
      ...day,
      blocks: day.blocks.map((b) => (b.id === 2 ? { ...b, subtasks: [{ id: 21, title: 'Zähne putzen', done: false }, { id: 22, title: 'Anziehen', done: true }] } : b)),
    };
    renderApp();
    const current = await screen.findByRole('region', { name: 'Aktueller Block' });
    expect(within(current).getByText('1/2')).toBeInTheDocument();
    await user.click(within(current).getByRole('checkbox', { name: 'Zähne putzen' }));
    await waitFor(() => expect(requests).toContainEqual({ method: 'PATCH', url: '/api/subtasks/21', body: { done: true } }));

    await user.click(within(current).getByRole('button', { name: /Bad\/Anziehen/ }));
    await user.type(await screen.findByRole('textbox', { name: 'Neue Unteraufgabe' }), 'Haare föhnen{Enter}');
    await waitFor(() => expect(requests).toContainEqual({ method: 'POST', url: '/api/blocks/2/subtasks', body: { title: 'Haare föhnen' } }));
  });

  it('shows a running appointment without done, skip or +15', async () => {
    day = {
      ...day,
      blocks: [{ ...block(-1000007, 450, 480, 'Team-Meeting', 'other'), source: 'calendar', calendar: 'Arbeit', color: 'blue' }],
    };
    renderApp();
    const current = await screen.findByRole('region', { name: 'Aktueller Block' });
    expect(within(current).getByText('Team-Meeting')).toBeInTheDocument();
    expect(within(current).getByText(/Aus deinem Kalender „Arbeit“/)).toBeInTheDocument();
    expect(within(current).queryByRole('button', { name: '+15 min' })).not.toBeInTheDocument();
  });

  it('deletes without asking and brings the block back on undo', async () => {
    const user = userEvent.setup();
    renderApp('/day');
    await user.click((await screen.findAllByRole('button', { name: /Arbeitsweg/ })).at(-1)!);
    await user.click(await screen.findByRole('button', { name: 'Löschen' }));
    await waitFor(() => expect(requests).toContainEqual({ method: 'DELETE', url: '/api/blocks/3', body: undefined }));
    const note = await screen.findByText('„Arbeitsweg“ gelöscht.');
    await user.click(within(note.parentElement!).getByRole('button', { name: 'Rückgängig' }));
    await waitFor(() =>
      expect(requests).toContainEqual({ method: 'POST', url: '/api/days/2026-11-10/blocks', body: { start_minute: 480, end_minute: 540, title: 'Arbeitsweg', category: 'commute' } }),
    );
  });

  it('a tap leaves a draft that fits the gap; tapping it opens the sheet', async () => {
    renderApp('/day');
    const grid = await screen.findByLabelText('Zeitleiste');
    // Tapping 06:45 (12 px + 6.75 h): an hour would run into breakfast at 07:00.
    fireEvent.click(grid, { clientX: 200, clientY: 12 + 6.75 * 64 + 2 });
    const draft = screen.getByRole('button', { name: /Entwurf 06:45–07:00/ });
    expect(screen.queryByLabelText('Beginn')).not.toBeInTheDocument(); // nothing saved, no sheet yet
    fireEvent.click(draft);
    expect(await screen.findByLabelText('Beginn')).toHaveValue('06:45');
    expect(screen.getByLabelText('Ende')).toHaveValue('07:00');
    expect(screen.getByRole('combobox', { name: 'Art' })).toHaveValue('other');
    expect(requests.some((r) => r.method === 'POST')).toBe(false);
  });

  it('moves a draft at once and throws it away on a tap beside it', async () => {
    day = { ...day, blocks: [] };
    renderApp('/day');
    const grid = await screen.findByLabelText('Zeitleiste');
    fireEvent.click(grid, { clientX: 200, clientY: 12 + 8 * 64 + 2 }); // 08:00
    const draft = screen.getByRole('button', { name: /Entwurf 08:00–09:00/ });
    // Touch moves a draft without a long press: 64 px = one hour later.
    fireEvent.pointerDown(draft, { pointerId: 7, pointerType: 'touch', button: 0, clientX: 200, clientY: 600 });
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 200, clientY: 664 });
    fireEvent.pointerUp(window, { pointerId: 7, clientX: 200, clientY: 664 });
    expect(await screen.findByRole('button', { name: /Entwurf 09:00–10:00/ })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 0)); // the swallowed click after a drag
    fireEvent.click(grid, { clientX: 200, clientY: 12 + 15 * 64 });
    expect(screen.queryByRole('button', { name: /Entwurf/ })).not.toBeInTheDocument();
    expect(requests.some((r) => r.method === 'POST')).toBe(false);
  });
});

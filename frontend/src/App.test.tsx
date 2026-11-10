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
    fireEvent.pointerDown(commute, { pointerId: 1, pointerType: 'mouse', button: 0, clientY: 100 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 164 });
    fireEvent.pointerUp(window, { pointerId: 1, clientY: 164 });
    await waitFor(() => expect(requests).toContainEqual({ method: 'PATCH', url: '/api/blocks/3', body: { start_minute: 540, end_minute: 600 } }));

    const bath = (await screen.findAllByRole('button', { name: /Bad\/Anziehen/ })).at(-1)!;
    const edge = bath.querySelector('[data-resize]')!;
    fireEvent.pointerDown(edge, { pointerId: 2, pointerType: 'touch', button: 0, clientY: 200 });
    fireEvent.pointerMove(window, { pointerId: 2, clientY: 216 });
    fireEvent.pointerUp(window, { pointerId: 2, clientY: 216 });
    await waitFor(() => expect(requests).toContainEqual({ method: 'PATCH', url: '/api/blocks/2', body: { start_minute: 450, end_minute: 495 } }));
  });

  it('switches the day to pushing back', async () => {
    const user = userEvent.setup();
    renderApp('/day');
    await user.click(await screen.findByRole('button', { name: 'Fest' }));
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
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import type { Day, Me, Template, WeekDay } from '../api/day';
import i18n from '../i18n';

const me: Me = {
  id: 1, username: 'alice', email: 'alice@example.com', display_name: 'Alice', timezone: 'Europe/Berlin', delay_mode: 'fixed',
  notify_lead_minutes: null, notify_start: true, portal_url: null, logout_url: null, feedback_url: null, view: null,
};

const office: Template = {
  id: 1, name: 'Bürotag', color: 'blue', icon: '💼', kind: 'day', weekdays: [0, 1, 2, 3, 4],
  blocks: [{ id: 11, start_minute: 420, duration_minutes: 30, title: 'Frühstück', category: 'meal', subtasks: [] }],
};
const home: Template = { id: 2, name: 'Homeoffice', color: 'teal', icon: '🏠', kind: 'day', weekdays: [], blocks: [] };
const training: Template = {
  id: 4, name: 'Training', color: 'rose', icon: '🏋️', kind: 'module', weekdays: [],
  blocks: [
    { id: 41, start_minute: 1080, duration_minutes: 15, title: 'Anfahrt', category: 'commute', subtasks: [] },
    { id: 42, start_minute: 1095, duration_minutes: 75, title: 'Training', category: 'sport', subtasks: ['Kraft'] },
  ],
};

const day = (date: string, extra: Partial<WeekDay> = {}): WeekDay => ({
  date, stored: false, template_id: 1, delay_mode: 'fixed', delay_mode_override: null,
  blocks: [{ id: -1, start_minute: 420, end_minute: 450, title: 'Frühstück', category: 'meal', source: 'template', status: 'open', actual_start: null, actual_end: null, subtasks: [] }],
  ...extra,
});

let requests: { method: string; url: string; body: unknown }[];

function renderApp(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('templates, week and modules', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('de');
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-11-10T06:40:00Z') }); // Tuesday 07:40 Berlin
    requests = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        requests.push({ method, url, body });
        if (url === '/api/me') return Response.json(me);
        if (url === '/api/templates') return Response.json([office, home, training]);
        if (url.startsWith('/api/days?from=')) {
          const dates = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
          return Response.json(dates.map((d) => day(d)));
        }
        if (url.startsWith('/api/weekdays/')) return new Response(null, { status: 204 });
        const dayMatch = /^\/api\/days\/([\d-]+)(\/.*)?$/.exec(url);
        if (dayMatch) return Response.json({ ...day(dayMatch[1], { stored: true }) } satisfies Day);
        return Response.json({ detail: 'Not found' }, { status: 404 });
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('shows the week and switches a day to another template', async () => {
    const user = userEvent.setup();
    renderApp('/week');
    expect(await screen.findByRole('heading', { name: 'KW 46' })).toBeInTheDocument();
    const wednesday = await screen.findByRole('combobox', { name: /Mittwoch, 11\. November/ });
    await user.selectOptions(wednesday, '2');
    expect(requests).toContainEqual({ method: 'PUT', url: '/api/days/2026-11-11/template', body: { template_id: 2 } });
    // The past can't be switched.
    expect(screen.getByRole('combobox', { name: /Montag, 9\. November/ })).toBeDisabled();
  });

  it('assigns weekdays to a day template', async () => {
    const user = userEvent.setup();
    renderApp('/templates');
    const weekdays = await screen.findByRole('group', { name: 'Wochentage für Homeoffice' });
    await user.click(within(weekdays).getByRole('button', { name: 'Fr' }));
    expect(requests).toContainEqual({ method: 'PUT', url: '/api/weekdays/4', body: { template_id: 2 } });
    const officeDays = screen.getByRole('group', { name: 'Wochentage für Bürotag' });
    await user.click(within(officeDays).getByRole('button', { name: 'Mo' }));
    expect(requests).toContainEqual({ method: 'PUT', url: '/api/weekdays/0', body: { template_id: null } });
    expect(screen.getByText('Bausteine')).toBeInTheDocument();
  });

  it('inserts a module at a chosen time', async () => {
    const user = userEvent.setup();
    renderApp('/day?date=2026-11-12');
    await user.click(await screen.findByRole('button', { name: '+ Baustein' }));
    const start = screen.getByLabelText('Beginnt um');
    await user.clear(start);
    await user.type(start, '07:00');
    expect(screen.getByText('07:15–08:30')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Einfügen' }));
    expect(requests).toContainEqual({ method: 'POST', url: '/api/days/2026-11-12/modules', body: { template_id: 4, start_minute: 420 } });
  });
});

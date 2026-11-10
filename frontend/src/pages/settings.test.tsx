import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me } from '../api/day';
import i18n from '../i18n';
import { SettingsPage } from './SettingsPage';

let me: Me;
let requests: { method: string; url: string; body: unknown }[];

describe('SettingsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('de');
    me = {
      id: 1, username: 'alice', email: null, display_name: 'Alice', timezone: 'Europe/Berlin', delay_mode: 'fixed',
      notify_lead_minutes: null, notify_start: true, portal_url: null, logout_url: null, feedback_url: null, view: null,
    };
    requests = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? 'GET';
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        requests.push({ method, url, body });
        if (url === '/api/me' && method === 'PATCH') {
          me = { ...me, ...body, notify_lead_minutes: body.notify_lead_minutes === -1 ? null : (body.notify_lead_minutes ?? me.notify_lead_minutes) };
          return Response.json(me);
        }
        if (url === '/api/me') return Response.json(me);
        if (url === '/api/push/config') return Response.json({ enabled: false, public_key: null, devices: 0 });
        return Response.json({ detail: 'Not found' }, { status: 404 });
      }),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('says when the server has no push yet and saves when to notify', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Auf dem Server noch nicht eingerichtet.')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: '10 min' }));
    await waitFor(() => expect(requests).toContainEqual({ method: 'PATCH', url: '/api/me', body: { notify_lead_minutes: 10 } }));
    await user.click(screen.getByRole('switch', { name: 'Wenn ein Block beginnt' }));
    await waitFor(() => expect(requests).toContainEqual({ method: 'PATCH', url: '/api/me', body: { notify_start: false } }));
  });
});

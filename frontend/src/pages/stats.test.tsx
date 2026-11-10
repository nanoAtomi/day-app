import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Stats } from '../api/stats';
import i18n from '../i18n';
import { StatsPage } from './StatsPage';

const stats: Stats = {
  days: [
    { date: '2026-11-08', done: 0, skipped: 0, missed: 0, rate: null },
    { date: '2026-11-09', done: 3, skipped: 1, missed: 0, rate: 0.75 },
    { date: '2026-11-10', done: 4, skipped: 0, missed: 1, rate: 0.8 },
  ],
  weeks: [{ start: '2026-11-09', done: 7, skipped: 1, missed: 1, rate: 0.778 }],
  streak: 1,
  often_skipped: [{ title: 'Sport', skipped: 3, total: 4 }],
};

describe('StatsPage', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('de');
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(stats)));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows streak, this week, the days and what gets skipped', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <StatsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('1 Tag')).toBeInTheDocument();
    expect(screen.getByText(/^78\s%$/)).toBeInTheDocument();
    expect(screen.getByText('7 von 9 erledigt')).toBeInTheDocument();
    expect(screen.getByText('3× von 4')).toBeInTheDocument();
    // The latest day is shown; tapping another shows its numbers.
    expect(screen.getByRole('status')).toHaveTextContent(/4 erledigt, 0 übersprungen, 1 liegen geblieben – 80\s%/);
    await userEvent.setup().click(screen.getByRole('button', { name: /Montag, 9\. November: 75\s%/ }));
    expect(screen.getByRole('status')).toHaveTextContent(/3 erledigt, 1 übersprungen, 0 liegen geblieben – 75\s%/);
  });
});

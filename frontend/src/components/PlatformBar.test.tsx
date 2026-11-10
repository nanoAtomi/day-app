import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { PlatformBar, type PlatformUser } from './PlatformBar';

const alice: PlatformUser = {
  name: 'Alice Example',
  email: 'alice@example.com',
  portalUrl: 'https://portal.example',
  logoutUrl: 'https://portal.example/logout',
  feedbackUrl: 'https://portal.example/feedback?app=demo',
};

function renderBar(user: Partial<PlatformUser> = {}, path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <PlatformBar appName="Demo" appIcon="🧪" user={{ ...alice, ...user }} />
    </MemoryRouter>,
  );
}

describe('PlatformBar', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
    document.cookie = 'nicasso-theme=; Path=/; Max-Age=0';
    document.documentElement.classList.remove('dark');
  });

  it('links back to the portal and opens the account menu', async () => {
    renderBar();
    expect(screen.getByRole('link', { name: /portal/i })).toHaveAttribute('href', 'https://portal.example');
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Edit profile/ })).toHaveAttribute('href', 'https://portal.example/profile');
    expect(screen.getByRole('link', { name: /Feedback/ })).toHaveAttribute('href', 'https://portal.example/feedback?app=demo');
    expect(screen.getByRole('link', { name: /Sign out/ })).toHaveAttribute('href', 'https://portal.example/logout');
  });

  it('switches language and appearance platform-wide', async () => {
    renderBar();
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Language' }));
    await userEvent.click(screen.getByRole('option', { name: 'Deutsch' }));
    expect(i18n.resolvedLanguage).toBe('de');
    expect(document.cookie).toContain('nicasso-lang=de');

    await userEvent.click(screen.getByRole('button', { name: 'Dunkle Darstellung' }));
    expect(document.documentElement).toHaveClass('dark');
    expect(document.cookie).toContain('nicasso-theme=dark');
    await userEvent.click(screen.getByRole('button', { name: 'Helle Darstellung' }));
    expect(document.documentElement).not.toHaveClass('dark');
    expect(document.cookie).toContain('nicasso-theme=light');
  });

  it('takes the app name home, and back to the top on the start page', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    renderBar({}, '/');
    expect(screen.getByRole('link', { name: 'Demo' })).toHaveAttribute('href', '/');
    await userEvent.click(screen.getByRole('link', { name: 'Demo' }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    scrollTo.mockRestore();
  });

  it('hides platform links outside the gateway', async () => {
    renderBar({ portalUrl: null, logoutUrl: null, feedbackUrl: null });
    expect(screen.queryByRole('link', { name: /portal/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.queryByRole('link', { name: /Sign out/ })).not.toBeInTheDocument();
  });
});

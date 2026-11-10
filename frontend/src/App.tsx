import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Route, Routes } from 'react-router-dom';
import { ApiError } from './api/client';
import { useMe } from './api/day';
import { AppFooter } from './components/AppFooter';
import { PlatformBar } from './components/PlatformBar';
import { BottomNav, ViewLinks } from './components/Shell';
import { ConfirmProvider } from './components/ui';
import { MorePage } from './pages/MorePage';
import { PlannerPage } from './pages/PlannerPage';
import { TemplateEditorPage } from './pages/TemplateEditorPage';
import { TemplatesPage } from './pages/TemplatesPage';
import { WeekPage } from './pages/WeekPage';

export function AppIcon() {
  return (
    <span aria-hidden className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-indigo-600 text-base shadow-sm">
      🕘
    </span>
  );
}

export function App() {
  const { t, i18n } = useTranslation();
  const me = useMe();

  useEffect(() => {
    document.documentElement.lang = i18n.resolvedLanguage ?? 'en';
  }, [i18n.resolvedLanguage]);

  if (me.isPending) return <p className="p-6 text-slate-500">{t('loading')}</p>;
  if (me.isError) {
    const notSignedIn = me.error instanceof ApiError && me.error.status === 401;
    return (
      <div className="p-6">
        <p className="text-red-700 dark:text-red-400">{notSignedIn ? t('error.notSignedIn') : t('error.load', { message: me.error.message })}</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-3 min-h-11 rounded-full border border-line px-4 text-sm">
          {t('error.retry')}
        </button>
      </div>
    );
  }

  const timeZone = me.data.timezone || 'Europe/Berlin';
  return (
    <ConfirmProvider>
      <PlatformBar
        appName={t('app.name')}
        appIcon={<AppIcon />}
        user={{
          name: me.data.display_name,
          email: me.data.email,
          portalUrl: me.data.portal_url,
          logoutUrl: me.data.logout_url,
          feedbackUrl: me.data.feedback_url,
          view: me.data.view,
        }}
        navLabel={t('nav.main')}
        nav={<ViewLinks />}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-6 lg:py-8">
        <Routes>
          <Route path="/day" element={<PlannerPage view="day" timeZone={timeZone} />} />
          <Route path="/week" element={<WeekPage timeZone={timeZone} />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/templates/:templateId" element={<TemplateEditorPage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="*" element={<PlannerPage view="now" timeZone={timeZone} />} />
        </Routes>
        <AppFooter />
      </main>
      <BottomNav />
    </ConfirmProvider>
  );
}

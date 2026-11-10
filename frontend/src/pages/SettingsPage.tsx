import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMe, useUpdateMe, type DelayMode } from '../api/day';
import { disablePush, enablePush, pushConfig, pushState, sendTestPush, type PushState } from '../api/push';
import { CalendarSettings } from '../components/CalendarSettings';
import { Switch } from '../components/Switch';
import { PageHeader, primaryButton, secondaryButton, usePhone } from '../components/ui';

const MODES: DelayMode[] = ['fixed', 'cascade'];

/** Settings: delay mode, notifications and subscribed calendars. */
export function SettingsPage() {
  const { t } = useTranslation();
  const me = useMe();
  const update = useUpdateMe();
  const phone = usePhone();
  const mode = me.data?.delay_mode ?? 'fixed';

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={t('settings.title')} back={phone ? { to: '/more', label: t('nav.more') } : undefined} />
      <section className="rounded-3xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="font-semibold">{t('delay.title')}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('delay.lead')}</p>
        <div role="radiogroup" aria-label={t('delay.title')} className="mt-4 grid grid-cols-2 gap-1 rounded-2xl bg-ink/5 p-1 dark:bg-white/[0.06]">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => update.mutate({ delay_mode: m })}
              className={`min-h-11 rounded-xl text-sm font-medium transition ${mode === m ? 'bg-surface text-ink shadow-sm' : 'text-slate-500 hover:text-ink dark:text-slate-400'}`}
            >
              {t(`delay.name.${m}`)}
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{t(`delay.hint.${mode}`)}</p>
      </section>
      <Notifications />
      <CalendarSettings />
    </div>
  );
}

const LEADS = [0, 5, 10, 15, 30];

/** Push on this device, at the start of a block and a few minutes before. */
function Notifications() {
  const { t, i18n } = useTranslation();
  const me = useMe();
  const update = useUpdateMe();
  const [state, setState] = useState<PushState | null>(null);
  const [devices, setDevices] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = () => {
    pushState().then(setState, () => setState('unsupported'));
    pushConfig().then((c) => setDevices(c.devices), () => undefined);
  };
  useEffect(refresh, []);

  const run = async (action: () => Promise<PushState>) => {
    setBusy(true);
    setMessage(null);
    try {
      setState(await action());
      pushConfig().then((c) => setDevices(c.devices), () => undefined);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setMessage(null);
    try {
      const { sent } = await sendTestPush();
      setMessage(sent > 0 ? t('push.testSent') : t('push.testNone'));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const lead = me.data?.notify_lead_minutes ?? 0;
  return (
    <section aria-labelledby="push" className="mt-4 rounded-3xl border border-line bg-surface p-5 shadow-sm">
      <h2 id="push" className="font-semibold">{t('push.title')}</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{state ? t(`push.state.${state}`) : t('loading')}</p>
      {state === 'needs-install' && (
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
          <li>{t('push.ios1')}</li>
          <li>{t('push.ios2')}</li>
          <li>{t('push.ios3')}</li>
        </ol>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {(state === 'off' || state === 'denied') && (
          <button type="button" disabled={busy || state === 'denied'} onClick={() => void run(() => enablePush(i18n.resolvedLanguage ?? 'de'))} className={primaryButton}>
            🔔 {t('push.enable')}
          </button>
        )}
        {state === 'on' && (
          <>
            <button type="button" disabled={busy} onClick={() => void test()} className={secondaryButton}>
              {t('push.test')}
            </button>
            <button type="button" disabled={busy} onClick={() => void run(disablePush)} className={secondaryButton}>
              🔕 {t('push.disable')}
            </button>
          </>
        )}
      </div>
      {devices > 0 && <p className="mt-2 text-xs text-slate-400">{t('push.devices', { count: devices })}</p>}
      {message && <p role="status" className="mt-2 text-sm text-slate-600 dark:text-slate-300">{message}</p>}

      <div className="mt-5 divide-y divide-line border-t border-line">
        <div className="flex items-center justify-between gap-4 py-3">
          <span>
            <span className="block text-sm font-medium">{t('push.atStart')}</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">{t('push.atStartHint')}</span>
          </span>
          <Switch checked={me.data?.notify_start ?? true} disabled={!me.data} label={t('push.atStart')} onChange={(on) => update.mutate({ notify_start: on })} />
        </div>
        <div className="py-3">
          <span id="lead" className="block text-sm font-medium">{t('push.lead')}</span>
          <div role="radiogroup" aria-labelledby="lead" className="mt-2 grid grid-cols-5 gap-1 rounded-2xl bg-ink/5 p-1 dark:bg-white/[0.06]">
            {LEADS.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={lead === m}
                onClick={() => update.mutate({ notify_lead_minutes: m === 0 ? -1 : m })}
                className={`min-h-10 rounded-xl text-sm font-medium transition ${lead === m ? 'bg-surface text-ink shadow-sm' : 'text-slate-500 hover:text-ink dark:text-slate-400'}`}
              >
                {m === 0 ? t('push.leadOff') : `${m} min`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

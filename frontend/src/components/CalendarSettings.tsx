import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CALENDAR_COLORS, errorCode, useAddCalendar, useCalendars, useDeleteCalendar, useSyncCalendar, type CalendarSource } from '../api/calendars';
import { calendarLook } from '../lib/categories';
import { field, fieldLabel, primaryButton, useConfirm } from './ui';

/** Error code → text; "http:404" carries the status. */
function useErrorText() {
  const { t } = useTranslation();
  return (code: string) => (code.startsWith('http:') ? t('calendar.errors.http', { status: code.slice(5) }) : t(`calendar.errors.${code}`, { defaultValue: t('calendar.errors.unreadable') }));
}

/** Subscribed calendars (read-only ICS addresses): list, sync now, remove, add. */
export function CalendarSettings() {
  const { t } = useTranslation();
  const calendars = useCalendars();
  return (
    <section aria-labelledby="calendars" className="mt-4 rounded-3xl border border-line bg-surface p-5 shadow-sm">
      <h2 id="calendars" className="font-semibold">{t('calendar.title')}</h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('calendar.lead')}</p>
      {calendars.data && calendars.data.length > 0 && (
        <ul className="mt-4 divide-y divide-line border-y border-line">
          {calendars.data.map((c) => (
            <CalendarRow key={c.id} calendar={c} />
          ))}
        </ul>
      )}
      <AddCalendar />
    </section>
  );
}

function CalendarRow({ calendar }: { calendar: CalendarSource }) {
  const { t, i18n } = useTranslation();
  const confirm = useConfirm();
  const sync = useSyncCalendar();
  const remove = useDeleteCalendar();
  const errorText = useErrorText();
  const when = calendar.last_sync_at
    ? new Intl.DateTimeFormat(i18n.resolvedLanguage, { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(new Date(calendar.last_sync_at))
    : null;

  const del = async () => {
    const ok = await confirm({ title: t('calendar.deleteTitle'), message: t('calendar.deleteText', { name: calendar.name }), confirmLabel: t('common.delete'), danger: true });
    if (ok) remove.mutate(calendar.id);
  };

  return (
    <li className="flex items-center gap-3 py-3">
      <span aria-hidden className={`size-3 shrink-0 rounded-full ${calendarLook(calendar.color).dot}`} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{calendar.name}</span>
        <span className={`block text-xs ${calendar.last_error ? 'text-red-700 dark:text-red-400' : 'truncate text-slate-500 dark:text-slate-400'}`}>
          {calendar.last_error ? errorText(calendar.last_error) : t('calendar.status', { count: calendar.events, host: calendar.host, when: when ?? '–' })}
        </span>
      </span>
      <button
        type="button"
        aria-label={t('calendar.sync', { name: calendar.name })}
        disabled={sync.isPending}
        onClick={() => sync.mutate(calendar.id)}
        className={`grid size-10 shrink-0 place-items-center rounded-full text-lg text-slate-500 hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10 ${sync.isPending ? 'animate-spin' : ''}`}
      >
        ↻
      </button>
      <button type="button" aria-label={t('calendar.delete', { name: calendar.name })} onClick={() => void del()} className="grid size-10 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-ink/5 hover:text-red-700 dark:hover:bg-white/10">
        ✕
      </button>
    </li>
  );
}

function AddCalendar() {
  const { t } = useTranslation();
  const add = useAddCalendar();
  const errorText = useErrorText();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [color, setColor] = useState<string>('blue');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    add.mutate(
      { name: name.trim(), url: url.trim(), color },
      {
        onSuccess: () => {
          setName('');
          setUrl('');
        },
        onError: (e) => setError(errorText(errorCode(e))),
      },
    );
  };

  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      <h3 className="text-sm font-semibold">{t('calendar.add')}</h3>
      <label className={fieldLabel}>
        {t('calendar.name')}
        <input className={`${field} mt-1.5`} required maxLength={120} value={name} placeholder={t('calendar.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className={fieldLabel}>
        {t('calendar.url')}
        <input className={`${field} mt-1.5`} required type="url" inputMode="url" autoCapitalize="off" autoCorrect="off" spellCheck={false} value={url} placeholder="webcal://…" onChange={(e) => setUrl(e.target.value)} />
        <span className="mt-1 block text-xs font-normal tracking-normal text-slate-500 dark:text-slate-400">{t('calendar.urlHint')}</span>
      </label>
      <details className="rounded-2xl bg-ink/[0.03] px-4 py-3 text-sm dark:bg-white/[0.04]">
        <summary className="cursor-pointer font-medium">{t('calendar.where')}</summary>
        <dl className="mt-2 space-y-2 text-slate-600 dark:text-slate-300">
          {(['outlook', 'icloud', 'google'] as const).map((p) => (
            <div key={p}>
              <dt className="font-semibold">{t(`calendar.providers.${p}.name`)}</dt>
              <dd>{t(`calendar.providers.${p}.steps`)}</dd>
            </div>
          ))}
        </dl>
      </details>
      <fieldset>
        <legend className={fieldLabel}>{t('calendar.color')}</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {CALENDAR_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={color === c}
              aria-label={t(`template.colors.${c}`)}
              onClick={() => setColor(c)}
              className={`size-9 rounded-full ${calendarLook(c).dot} transition active:scale-95 ${color === c ? 'ring-4 ring-brand/40 ring-offset-2 ring-offset-surface' : ''}`}
            />
          ))}
        </div>
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      <button type="submit" className={primaryButton} disabled={add.isPending || !name.trim() || !url.trim()}>
        {add.isPending ? t('calendar.adding') : t('calendar.addButton')}
      </button>
    </form>
  );
}

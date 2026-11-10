import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useInsertModule, useMe, useSetDayDelayMode, useSetDayTemplate, useTemplates, type Day, type Template } from '../api/day';
import { TemplateIcon } from '../lib/templates';
import { formatMinute, parseTime } from '../lib/time';
import { Dialog, field, fieldLabel, primaryButton, secondaryButton, useConfirm } from './ui';

/** Under the day's header: which template the day comes from, and "insert a module". */
export function DayTools({ day, editable }: { day: Day; editable: boolean }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const templates = useTemplates();
  const setTemplate = useSetDayTemplate(day.date);
  const setDelay = useSetDayDelayMode(day.date);
  const defaultMode = useMe().data?.delay_mode ?? 'fixed';
  const [inserting, setInserting] = useState(false);
  const all = templates.data ?? [];
  const dayTemplates = all.filter((x) => x.kind === 'day');
  const modules = all.filter((x) => x.kind === 'module' && x.blocks.length > 0);

  const change = async (value: string) => {
    if (day.blocks.some((b) => b.source === 'template')) {
      const ok = await confirm({ title: t('week.switchTitle'), message: t('week.switchText'), confirmLabel: t('week.switch') });
      if (!ok) return;
    }
    setTemplate.mutate(value ? Number(value) : null);
  };

  const cascade = day.delay_mode === 'cascade';
  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center gap-2">
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t('day.template')}</span>
          <select className={`${field} min-h-10 py-1.5 text-sm`} value={day.template_id ?? ''} disabled={!editable} onChange={(e) => void change(e.target.value)}>
            <option value="">{t('week.noTemplate')}</option>
            {dayTemplates.map((x) => (
              <option key={x.id} value={x.id}>
                {x.icon} {x.name}
              </option>
            ))}
          </select>
        </label>
        {modules.length > 0 && (
          <button type="button" className={`${secondaryButton} min-h-10 shrink-0 px-3`} onClick={() => setInserting(true)}>
            + {t('module.insert')}
          </button>
        )}
      </div>
      {/* Running late: a labelled switch - an icon alone didn't say what it does. */}
      <div className="flex min-h-11 items-center gap-3 rounded-2xl bg-ink/[0.03] px-3 dark:bg-white/[0.04]">
        <span className="min-w-0 flex-1">
          <span id={`delay-${day.date}`} className="block text-sm font-medium">{t('delay.switch')}</span>
          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{t(`delay.short.${day.delay_mode}`)}</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={cascade}
          aria-labelledby={`delay-${day.date}`}
          disabled={!editable}
          // Matching the default again: follow it (a later change of the default applies).
          onClick={() => setDelay.mutate((cascade ? 'fixed' : 'cascade') === defaultMode ? null : cascade ? 'fixed' : 'cascade')}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${cascade ? 'bg-brand' : 'bg-slate-300 dark:bg-white/20'}`}
        >
          <span className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform ${cascade ? 'translate-x-5' : ''}`} />
        </button>
      </div>
      {inserting && <ModuleSheet date={day.date} modules={modules} onClose={() => setInserting(false)} />}
    </div>
  );
}

/** Pick a module and when it starts; its blocks keep their distances to each other. */
function ModuleSheet({ date, modules, onClose }: { date: string; modules: Template[]; onClose: () => void }) {
  const { t } = useTranslation();
  const insert = useInsertModule(date);
  const [chosen, setChosen] = useState(modules[0]);
  const ownStart = (m: Template) => Math.min(...m.blocks.map((b) => b.start_minute));
  const [start, setStart] = useState(formatMinute(ownStart(modules[0])));
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const minute = parseTime(start);
    if (minute === null) return setError(t('block.badTimes'));
    insert.mutate({ templateId: chosen.id, start: minute }, { onSuccess: onClose, onError: (e) => setError(e.message) });
  };

  return (
    <Dialog title={t('module.title')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {modules.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={m.id === chosen.id}
              onClick={() => {
                setChosen(m);
                setStart(formatMinute(ownStart(m)));
              }}
              className={`flex min-h-20 min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border p-2 text-sm transition active:scale-95 ${
                m.id === chosen.id ? 'border-brand bg-brand/10 font-semibold ring-2 ring-brand/30' : 'border-line hover:bg-ink/5 dark:hover:bg-white/5'
              }`}
            >
              <TemplateIcon template={m} size="size-9 text-lg" />
              <span className="max-w-full truncate">{m.name}</span>
            </button>
          ))}
        </div>
        <label className={fieldLabel}>
          {t('module.start')}
          <input type="time" step={300} required className={`${field} mt-1.5`} value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-300">
          {chosen.blocks.map((b) => {
            const shift = (parseTime(start) ?? ownStart(chosen)) - ownStart(chosen);
            return (
              <li key={b.id} className="flex gap-3">
                <span className="w-24 shrink-0 tabular-nums text-slate-500 dark:text-slate-400">
                  {formatMinute(b.start_minute + shift)}–{formatMinute(b.start_minute + shift + b.duration_minutes)}
                </span>
                <span className="truncate">{b.title}</span>
              </li>
            );
          })}
        </ul>
        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>
            {t('common.cancel')}
          </button>
          <button type="submit" className={primaryButton} disabled={insert.isPending}>
            {t('module.insertButton')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

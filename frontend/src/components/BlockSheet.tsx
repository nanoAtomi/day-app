import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateBlock, useDeleteBlock, useUpdateBlock, type Block, type BlockStatus } from '../api/day';
import { CATEGORIES, look } from '../lib/categories';
import { DAY_MINUTES, formatMinute, parseTime } from '../lib/time';
import { Dialog, field, fieldLabel, primaryButton, secondaryButton, useConfirm } from './ui';

export type SheetTarget = { block: Block } | { start: number; end: number };

const MIN_MINUTES = 5;
const STATUSES: BlockStatus[] = ['open', 'done', 'skipped'];

/** Add a block, or change one: title, category, start and end. Calendar blocks only show. */
export function BlockSheet({ date, target, onClose }: { date: string; target: SheetTarget; onClose: () => void }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const existing = 'block' in target ? target.block : null;
  const create = useCreateBlock(date);
  const update = useUpdateBlock(date);
  const remove = useDeleteBlock(date);

  const [title, setTitle] = useState(existing?.title ?? '');
  const [category, setCategory] = useState(existing?.category ?? 'other');
  const [start, setStart] = useState(formatMinute(existing ? existing.start_minute : 'start' in target ? target.start : 0));
  const [end, setEnd] = useState(formatMinute(existing ? existing.end_minute : 'end' in target ? target.end : 60));
  const [error, setError] = useState<string | null>(null);

  if (existing?.source === 'calendar') {
    return (
      <Dialog title={existing.title} onClose={onClose}>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {formatMinute(existing.start_minute)} – {formatMinute(existing.end_minute)}
        </p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{t('block.fromCalendar')}</p>
      </Dialog>
    );
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const startMinute = parseTime(start);
    const endMinute = parseTime(end === '00:00' ? '24:00' : end);
    if (!title.trim()) return setError(t('block.needTitle'));
    if (startMinute === null || endMinute === null || startMinute >= DAY_MINUTES || endMinute - startMinute < MIN_MINUTES) {
      return setError(t('block.badTimes'));
    }
    const input = { title: title.trim(), category, start_minute: startMinute, end_minute: endMinute };
    if (existing) update.mutate({ id: existing.id, ...input });
    else create.mutate(input);
    onClose();
  };

  const setStatus = (status: BlockStatus) => {
    if (!existing) return;
    update.mutate({ id: existing.id, status });
    onClose();
  };

  const del = async () => {
    if (!existing) return;
    const ok = await confirm({ title: t('block.deleteTitle'), message: t('block.deleteText', { title: existing.title }), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    remove.mutate(existing.id);
    onClose();
  };

  return (
    <Dialog title={existing ? t('block.edit') : t('block.new')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <label className={fieldLabel}>
          {t('block.title')}
          <input
            className={`${field} mt-1.5`}
            value={title}
            maxLength={200}
            autoFocus={!existing}
            enterKeyHint="done"
            placeholder={t('block.titlePlaceholder')}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className={fieldLabel}>
            {t('block.start')}
            <input type="time" step={300} required className={`${field} mt-1.5`} value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className={fieldLabel}>
            {t('block.end')}
            <input type="time" step={300} required className={`${field} mt-1.5`} value={end} onChange={(e) => setEnd(e.target.value)} />
          </label>
        </div>

        <fieldset>
          <legend className={fieldLabel}>{t('block.category')}</legend>
          <div className="mt-1.5 grid grid-cols-4 gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={c === category}
                onClick={() => setCategory(c)}
                className={`flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-2xl border px-1 text-xs transition active:scale-95 ${
                  c === category ? 'border-brand bg-brand/10 font-semibold text-ink ring-2 ring-brand/30' : 'border-line text-slate-600 hover:bg-ink/5 dark:text-slate-300 dark:hover:bg-white/5'
                }`}
              >
                <span aria-hidden className="text-xl">{look(c).icon}</span>
                <span className="max-w-full truncate">{t(`category.${c}`)}</span>
              </button>
            ))}
          </div>
        </fieldset>

        {existing && (
          <div role="radiogroup" aria-label={t('block.status')}>
            <span className={fieldLabel}>{t('block.status')}</span>
            <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-2xl bg-ink/5 p-1 dark:bg-white/[0.06]">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={existing.status === s}
                  onClick={() => setStatus(s)}
                  className={`min-h-10 rounded-xl text-sm font-medium transition ${existing.status === s ? 'bg-surface text-ink shadow-sm' : 'text-slate-500 hover:text-ink dark:text-slate-400'}`}
                >
                  {t(`status.${s}`)}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}

        <div className="flex items-center justify-between gap-2 pt-1">
          {existing ? (
            <button type="button" onClick={() => void del()} className="min-h-11 rounded-full px-3 text-sm font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40">
              {t('common.delete')}
            </button>
          ) : (
            <button type="button" onClick={onClose} className={secondaryButton}>
              {t('common.cancel')}
            </button>
          )}
          <button type="submit" className={primaryButton}>
            {existing ? t('common.save') : t('common.add')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

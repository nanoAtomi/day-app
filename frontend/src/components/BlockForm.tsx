import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CATEGORIES, look } from '../lib/categories';
import { DAY_MINUTES, formatMinute, parseTime } from '../lib/time';
import { field, fieldLabel, primaryButton, secondaryButton } from './ui';

const MIN_MINUTES = 5;

export interface BlockValues {
  title: string;
  category: string;
  start_minute: number;
  end_minute: number;
  subtasks?: string[];
}

/**
 * The fields of a block - title, start and end, kind - shared by a day's blocks and a
 * template's. `children` sits above the buttons (status, subtasks); `onDelete` shows
 * "Delete" for an existing block, otherwise "Cancel".
 */
export function BlockForm({
  initial,
  isNew,
  withSubtasks = false,
  onSubmit,
  onDelete,
  onCancel,
  children,
}: {
  initial: BlockValues;
  isNew: boolean;
  withSubtasks?: boolean;
  onSubmit: (values: BlockValues) => void;
  onDelete?: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(initial.title);
  const [category, setCategory] = useState(initial.category);
  const [start, setStart] = useState(formatMinute(initial.start_minute));
  const [end, setEnd] = useState(formatMinute(initial.end_minute));
  const [subtasks, setSubtasks] = useState((initial.subtasks ?? []).join('\n'));
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const startMinute = parseTime(start);
    const endMinute = parseTime(end === '00:00' ? '24:00' : end);
    if (!title.trim()) return setError(t('block.needTitle'));
    if (startMinute === null || endMinute === null || startMinute >= DAY_MINUTES || endMinute - startMinute < MIN_MINUTES) {
      return setError(t('block.badTimes'));
    }
    onSubmit({
      title: title.trim(),
      category,
      start_minute: startMinute,
      end_minute: endMinute,
      ...(withSubtasks ? { subtasks: subtasks.split('\n').map((s) => s.trim()).filter(Boolean) } : {}),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className={fieldLabel}>
        {t('block.title')}
        <input
          className={`${field} mt-1.5`}
          value={title}
          maxLength={200}
          autoFocus={isNew}
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

      {withSubtasks && (
        <label className={fieldLabel}>
          {t('template.subtasks')}
          <textarea rows={3} className={`${field} mt-1.5 resize-y`} value={subtasks} placeholder={t('template.subtasksPlaceholder')} onChange={(e) => setSubtasks(e.target.value)} />
        </label>
      )}

      {children}

      {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}

      <div className="flex items-center justify-between gap-2 pt-1">
        {onDelete ? (
          <button type="button" onClick={onDelete} className="min-h-11 rounded-full px-3 text-sm font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40">
            {t('common.delete')}
          </button>
        ) : (
          <button type="button" onClick={onCancel} className={secondaryButton}>
            {t('common.cancel')}
          </button>
        )}
        <button type="submit" className={primaryButton}>
          {isNew ? t('common.add') : t('common.save')}
        </button>
      </div>
    </form>
  );
}

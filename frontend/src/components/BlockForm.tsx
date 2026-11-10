import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CATEGORIES, look } from '../lib/categories';
import { DAY_MINUTES, formatMinute, parseTime } from '../lib/time';
import { autoFocusText, BinIcon, deleteButton, field, fieldLabel, primaryButton, secondaryButton } from './ui';

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
          autoFocus={isNew && autoFocusText()}
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

      {/* Set once and rarely changed: one select, not a wall of boxes (UI rules). */}
      <label className={fieldLabel}>
        {t('block.category')}
        <select className={`${field} mt-1.5`} value={category} onChange={(e) => setCategory(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {look(c).icon} {t(`category.${c}`)}
            </option>
          ))}
        </select>
      </label>

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
          <button type="button" onClick={onDelete} className={deleteButton}>
            <BinIcon />
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

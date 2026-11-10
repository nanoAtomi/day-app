import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useAddSubtask, useDeleteSubtask, useUpdateSubtask, type Block } from '../api/day';
import { field } from './ui';

/**
 * A block's subtasks to tick off. `editable` adds a field for new ones and a remove
 * button per row (the block's sheet); without it they can only be ticked ("Now").
 */
export function SubtaskList({ date, block, editable = false }: { date: string; block: Block; editable?: boolean }) {
  const { t } = useTranslation();
  const add = useAddSubtask(date);
  const update = useUpdateSubtask(date);
  const remove = useDeleteSubtask(date);
  const [title, setTitle] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    add.mutate({ blockId: block.id, title: title.trim() });
    setTitle('');
  };

  if (!editable && block.subtasks.length === 0) return null;
  return (
    <div>
      <ul className="space-y-1" aria-label={t('subtasks.title')}>
        {block.subtasks.map((s) => (
          <li key={s.id} className="flex min-h-11 items-center gap-2">
            <button
              type="button"
              role="checkbox"
              aria-checked={s.done}
              aria-label={s.title}
              // Not saved yet (negative id): wait for the server's id.
              disabled={s.id < 0}
              onClick={() => update.mutate({ id: s.id, blockId: block.id, done: !s.done })}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl px-1 text-left"
            >
              <span
                aria-hidden
                className={`grid size-6 shrink-0 place-items-center rounded-full border-2 text-xs font-bold transition ${
                  s.done ? 'border-brand bg-brand text-white' : 'border-slate-300 dark:border-white/30'
                }`}
              >
                {s.done ? '✓' : ''}
              </span>
              <span className={`min-w-0 flex-1 truncate ${s.done ? 'text-slate-400 line-through dark:text-slate-500' : ''}`}>{s.title}</span>
            </button>
            {editable && (
              <button
                type="button"
                aria-label={t('subtasks.remove', { title: s.title })}
                disabled={s.id < 0}
                onClick={() => remove.mutate({ id: s.id, blockId: block.id })}
                className="grid size-9 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-ink/5 hover:text-ink dark:hover:bg-white/10"
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <form onSubmit={submit} className="mt-1 flex gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">{t('subtasks.new')}</span>
            <input className={`${field} min-h-10 py-2`} value={title} maxLength={200} enterKeyHint="done" placeholder={t('subtasks.placeholder')} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <button type="submit" aria-label={t('subtasks.add')} disabled={!title.trim()} className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-xl text-white disabled:opacity-40">
            +
          </button>
        </form>
      )}
    </div>
  );
}

/** "2/3" - how many subtasks are done. */
export function subtaskCount(block: Block): string | null {
  if (block.subtasks.length === 0) return null;
  return `${block.subtasks.filter((s) => s.done).length}/${block.subtasks.length}`;
}

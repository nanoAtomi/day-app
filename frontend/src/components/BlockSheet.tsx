import { useTranslation } from 'react-i18next';
import { useCreateBlock, useDay, useDeleteBlock, useUpdateBlock, type Block, type BlockStatus } from '../api/day';
import { formatMinute } from '../lib/time';
import { BlockForm } from './BlockForm';
import { SubtaskList } from './SubtaskList';
import { Dialog, fieldLabel, useConfirm } from './ui';

export type SheetTarget = { block: Block } | { start: number; end: number };

const STATUSES: BlockStatus[] = ['open', 'done', 'skipped'];

/** Add a block to a day, or change one: title, category, start and end. Calendar blocks only show. */
export function BlockSheet({ date, target, onClose }: { date: string; target: SheetTarget; onClose: () => void }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const opened = 'block' in target ? target.block : null;
  // Subtasks change while the sheet is open: always show the day's current copy of the block.
  const day = useDay(date);
  const existing = opened ? (day.data?.blocks.find((b) => b.id === opened.id) ?? opened) : null;
  const create = useCreateBlock(date);
  const update = useUpdateBlock(date);
  const remove = useDeleteBlock(date);

  if (existing?.source === 'calendar') {
    return (
      <Dialog title={existing.title} onClose={onClose}>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {formatMinute(existing.start_minute)} – {formatMinute(existing.end_minute)}
        </p>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">📅 {t('block.fromCalendar', { name: existing.calendar ?? '' })}</p>
      </Dialog>
    );
  }

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
      <BlockForm
        initial={existing ? { title: existing.title, category: existing.category, start_minute: existing.start_minute, end_minute: existing.end_minute } : { title: '', category: 'other', start_minute: 'start' in target ? target.start : 0, end_minute: 'end' in target ? target.end : 60 }}
        isNew={!existing}
        onCancel={onClose}
        onDelete={existing ? () => void del() : undefined}
        onSubmit={(values) => {
          if (existing) update.mutate({ id: existing.id, ...values });
          else create.mutate(values);
          onClose();
        }}
      >
        {existing && (
          <div>
            <span className={fieldLabel}>{t('subtasks.title')}</span>
            <div className="mt-1">
              <SubtaskList date={date} block={existing} editable />
            </div>
          </div>
        )}
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
      </BlockForm>
    </Dialog>
  );
}

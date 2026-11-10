import { useTranslation } from 'react-i18next';
import { useAddTemplateBlock, useDeleteTemplateBlock, useUpdateTemplateBlock, type Template } from '../api/day';
import type { SheetTarget } from './BlockSheet';
import { BlockForm, type BlockValues } from './BlockForm';
import { Dialog } from './ui';

/** Add or change a block of a template - the same form as a day's block, plus subtask titles. */
export function TemplateBlockSheet({ template, target, onClose }: { template: Template; target: SheetTarget; onClose: () => void }) {
  const { t } = useTranslation();
  const add = useAddTemplateBlock(template.id);
  const update = useUpdateTemplateBlock();
  const remove = useDeleteTemplateBlock();
  const existing = 'block' in target ? template.blocks.find((b) => b.id === target.block.id) : undefined;

  const initial: BlockValues = existing
    ? { ...existing, end_minute: existing.start_minute + existing.duration_minutes }
    : { title: '', category: 'other', start_minute: 'start' in target ? target.start : 0, end_minute: 'end' in target ? target.end : 60, subtasks: [] };

  const save = ({ start_minute, end_minute, ...rest }: BlockValues) => {
    const input = { ...rest, start_minute, duration_minutes: end_minute - start_minute, subtasks: rest.subtasks ?? [] };
    if (existing) update.mutate({ id: existing.id, ...input });
    else add.mutate(input);
    onClose();
  };

  return (
    <Dialog title={existing ? t('block.edit') : t('block.new')} onClose={onClose}>
      <BlockForm
        initial={initial}
        isNew={!existing}
        withSubtasks
        onCancel={onClose}
        // Templates are easy to rebuild, and a day already made from one keeps its copy: no confirmation.
        onDelete={existing ? () => (remove.mutate(existing.id), onClose()) : undefined}
        onSubmit={save}
      />
    </Dialog>
  );
}

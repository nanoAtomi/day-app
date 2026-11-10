import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateTemplate, useDeleteTemplate, useUpdateTemplate, type Template, type TemplateKind } from '../api/day';
import { gradient, TEMPLATE_COLORS } from '../lib/templates';
import { Dialog, field, fieldLabel, primaryButton, secondaryButton, useConfirm } from './ui';

/** Create a template, or rename one: name, icon, colour - and for a new one, day or module. */
export function TemplateSheet({ template, onClose, onCreated, onDeleted }: { template?: Template; onClose: () => void; onCreated?: (t: Template) => void; onDeleted?: () => void }) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const create = useCreateTemplate(onCreated);
  const update = useUpdateTemplate();
  const remove = useDeleteTemplate();
  const [name, setName] = useState(template?.name ?? '');
  const [icon, setIcon] = useState(template?.icon ?? '');
  const [color, setColor] = useState(template?.color ?? 'blue');
  const [kind, setKind] = useState<TemplateKind>(template?.kind ?? 'day');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    const input = { name: name.trim(), icon: [...icon.trim()].slice(0, 2).join(''), color };
    if (template) update.mutate({ id: template.id, ...input });
    else create.mutate({ ...input, kind });
    onClose();
  };

  const del = async () => {
    if (!template) return;
    const ok = await confirm({ title: t('template.deleteTitle'), message: t('template.deleteText', { name: template.name }), confirmLabel: t('common.delete'), danger: true });
    if (!ok) return;
    remove.mutate(template.id, { onSuccess: onDeleted });
    onClose();
  };

  return (
    <Dialog title={template ? t('template.edit') : t('template.new')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        {!template && (
          <div role="radiogroup" aria-label={t('template.kind')}>
            <span className={fieldLabel}>{t('template.kind')}</span>
            <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-2xl bg-ink/5 p-1 dark:bg-white/[0.06]">
              {(['day', 'module'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  className={`min-h-10 rounded-xl text-sm font-medium transition ${kind === k ? 'bg-surface text-ink shadow-sm' : 'text-slate-500 hover:text-ink dark:text-slate-400'}`}
                >
                  {t(`template.kinds.${k}`)}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{t(`template.kindHint.${kind}`)}</p>
          </div>
        )}
        <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3">
          <label className={fieldLabel}>
            {t('template.icon')}
            <input className={`${field} mt-1.5 text-center text-xl`} value={icon} maxLength={8} placeholder="🗓️" onChange={(e) => setIcon(e.target.value)} />
          </label>
          <label className={fieldLabel}>
            {t('template.name')}
            <input className={`${field} mt-1.5`} value={name} maxLength={120} required autoFocus={!template} placeholder={t('template.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
          </label>
        </div>
        <fieldset>
          <legend className={fieldLabel}>{t('template.color')}</legend>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {TEMPLATE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={color === c}
                aria-label={t(`template.colors.${c}`)}
                onClick={() => setColor(c)}
                className={`size-10 rounded-full bg-gradient-to-br ${gradient(c)} transition active:scale-95 ${color === c ? 'ring-4 ring-brand/40 ring-offset-2 ring-offset-surface' : ''}`}
              />
            ))}
          </div>
        </fieldset>
        <div className="flex items-center justify-between gap-2 pt-1">
          {template ? (
            <button type="button" onClick={() => void del()} className="min-h-11 rounded-full px-3 text-sm font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40">
              {t('common.delete')}
            </button>
          ) : (
            <button type="button" onClick={onClose} className={secondaryButton}>
              {t('common.cancel')}
            </button>
          )}
          <button type="submit" className={primaryButton}>
            {template ? t('common.save') : t('template.create')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { useTemplates } from '../api/day';
import type { SheetTarget } from '../components/BlockSheet';
import { TemplateBlockSheet } from '../components/TemplateBlockSheet';
import { TemplateSheet } from '../components/TemplateSheet';
import { Timeline } from '../components/Timeline';
import { PageHeader, primaryButton, secondaryButton } from '../components/ui';
import { TemplateIcon, templateBlocks, weekdayName } from '../lib/templates';

/** One template on the same timeline as a day: tap a block to change it, a free spot to add one. */
export function TemplateEditorPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { templateId } = useParams();
  const templates = useTemplates();
  const template = templates.data?.find((x) => x.id === Number(templateId));
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  const [editing, setEditing] = useState(false);
  const language = i18n.resolvedLanguage ?? 'en';
  const back = { to: '/templates', label: t('templates.title') };

  if (!template) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title={templates.isPending ? t('loading') : t('template.notFound')} back={back} />
      </div>
    );
  }

  const lead =
    template.kind === 'module'
      ? t('template.moduleLead')
      : template.weekdays.length
        ? t('template.usedOn', { days: template.weekdays.map((d) => weekdayName(d, language)).join(', ') })
        : t('template.unused');

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={`${template.name}`} lead={lead} back={back}>
        <button type="button" className={secondaryButton} onClick={() => setEditing(true)}>
          {t('template.edit')}
        </button>
        <button type="button" aria-label={t('block.new')} className={`${primaryButton} size-11 px-0 text-xl`} onClick={() => setSheet({ start: 8 * 60, end: 9 * 60 })}>
          +
        </button>
      </PageHeader>
      <div className="mb-4 flex items-center gap-3">
        <TemplateIcon template={template} />
        <p className="text-sm text-slate-500 dark:text-slate-400">{template.blocks.length ? t('template.tapHint') : t('day.emptyHint')}</p>
      </div>
      <Timeline blocks={templateBlocks(template)} nowMinute={null} currentId={null} onOpen={setSheet} />
      {sheet && <TemplateBlockSheet key={JSON.stringify(sheet)} template={template} target={sheet} onClose={() => setSheet(null)} />}
      {editing && <TemplateSheet template={template} onClose={() => setEditing(false)} onDeleted={() => navigate('/templates')} />}
    </div>
  );
}

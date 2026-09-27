import { lazy, Suspense } from 'react';
import {
  sectionLabels,
  sections,
  type Factor,
  type Research,
  type ResearchInput,
  type Section,
} from '../../shared/contracts';
import { Loading } from '../components';

const RichEditor = lazy(() =>
  import('../documents/index').then((module) => ({ default: module.RichEditor })),
);
type Props = {
  record: Research;
  section: Section;
  documentHasChanges: boolean;
  canEdit: boolean;
  aiCurrent: ResearchInput;
  factors: Factor[];
  onSectionChange: (section: Section) => void;
  onDirtyChange: (dirty: boolean) => void;
  onSaved: () => Promise<void>;
  onAiApply: (values: Partial<ResearchInput>) => void;
};

function documentStatus(document: Research['documents'][Section]) {
  if (!document?.pdf_file_id) {
    return document?.revision ? '已编辑' : '待完善';
  }
  if (document.pdf_revision === document.revision) {
    return 'PDF 已同步';
  }
  return document.pdf_revision ? 'PDF 待更新' : '已上传 PDF';
}

export function DocumentsPanel({
  record,
  section,
  documentHasChanges,
  canEdit,
  aiCurrent,
  factors,
  onSectionChange,
  onDirtyChange,
  onSaved,
  onAiApply,
}: Props) {
  return (
    <>
      <div className="document-tabs">
        {sections.map((sectionKey) => (
          <button
            key={sectionKey}
            className={section === sectionKey ? 'active' : ''}
            onClick={() => {
              if (documentHasChanges && !confirm('当前说明尚未保存，确定切换吗？')) {
                return;
              }
              onDirtyChange(false);
              onSectionChange(sectionKey);
            }}
          >
            {sectionLabels[sectionKey]}
            <span>{documentStatus(record.documents[sectionKey])}</span>
          </button>
        ))}
      </div>
      <Suspense fallback={<Loading />}>
        <RichEditor
          key={`${record.id}-${section}`}
          researchId={record.id}
          section={section}
          initial={record.documents[section]}
          onSaved={onSaved}
          onDirty={onDirtyChange}
          readOnly={!canEdit}
          aiCurrent={aiCurrent}
          factors={factors}
          onAiApply={onAiApply}
        />
      </Suspense>
    </>
  );
}

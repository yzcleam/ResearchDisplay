import { ArrowLeft, ArrowSquareOut, ClockCounterClockwise } from '@phosphor-icons/react';
import type { Factor, Research, User } from '../../shared/contracts';
import { AiFillDialog } from '../ai/index';
import { Alert, date } from '../components';
import { DatasetDescriptionDialog } from '../datasets/index';
import {
  BasicInformationForm,
  DocumentsPanel,
  History,
  MaterialsForm,
  useResearchDraft,
} from '../research/index';

export function ResearchDetail({
  initial,
  factors,
  user,
  onBack,
  onChanged,
}: {
  initial: Research | null;
  factors: Factor[];
  user: User;
  onBack: () => void;
  onChanged: () => void;
}) {
  const {
    record,
    form,
    economicNamesText,
    setEconomicNamesText,
    tab,
    section,
    setSection,
    error,
    isSavingOrUploading,
    notice,
    formHasChanges,
    setFormHasChanges,
    documentHasChanges,
    setDocumentHasChanges,
    events,
    descriptionOpen,
    setDescriptionOpen,
    aiOpen,
    setAiOpen,
    aiCurrent,
    applyAiSuggestions,
    canEditResearch,
    refreshResearch,
    setField,
    saveResearch,
    changeTab,
    uploadMaterials,
  } = useResearchDraft(initial, user, onChanged);
  return (
    <div className="detail-page">
      <button
        className="back-link"
        onClick={() => {
          if (
            (formHasChanges || documentHasChanges) &&
            !confirm('还有未保存的内容，确定返回吗？')
          ) {
            return;
          }
          onBack();
        }}
      >
        <ArrowLeft size={17} />
        返回研究资料
      </button>
      <div className="page-heading">
        <div>
          <span className="eyebrow">RESEARCH RECORD</span>
          <h1>{record ? record.title : '新建研究成果'}</h1>
          <p>
            {record
              ? `${record.owner_name} · ${record.factor_name} · 更新于 ${date(record.updated_at)}`
              : '先填写基本信息，再汇集数据、论文与分析说明。'}
          </p>
        </div>
        {record && <span className="badge">{record.research_type}</span>}
      </div>
      <Alert>{error}</Alert>
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      <div className="tabs" aria-label="研究资料分区">
        {(
          [
            ['basic', '基本信息'],
            ['files', '研究材料'],
            ['documents', '图文说明'],
            ['history', '上传记录'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            disabled={!record && key !== 'basic'}
            className={tab === key ? 'active' : ''}
            onClick={() => void changeTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'basic' && (
        <BasicInformationForm
          record={record}
          form={form}
          factors={factors}
          economicNamesText={economicNamesText}
          canEdit={canEditResearch}
          isSaving={isSavingOrUploading}
          onSave={saveResearch}
          onFieldChange={setField}
          onOpenAi={() => setAiOpen(true)}
          onEconomicNamesChange={(value) => {
            setEconomicNamesText(value);
            setFormHasChanges(true);
          }}
        />
      )}
      {tab === 'files' && record && (
        <MaterialsForm
          files={record.files}
          canEdit={canEditResearch}
          isUploading={isSavingOrUploading}
          onUpload={uploadMaterials}
          onOpenDescriptions={() => setDescriptionOpen(true)}
        />
      )}
      {tab === 'documents' && record && (
        <DocumentsPanel
          record={record}
          section={section}
          documentHasChanges={documentHasChanges}
          canEdit={canEditResearch}
          aiCurrent={aiCurrent}
          factors={factors}
          onSectionChange={setSection}
          onDirtyChange={setDocumentHasChanges}
          onSaved={refreshResearch}
          onAiApply={applyAiSuggestions}
        />
      )}
      {tab === 'history' && (
        <div className="paper-panel">
          <div className="section-heading">
            <ClockCounterClockwise size={26} />
            <div>
              <h2>成果变更记录</h2>
              <p>最近 200 次操作，包含上传时的姓名、题目和文件快照。</p>
            </div>
          </div>
          <History events={events} />
        </div>
      )}
      {record && (
        <div className="detail-footnote">
          <ArrowSquareOut size={14} /> 所有文件仅向已登录的课题组成员开放。
        </div>
      )}
      {aiOpen && (
        <AiFillDialog
          researchId={record?.id}
          current={aiCurrent}
          factors={factors}
          onClose={() => setAiOpen(false)}
          onApply={applyAiSuggestions}
        />
      )}
      {descriptionOpen && record && (
        <DatasetDescriptionDialog
          files={record.files.filter((file) => file.role === 'dataset')}
          readOnly={!canEditResearch}
          onClose={() => setDescriptionOpen(false)}
          onSaved={refreshResearch}
        />
      )}
    </div>
  );
}

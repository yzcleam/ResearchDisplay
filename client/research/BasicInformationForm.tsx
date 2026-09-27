import { FloppyDisk, Sparkle } from '@phosphor-icons/react';
import type { FormEvent } from 'react';
import {
  researchTypes,
  sectionLabels,
  sections,
  type Factor,
  type Research,
  type ResearchInput,
} from '../../shared/contracts';
import { Field } from '../components';
import type { ResearchFieldChange } from './form';

type Props = {
  record: Research | null;
  form: ResearchInput;
  factors: Factor[];
  economicNamesText: string;
  canEdit: boolean;
  isSaving: boolean;
  onSave: (event: FormEvent) => Promise<void>;
  onFieldChange: ResearchFieldChange;
  onEconomicNamesChange: (value: string) => void;
  onOpenAi: () => void;
};

export function BasicInformationForm({
  record,
  form,
  factors,
  economicNamesText,
  canEdit,
  isSaving,
  onSave,
  onFieldChange,
  onEconomicNamesChange,
  onOpenAi,
}: Props) {
  return (
    <form onSubmit={onSave} className="paper-panel">
      <div className="section-heading">
        <span className="section-number">01</span>
        <div>
          <h2>研究基本信息</h2>
          <p>为成果建立清晰的分类与索引。</p>
        </div>
        {canEdit && (
          <button
            type="button"
            className="secondary ai-entry"
            disabled={isSaving}
            onClick={() => onOpenAi()}
          >
            <Sparkle size={18} />
            智能填充与摘要
          </button>
        )}
      </div>
      <fieldset disabled={!canEdit || isSaving}>
        <Field label="研究题目 *">
          <input
            value={form.title}
            onChange={(e) => onFieldChange('title', e.target.value)}
            required
            minLength={2}
            maxLength={250}
            placeholder="填写完整的研究题目"
          />
        </Field>
        <div className="form-grid">
          <Field label="研究类型 *">
            <select
              value={form.research_type}
              onChange={(e) =>
                onFieldChange('research_type', e.target.value as ResearchInput['research_type'])
              }
            >
              {researchTypes.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field
            label="要素类型 *"
            hint={
              !factors.some((f) => f.active)
                ? '管理员需要先在“要素与文件”中添加可选类型。'
                : undefined
            }
          >
            <select
              value={form.factor_type_id}
              onChange={(e) => onFieldChange('factor_type_id', e.target.value)}
              required
            >
              <option value="">请选择要素类型</option>
              {factors
                .filter((f) => f.active || f.id === form.factor_type_id)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                    {f.active ? '' : '（已停用）'}
                  </option>
                ))}
            </select>
          </Field>
        </div>
        <Field label="相关经济数据名称" hint="每行一个名称，例如：地区生产总值、就业人数。">
          <textarea
            rows={3}
            value={economicNamesText}
            onChange={(e) => {
              onEconomicNamesChange(e.target.value);
            }}
          />
        </Field>
        <div className="section-heading divided">
          <span className="section-number">02</span>
          <div>
            <h2>研究发现摘要</h2>
            <p>供后续成果展示使用；详细论证可在“图文说明”中编辑。</p>
          </div>
        </div>
        <div className="form-grid">
          {sections.map((s) => (
            <Field key={s} label={`${sectionLabels[s]}摘要`}>
              <textarea
                rows={5}
                maxLength={5000}
                value={form[`${s}_summary`]}
                onChange={(e) => onFieldChange(`${s}_summary`, e.target.value)}
                placeholder={`概述本研究的${sectionLabels[s]}…`}
              />
            </Field>
          ))}
        </div>
      </fieldset>
      <div className="panel-footer">
        <span className="small muted">
          {record ? '研究编号 ' + record.id : '带 * 的项目为必填项。'}
        </span>
        {canEdit && (
          <button className="primary" disabled={isSaving}>
            <FloppyDisk size={18} />
            {isSaving ? '正在保存…' : '保存研究资料'}
          </button>
        )}
      </div>
    </form>
  );
}

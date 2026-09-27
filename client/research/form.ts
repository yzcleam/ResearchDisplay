import type { ResearchInput } from '../../shared/contracts';

export type ResearchFieldChange = <Field extends keyof ResearchInput>(
  field: Field,
  value: ResearchInput[Field],
) => void;

/** 只发送可编辑字段，避免把 API 返回的文件、作者和审计信息一起提交。 */
export function toResearchInput(form: ResearchInput, economicNamesText: string): ResearchInput {
  return {
    title: form.title,
    research_type: form.research_type,
    factor_type_id: form.factor_type_id,
    economic_data_names: economicNamesText
      .split('\n')
      .map((name) => name.trim())
      .filter(Boolean),
    mechanism_summary: form.mechanism_summary,
    impact_summary: form.impact_summary,
    risk_summary: form.risk_summary,
    policy_summary: form.policy_summary,
  };
}

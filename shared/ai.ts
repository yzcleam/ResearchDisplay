import { z } from 'zod';
import { researchSchema, researchTypes, sections, type ResearchInput } from './contracts.js';

export const AI_SUMMARY_MAX_LENGTH = 200;

export const aiFieldLabels: Record<keyof ResearchInput, string> = {
  title: '研究题目',
  research_type: '研究类型',
  factor_type_id: '要素类型',
  economic_data_names: '相关经济数据名称',
  mechanism_summary: '产生机制摘要',
  impact_summary: '经济影响摘要',
  risk_summary: '可能风险摘要',
  policy_summary: '政策启示摘要',
};
export const aiSettingsSchema = z
  .object({
    enabled: z.boolean(),
    base_url: z
      .url()
      .max(1000)
      .refine((value) => {
        try {
          const url = new URL(value);
          return (
            ['https:', 'http:'].includes(url.protocol) &&
            !url.username &&
            !url.password &&
            !url.search &&
            !url.hash
          );
        } catch {
          return false;
        }
      }, '请输入 HTTP(S) 接口基础地址，不含凭据、查询参数或片段'),
    model: z.string().trim().min(1, '请填写模型名称').max(200),
    api_key: z.string().trim().max(4096).optional(),
    clear_api_key: z.boolean().optional(),
    json_mode: z.boolean(),
    timeout_seconds: z.number().int().min(10).max(180),
    revision: z.number().int().nonnegative(),
  })
  .strict();
export type AiSettingsInput = z.infer<typeof aiSettingsSchema>;
export type AiSettings = Omit<AiSettingsInput, 'api_key' | 'clear_api_key'> & {
  has_api_key: boolean;
};
export type AiStatus = {
  ready: boolean;
  enabled: boolean;
  model: string;
  provider_host: string;
  message: string;
};
const currentSchema = z
  .object({
    title: z.string().max(250),
    research_type: z.enum(researchTypes),
    factor_type_id: z.string().max(36),
    economic_data_names: z.array(z.string().max(200)).max(30),
    mechanism_summary: z.string().max(5000),
    impact_summary: z.string().max(5000),
    risk_summary: z.string().max(5000),
    policy_summary: z.string().max(5000),
  })
  .strict();
export const aiGenerateSchema = z
  .object({
    research_id: z.uuid().optional(),
    mode: z.enum(['research', 'section']),
    section: z.enum(sections).optional(),
    current: currentSchema,
    source_text: z.string().max(60000).default(''),
    html: z.string().max(1000000).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mode === 'section' && (!value.section || value.html === undefined)) {
      ctx.addIssue({ code: 'custom', message: '请选择需要摘要的图文说明', path: ['section'] });
    }
  });
export type AiGenerateInput = z.infer<typeof aiGenerateSchema>;
// Match the browser's textarea maxlength even when text contains surrogate pairs.
const generatedSummary = (field: z.ZodString) =>
  field
    .trim()
    .max(AI_SUMMARY_MAX_LENGTH)
    .refine((value) => value.length <= AI_SUMMARY_MAX_LENGTH)
    .nullable()
    .optional();
export const aiOutputSchema = z
  .object({
    title: z.string().trim().min(2).max(250).nullable().optional(),
    research_type: z.enum(researchTypes).nullable().optional(),
    factor_type_id: z.uuid().nullable().optional(),
    economic_data_names: z.array(z.string().trim().min(1).max(200)).max(30).optional(),
    mechanism_summary: generatedSummary(researchSchema.shape.mechanism_summary),
    impact_summary: generatedSummary(researchSchema.shape.impact_summary),
    risk_summary: generatedSummary(researchSchema.shape.risk_summary),
    policy_summary: generatedSummary(researchSchema.shape.policy_summary),
    notes: z.array(z.string().max(500)).max(10).default([]),
  })
  .strict();
export type AiResult = {
  suggestions: Partial<ResearchInput>;
  notes: string[];
  model: string;
  input_chars: number;
};

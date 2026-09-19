import { z } from 'zod';

export const panelRoles = ['general', 'time', 'individual'] as const;
export type PanelRole = typeof panelRoles[number];
export const panelRoleLabels: Record<PanelRole, string> = { general: '一般数据', time: '时间标识', individual: '个体标识' };
export type DatasetField = {
  key: string; sheet: string; column: number; data_id: string; data_type: '文本型' | '数值型'; suggested_panel_role: PanelRole;
};
export type DatasetProfile = {
  fields: DatasetField[];
  sheets: { name: string; row_count: number; column_count: number }[];
  row_count: number;
  warnings: string[];
};
const limitedText = (label: string, max: number) => z.string().trim().min(1, `请填写${label}`)
  .refine(value => Array.from(value).length <= max, `${label}不得超过 ${max} 个字符`);
export const descriptionFieldSchema = z.object({
  key: z.string().min(1).max(100),
  panel_role: z.enum(panelRoles),
  chinese_name: limitedText('数据中文名称', 10),
  explanation: limitedText('数据解释', 100),
  source: limitedText('数据来源', 20),
}).strict();
export type DatasetDescriptionField = z.infer<typeof descriptionFieldSchema>;
export const datasetDescriptionSchema = z.object({
  revision: z.number().int().nonnegative(), fields: z.array(descriptionFieldSchema).min(1).max(500),
}).strict().superRefine(({ fields }, ctx) => {
  if (new Set(fields.map(f => f.key)).size !== fields.length) ctx.addIssue({ code: 'custom', message: '数据字段不能重复', path: ['fields'] });
  for (const role of ['time', 'individual'] as const) {
    if (fields.filter(f => f.panel_role === role).length > 1) ctx.addIssue({ code: 'custom', message: `每个数据集最多只能有一个${panelRoleLabels[role]}，请将其余字段改为一般数据`, path: ['fields'] });
  }
});
export type DatasetDescriptionInput = z.infer<typeof datasetDescriptionSchema>;
export type DatasetDescription = DatasetProfile & {
  dataset_file_id: string; original_name: string; is_current: boolean; revision: number;
  saved_at: string | null; descriptions: DatasetDescriptionField[];
};

export function suggestPanelRole(id: string): PanelRole {
  const value = id.toLowerCase();
  if (['time', 'year', 'date', 'month', 'quarter', '时间', '年份', '年度', '日期', '月份', '季度'].some(word => value.includes(word))) return 'time';
  if (['id', 'city', 'province', 'county', 'district', 'region', '城市', '省份', '地区', '区县', '代码'].some(word => value.includes(word))) return 'individual';
  return 'general';
}

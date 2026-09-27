import { z } from 'zod';
export const sections = ['mechanism', 'impact', 'risk', 'policy'] as const;
export type Section = (typeof sections)[number];
export const sectionLabels: Record<Section, string> = {
  mechanism: '产生机制',
  impact: '经济影响',
  risk: '可能风险',
  policy: '政策启示',
};
export const researchTypes = ['要素集聚', '要素流动', '其他'] as const;
export const fileRoles = [
  'image_pack',
  'dataset',
  'indicators',
  'manuscript',
  'editor_image',
  'mechanism_pdf',
  'impact_pdf',
  'risk_pdf',
  'policy_pdf',
  'other',
] as const;
export const roleLabels: Record<(typeof fileRoles)[number], string> = {
  image_pack: '研究图片包',
  dataset: '数据集',
  indicators: '数据指标说明表',
  manuscript: '论文原稿',
  editor_image: '文档插图',
  mechanism_pdf: '产生机制说明',
  impact_pdf: '经济影响说明',
  risk_pdf: '可能风险说明',
  policy_pdf: '政策启示详情',
  other: '其他文件',
};
export const shareScopes = ['global', 'specific', 'private'] as const;
export type ShareScope = (typeof shareScopes)[number];
export const sharingSchema = z
  .object({
    scope: z.enum(shareScopes),
    user_ids: z.array(z.uuid()).max(500).default([]),
  })
  .strict()
  .refine(
    (value) =>
      value.scope === 'specific' ? value.user_ids.length > 0 : value.user_ids.length === 0,
    '指定用户共享需选择用户；其他共享方式不应包含用户',
  );
export type SharingInput = z.infer<typeof sharingSchema>;
export const spaceFolders = ['manuscript', 'dataset', 'documents', 'other'] as const;
export type SpaceFolder = (typeof spaceFolders)[number];
export type SpaceProject = {
  id: string;
  title: string;
  owner_id: string;
  owner_name: string;
  file_count: number;
};
export type SpaceFile = FileRecord & {
  uploaded_by: string;
  uploader_name: string;
  share_scope: ShareScope;
  shared_with: string[];
  folder: SpaceFolder;
  can_download: boolean;
  can_delete: boolean;
  can_share: boolean;
};
export const registerSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(10, '密码至少 10 位').max(128),
    real_name: z.string().trim().min(2, '请填写真实姓名').max(80),
    institution: z.string().trim().min(2, '请填写所属单位').max(160),
    invite_code: z.string().max(200).optional(),
  })
  .strict();
export const researchSchema = z.object({
  title: z.string().trim().min(2, '研究题目至少 2 个字').max(250),
  research_type: z.enum(researchTypes),
  factor_type_id: z.uuid(),
  economic_data_names: z.array(z.string().trim().min(1).max(200)).max(30),
  mechanism_summary: z.string().max(5000),
  impact_summary: z.string().max(5000),
  risk_summary: z.string().max(5000),
  policy_summary: z.string().max(5000),
});
export type ResearchInput = z.infer<typeof researchSchema>;
export type User = {
  id: string;
  real_name: string;
  email: string;
  institution: string;
  role: 'admin' | 'teacher' | 'member';
  active: boolean;
  created_at: string;
};
export type Factor = {
  id: string;
  name: string;
  active: boolean;
  research_count: number;
  file_count: number;
};
export type DocumentData = {
  html: string;
  revision: number;
  pdf_revision?: number;
  pdf_file_id?: string;
};
export type FileRecord = {
  id: string;
  research_id: string;
  factor_type_id: string;
  role: (typeof fileRoles)[number];
  original_name: string;
  mime_type: string;
  size_bytes: number;
  is_current: boolean;
  created_at: string;
  dataset_summary?: { field_count: number; row_count: number; described: boolean } | null;
};
export type Research = ResearchInput & {
  id: string;
  owner_id: string;
  owner_name: string;
  factor_name: string;
  created_at: string;
  updated_at: string;
  version: number;
  latest_upload_id: string | null;
  documents: Partial<Record<Section, DocumentData>>;
  files: FileRecord[];
  file_count?: number;
};
export type UploadEvent = {
  id: string;
  user_id: string;
  uploader_name: string;
  research_id: string;
  research_title: string;
  action: string;
  created_at: string;
  files: { id: string; name: string; role: string }[];
};
export type PdfJob = {
  id: string;
  section: Section;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'superseded';
  error_message?: string;
  file_id?: string;
};

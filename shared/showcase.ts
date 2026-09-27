import { z } from 'zod';
import { researchTypes, type ResearchInput, type Section } from './contracts.js';

export const SHOWCASE_PAGE_SIZE = 3;
export const showcaseLabels: Record<Section, string> = {
  mechanism: '产生机制',
  impact: '经济影响',
  risk: '潜在风险',
  policy: '政策建议',
};
export const showcaseQuery = z
  .object({
    q: z.string().trim().max(200).default(''),
    type: z.enum(researchTypes).optional(),
    factor: z.uuid().optional(),
  })
  .strict();
export type ShowcaseQuery = z.infer<typeof showcaseQuery>;
export type ShowcaseStudy = Pick<
  ResearchInput,
  | 'title'
  | 'research_type'
  | 'mechanism_summary'
  | 'impact_summary'
  | 'risk_summary'
  | 'policy_summary'
> & { id: string; factor_type_id: string; updated_at: string };
export type ShowcaseGroup = {
  id: string;
  name: string;
  active: boolean;
  total: number;
  items: ShowcaseStudy[];
};
export type ShowcaseOverview = { groups: ShowcaseGroup[]; total: number; page_size: number };
export type ShowcasePage = {
  items: ShowcaseStudy[];
  total: number;
  page: number;
  page_size: number;
};
export type ShowcaseFile = { id: string; original_name: string; size_bytes: number };
export type ShowcaseDetail = {
  id: string;
  title: string;
  factor_name: string;
  research_type: string;
  owner_name: string;
  updated_at: string;
  sections: Record<Section, { html: string; summary: string; pdf: ShowcaseFile | null }>;
  manuscript: ShowcaseFile | null;
};

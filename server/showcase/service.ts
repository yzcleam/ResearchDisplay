import { showcaseRepo } from './repository.js';
import { researchRepo } from '../research/repository.js';
import { pool } from '../db/index.js';
import { cleanDocument } from '../documents/sanitize.js';
import { AppError } from '../shared/errors.js';
import { sections } from '../../shared/contracts.js';
import { SHOWCASE_PAGE_SIZE, type ShowcaseDetail, type ShowcaseOverview, type ShowcasePage, type ShowcaseQuery } from '../../shared/showcase.js';

export async function showcaseOverview(query: ShowcaseQuery): Promise<ShowcaseOverview> {
  const groups = await showcaseRepo.overview(query);
  return { groups, total: groups.reduce((total, group) => total + group.total, 0), page_size: SHOWCASE_PAGE_SIZE };
}
export async function showcasePage(factorId: string, query: ShowcaseQuery, page: number): Promise<ShowcasePage> {
  const result = await showcaseRepo.page(factorId, query, page);
  if (!result.factor_exists) throw new AppError(404, '要素类型不存在');
  return { items: result.items, total: result.total, page, page_size: SHOWCASE_PAGE_SIZE };
}
export async function showcaseDetail(id: string): Promise<ShowcaseDetail> {
  const research = await researchRepo.get(pool, id), files = await researchRepo.files(pool, id);
  const file = (role: string) => {
    const found = files.find(item => item.is_current && item.role === role);
    return found ? { id: found.id, original_name: found.original_name, size_bytes: Number(found.size_bytes) } : null;
  };
  return { id: research.id, title: research.title, research_type: research.research_type, factor_name: research.factor_name, owner_name: research.owner_name, updated_at: research.updated_at,
    sections: Object.fromEntries(sections.map(section => [section, { html: cleanDocument(research.documents[section]?.html || ''), summary: research[`${section}_summary`], pdf: file(`${section}_pdf`) }])) as ShowcaseDetail['sections'],
    manuscript: file('manuscript') };
}

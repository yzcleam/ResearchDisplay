import { pool, transaction, type DB } from '../db/index.js';
import { AppError } from '../shared/errors.js';
import { researchRepo, canEdit } from './repository.js';
import type { ResearchInput, User } from '../../shared/contracts.js';
async function validateFactor(db: DB, id: string, existing?: string) {
  const row = (await db.query('SELECT active FROM factor_types WHERE id=$1 FOR SHARE', [id])).rows[0];
  if (!row || (!row.active && id !== existing)) throw new AppError(400, '请选择启用的要素类型');
}
export async function createResearch(user: User, data: ResearchInput) {
  return transaction(async db => {
    await validateFactor(db, data.factor_type_id);
    const row = (await db.query(`INSERT INTO research_records(owner_id,title,research_type,factor_type_id,economic_data_names,mechanism_summary,impact_summary,risk_summary,policy_summary) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`, [user.id, data.title, data.research_type, data.factor_type_id, JSON.stringify(data.economic_data_names), data.mechanism_summary, data.impact_summary, data.risk_summary, data.policy_summary])).rows[0];
    const research = await researchRepo.get(db, row.id); await researchRepo.event(db, user, research, 'create');
    return { ...await researchRepo.get(db, row.id), files: [] };
  });
}
export async function updateResearch(user: User, id: string, data: ResearchInput & { version: number }) {
  return transaction(async db => {
    const current = await researchRepo.get(db, id, true); canEdit(user, current);
    if (current.version !== data.version) throw new AppError(409, '资料已被其他操作修改，请重新打开后再保存');
    await validateFactor(db, data.factor_type_id, current.factor_type_id);
    await db.query(`UPDATE research_records SET title=$2,research_type=$3,factor_type_id=$4,economic_data_names=$5,mechanism_summary=$6,impact_summary=$7,risk_summary=$8,policy_summary=$9,version=version+1,updated_at=now() WHERE id=$1`, [id, data.title, data.research_type, data.factor_type_id, JSON.stringify(data.economic_data_names), data.mechanism_summary, data.impact_summary, data.risk_summary, data.policy_summary]);
    const updated = await researchRepo.get(db, id); await researchRepo.event(db, user, updated, 'edit', [], { previous_version: current.version });
    return { ...await researchRepo.get(db, id), files: await researchRepo.files(db, id) };
  });
}
export async function listResearch(filters: {q: string; type?: string; factor?: string; page: number; mine: boolean}, user: User) {
  const values: unknown[] = []; const where: string[] = [];
  const add = (clause: string, v: unknown) => { values.push(v); where.push(clause.replace('?', `$${values.length}`)); };
  if (filters.q) add('r.title ILIKE ?', `%${filters.q}%`);
  if (filters.type) add('r.research_type=?', filters.type);
  if (filters.factor) add('r.factor_type_id=?', filters.factor);
  if (filters.mine) add('r.owner_id=?', user.id);
  const sqlWhere = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = Number((await pool.query(`SELECT count(*) FROM research_records r ${sqlWhere}`, values)).rows[0].count);
  const items = (await pool.query(`SELECT r.*,u.real_name AS owner_name,f.name AS factor_name,(SELECT count(*)::int FROM file_mappings fm WHERE fm.research_id=r.id AND fm.is_current) AS file_count FROM research_records r JOIN users u ON u.id=r.owner_id JOIN factor_types f ON f.id=r.factor_type_id ${sqlWhere} ORDER BY r.updated_at DESC,r.id LIMIT 20 OFFSET $${values.length+1}`, [...values, (filters.page-1)*20])).rows;
  return { items, total, page: filters.page, page_size: 20 };
}

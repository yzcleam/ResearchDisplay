import type { DB } from '../db/index.js';
import type { Research, User, FileRecord } from '../../shared/contracts.js';
import { AppError } from '../shared/errors.js';
export const researchRepo = {
  async get(db: DB, id: string, lock = false): Promise<Research> {
    const result = await db.query(`SELECT r.*, u.real_name AS owner_name, f.name AS factor_name FROM research_records r JOIN users u ON u.id=r.owner_id JOIN factor_types f ON f.id=r.factor_type_id WHERE r.id=$1 ${lock ? 'FOR UPDATE OF r' : ''}`, [id]);
    if (!result.rows[0]) throw new AppError(404, '研究成果不存在');
    return result.rows[0];
  },
  async files(db: DB, id: string): Promise<FileRecord[]> {
    return (await db.query(`SELECT f.id,f.research_id,f.factor_type_id,f.role,f.original_name,f.mime_type,f.size_bytes,f.is_current,f.created_at,
      CASE WHEN d.dataset_file_id IS NOT NULL THEN jsonb_build_object('field_count',jsonb_array_length(d.profile->'fields'),'row_count',d.profile->'row_count','described',d.saved_at IS NOT NULL) END AS dataset_summary
      FROM file_mappings f LEFT JOIN dataset_descriptions d ON d.dataset_file_id=f.id WHERE f.research_id=$1 ORDER BY f.created_at DESC`, [id])).rows;
  },
  async event(db: DB, user: User, research: Research, action: string, files: unknown[] = [], details = {}) {
    const row = (await db.query('INSERT INTO upload_events(user_id,uploader_name,research_id,research_title,action,files,details) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id', [user.id, user.real_name, research.id, research.title, action, JSON.stringify(files), JSON.stringify(details)])).rows[0];
    await db.query('UPDATE research_records SET latest_upload_id=$2,updated_at=now() WHERE id=$1', [research.id, row.id]); return row.id as string;
  },
};
export function canEdit(user: User, research: Pick<Research,'owner_id'>) {
  if (user.role !== 'admin' && user.id !== research.owner_id) throw new AppError(403, '只能修改自己的研究成果');
}

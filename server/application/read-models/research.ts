import type { FileRecord, Research, User } from '../../../shared/contracts.js';
import { pool, type DB } from '../../db/index.js';
import { readDatabase } from '../../db/read.js';
import { AppError } from '../../shared/errors.js';

export type ResearchFilters = {
  q: string;
  type?: string;
  factor?: string;
  page: number;
  mine: boolean;
};
const RESEARCH_PAGE_SIZE = 20;
const projection = {
  async get(db: DB, id: string): Promise<Research> {
    const result = await readDatabase(db).query<Research>(
      `
      SELECT r.*, u.real_name AS owner_name, f.name AS factor_name
      FROM research_records r
      JOIN users u ON u.id = r.owner_id
      JOIN factor_types f ON f.id = r.factor_type_id
      WHERE r.id = $1

    `,
      [id],
    );
    const research = result.rows[0];
    if (!research) {
      throw new AppError(404, '研究成果不存在');
    }
    return research;
  },
  async files(db: DB, researchId: string): Promise<FileRecord[]> {
    const result = await readDatabase(db).query<FileRecord>(
      `
      SELECT f.id, f.research_id, f.factor_type_id, f.role, f.original_name,
             f.mime_type, f.size_bytes, f.is_current, f.created_at,
             CASE WHEN d.dataset_file_id IS NOT NULL THEN
               jsonb_build_object(
                 'field_count', jsonb_array_length(d.profile->'fields'),
                 'row_count', d.profile->'row_count',
                 'described', d.saved_at IS NOT NULL
               )
             END AS dataset_summary
      FROM file_mappings f
      LEFT JOIN dataset_descriptions d ON d.dataset_file_id = f.id
      WHERE f.research_id = $1 AND f.deleted_at IS NULL
      ORDER BY f.created_at DESC
    `,
      [researchId],
    );
    return result.rows;
  },
  async history(db: DB, researchId: string) {
    const result = await readDatabase(db).query(
      `
      SELECT * FROM upload_events
      WHERE research_id = $1
      ORDER BY created_at DESC
      LIMIT 200
    `,
      [researchId],
    );
    return result.rows;
  },
  async list(db: DB, filters: ResearchFilters, userId: string) {
    const parameters: unknown[] = [];
    const conditions: string[] = [];
    function addCondition(expression: string, value: unknown) {
      parameters.push(value);
      conditions.push(expression.replace('?', `$${parameters.length}`));
    }
    if (filters.q) {
      addCondition('r.title ILIKE ?', `%${filters.q}%`);
    }
    if (filters.type) {
      addCondition('r.research_type = ?', filters.type);
    }
    if (filters.factor) {
      addCondition('r.factor_type_id = ?', filters.factor);
    }
    if (filters.mine) {
      addCondition('r.owner_id = ?', userId);
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const countResult = await readDatabase(db).query(
      `
      SELECT count(*) FROM research_records r ${whereClause}
    `,
      parameters,
    );
    const offset = (filters.page - 1) * RESEARCH_PAGE_SIZE;
    const rowsResult = await readDatabase(db).query(
      `
      SELECT r.*, u.real_name AS owner_name, f.name AS factor_name,
             (SELECT count(*)::int FROM file_mappings fm
              WHERE fm.research_id = r.id AND fm.is_current AND fm.deleted_at IS NULL) AS file_count
      FROM research_records r
      JOIN users u ON u.id = r.owner_id
      JOIN factor_types f ON f.id = r.factor_type_id
      ${whereClause}
      ORDER BY r.updated_at DESC, r.id
      LIMIT ${RESEARCH_PAGE_SIZE} OFFSET $${parameters.length + 1}
    `,
      [...parameters, offset],
    );
    return {
      items: rowsResult.rows,
      total: Number(countResult.rows[0].count),
      page: filters.page,
      page_size: RESEARCH_PAGE_SIZE,
    };
  },
};

export async function readResearchRecord(id: string, db: DB = pool) {
  return projection.get(db, id);
}

export async function getResearch(id: string, db: DB = pool) {
  return { ...(await projection.get(db, id)), files: await projection.files(db, id) };
}

export function listResearch(filters: ResearchFilters, user: User) {
  return projection.list(pool, filters, user.id);
}

export async function getResearchHistory(id: string) {
  await projection.get(pool, id);
  return projection.history(pool, id);
}

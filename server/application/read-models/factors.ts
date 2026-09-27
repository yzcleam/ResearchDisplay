import type { Factor, FileRecord } from '../../../shared/contracts.js';
import { pool } from '../../db/index.js';
import { readDatabase } from '../../db/read.js';

export async function listFactors() {
  return (
    await readDatabase(pool).query<Factor>(`
    SELECT f.*,
      (SELECT count(*)::int FROM research_records r WHERE r.factor_type_id = f.id) AS research_count,
      (SELECT count(*)::int FROM file_mappings m WHERE m.factor_type_id = f.id AND m.is_current AND m.deleted_at IS NULL) AS file_count
    FROM factor_types f ORDER BY f.created_at, f.name
  `)
  ).rows;
}

export async function enabledFactors() {
  return (
    await readDatabase(pool).query<{ id: string; name: string }>(`
    SELECT id, name FROM factor_types WHERE active ORDER BY name
  `)
  ).rows;
}

export async function factorFiles(id: string, page: number, history: boolean) {
  const where = 'factor_type_id = $1 AND deleted_at IS NULL' + (history ? '' : ' AND is_current');
  const read = readDatabase(pool);
  const total = Number(
    (
      await read.query(
        `
    SELECT count(*) FROM file_mappings WHERE ${where}
  `,
        [id],
      )
    ).rows[0].count,
  );
  const items = (
    await read.query<FileRecord>(
      `
    SELECT id, research_id, factor_type_id, role, original_name, mime_type, size_bytes, is_current, created_at
    FROM file_mappings WHERE ${where}
    ORDER BY created_at DESC, id LIMIT 50 OFFSET $2
  `,
      [id, (page - 1) * 50],
    )
  ).rows;
  return { items, total, page, page_size: 50 };
}

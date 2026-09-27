import { pool } from '../../db/index.js';
import { readDatabase } from '../../db/read.js';

export async function readDashboardStats(userId: string) {
  const result = await readDatabase(pool).query(
    `
    SELECT
      (SELECT count(*)::int FROM research_records) AS research,
      (SELECT count(*)::int FROM file_mappings WHERE is_current AND deleted_at IS NULL) AS files,
      (SELECT count(*)::int FROM factor_types WHERE active) AS factors,
      (SELECT count(*)::int FROM research_records WHERE owner_id = $1) AS mine
  `,
    [userId],
  );
  return result.rows[0];
}

export async function readRecentUploads() {
  const result = await readDatabase(pool).query(`
    SELECT * FROM upload_events
    ORDER BY created_at DESC
    LIMIT 100
  `);
  return result.rows;
}

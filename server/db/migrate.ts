import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pool, transaction } from './index.js';
import { logger } from '../shared/logger.js';
export async function migrate() {
  await transaction(async db => {
    await db.query('SELECT pg_advisory_xact_lock(81919001)');
    await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const directory = path.resolve('server/db/migrations');
    for (const name of (await readdir(directory)).filter(n => n.endsWith('.sql') && !n.endsWith('.down.sql')).sort()) {
      if ((await db.query('SELECT 1 FROM schema_migrations WHERE name=$1', [name])).rowCount) continue;
      await db.query(await readFile(path.join(directory, name), 'utf8'));
      await db.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
      logger.info({ migration: name }, '数据库迁移完成');
    }
  });
}
if (process.argv[1]?.replaceAll('\\', '/').match(/\/migrate\.(ts|js)$/)) {
  try { await migrate(); } finally { await pool.end(); }
}

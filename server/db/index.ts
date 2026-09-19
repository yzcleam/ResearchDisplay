import pg from 'pg';
import { config } from '../config.js';
export const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10, connectionTimeoutMillis: 5000, idleTimeoutMillis: 30000 });
export type DB = Pick<pg.PoolClient, 'query'>;
export async function transaction<T>(fn: (db: DB) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try { await db.query('BEGIN'); const result = await fn(db); await db.query('COMMIT'); return result; }
  catch (err) { await db.query('ROLLBACK'); throw err; }
  finally { db.release(); }
}

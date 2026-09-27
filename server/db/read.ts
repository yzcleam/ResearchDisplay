import type pg from 'pg';
import type { DB } from './index.js';
import { assertReadQuery } from './sql.js';

export type ReadDatabase = {
  query<Row extends pg.QueryResultRow = pg.QueryResultRow>(
    sql: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<Row>>;
};

/**
 * 普通查询使用数据库只读事务。
 * 写模型借入当前事务时，不另开连接，才能读取尚未提交的结果；此时仍检查 SQL。
 */
export function readDatabase(db: DB): ReadDatabase {
  return {
    async query(sql, values) {
      assertReadQuery(sql);
      const isPool = 'connect' in db && !('release' in db);
      if (!isPool) {
        return db.query(sql, values);
      }
      const connection = await (db as pg.Pool).connect();
      try {
        await connection.query('BEGIN READ ONLY');
        const result = await connection.query(sql, values);
        await connection.query('COMMIT');
        return result;
      } catch (error) {
        await connection.query('ROLLBACK');
        throw error;
      } finally {
        connection.release();
      }
    },
  };
}

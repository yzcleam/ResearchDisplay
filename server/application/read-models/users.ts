import type { User } from '../../../shared/contracts.js';
import { pool, type DB } from '../../db/index.js';
import { readDatabase } from '../../db/read.js';

const publicColumns = 'id, real_name, email, institution, role, active, created_at';

export async function listUsers() {
  return (
    await readDatabase(pool).query<User>(`
    SELECT ${publicColumns} FROM users ORDER BY created_at DESC LIMIT 500
  `)
  ).rows;
}

export async function listActiveUserDirectory() {
  return (
    await readDatabase(pool).query<Pick<User, 'id' | 'real_name'>>(
      'SELECT id, real_name FROM users WHERE active ORDER BY real_name,id LIMIT 500',
    )
  ).rows;
}

export async function activeUser(id: string, db: DB) {
  return (
    await readDatabase(db).query<User>(
      `
    SELECT ${publicColumns} FROM users WHERE id = $1 AND active
  `,
      [id],
    )
  ).rows[0];
}

import type { DB } from '../db/index.js';
import type { User } from '../../shared/contracts.js';
export type StoredUser = User & { password_hash: string };
export const publicColumns = 'id, real_name, email, institution, role, active, created_at';
export const authRepo = {
  async byEmail(db: DB, email: string): Promise<StoredUser | undefined> {
    return (await db.query('SELECT * FROM users WHERE email=$1', [email])).rows[0];
  },
  async create(db: DB, data: {email: string; real_name: string; institution: string; password_hash: string; role: string}): Promise<User> {
    return (await db.query(`INSERT INTO users(email,real_name,institution,password_hash,role) VALUES ($1,$2,$3,$4,$5) RETURNING ${publicColumns}`, [data.email, data.real_name, data.institution, data.password_hash, data.role])).rows[0];
  },
  async session(db: DB, hash: string) {
    return (await db.query(`SELECT u.*, s.csrf_token FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at > now() AND u.active`, [hash])).rows[0] as (StoredUser & { csrf_token: string }) | undefined;
  },
};

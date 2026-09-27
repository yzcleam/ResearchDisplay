import type { User } from '../../shared/contracts.js';
import type { DB } from '../db/index.js';
export type StoredUser = User & { password_hash: string };
export const publicColumns = 'id, real_name, email, institution, role, active, created_at';
export const authRepo = {
  async byEmail(db: DB, email: string): Promise<StoredUser | undefined> {
    return (await db.query('SELECT * FROM users WHERE email=$1', [email])).rows[0];
  },
  async create(
    db: DB,
    data: {
      email: string;
      real_name: string;
      institution: string;
      password_hash: string;
      role: string;
    },
  ): Promise<User> {
    return (
      await db.query(
        `INSERT INTO users(email,real_name,institution,password_hash,role) VALUES ($1,$2,$3,$4,$5) RETURNING ${publicColumns}`,
        [data.email, data.real_name, data.institution, data.password_hash, data.role],
      )
    ).rows[0];
  },
  async session(db: DB, hash: string) {
    return (
      await db.query(
        `SELECT u.*, s.csrf_token FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at > now() AND u.active`,
        [hash],
      )
    ).rows[0] as (StoredUser & { csrf_token: string }) | undefined;
  },
  async createSession(db: DB, hash: string, userId: string, csrf: string, days: number) {
    await db.query('DELETE FROM sessions WHERE expires_at < now()');
    await db.query(
      `
      INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at)
      VALUES ($1, $2, $3, now() + $4 * interval '1 day')
    `,
      [hash, userId, csrf, days],
    );
  },
  async deleteSession(db: DB, hash: string) {
    await db.query('DELETE FROM sessions WHERE token_hash = $1', [hash]);
  },
  async lockUserAdministration(db: DB, id: string) {
    await db.query('SELECT pg_advisory_xact_lock(81919002)');
    return (await db.query<StoredUser>('SELECT * FROM users WHERE id = $1 FOR UPDATE', [id]))
      .rows[0];
  },
  async activeAdminCount(db: DB) {
    return Number(
      (await db.query("SELECT count(*) FROM users WHERE role = 'admin' AND active")).rows[0].count,
    );
  },
  async updateUser(
    db: DB,
    id: string,
    change: { role: 'admin' | 'teacher' | 'member'; active: boolean },
  ) {
    await db.query('UPDATE users SET role = $2, active = $3, updated_at = now() WHERE id = $1', [
      id,
      change.role,
      change.active,
    ]);
    await db.query('DELETE FROM sessions WHERE user_id = $1', [id]);
  },
};

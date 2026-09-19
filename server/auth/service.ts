import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { authRepo } from './repository.js';
import { pool, transaction } from '../db/index.js';
import { AppError } from '../shared/errors.js';
import { config } from '../config.js';
import type { User } from '../../shared/contracts.js';
const derive = promisify(scrypt);
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = await derive(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [method, salt, hex] = stored.split(':');
  if (method !== 'scrypt' || !salt || !hex) return false;
  const hash = await derive(password, salt, 64) as Buffer;
  const expected = Buffer.from(hex, 'hex');
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}
const dummyHash = await hashPassword(randomBytes(32).toString('hex'));
export function publicUser(user: User): User {
  return { id: user.id, email: user.email, real_name: user.real_name, institution: user.institution, role: user.role, active: user.active, created_at: user.created_at };
}
export async function register(data: {email: string; password: string; real_name: string; institution: string; invite_code?: string}, admin = false) {
  if (!admin && config.REGISTRATION_ENABLED !== 'true') throw new AppError(403, '暂未开放注册，请联系管理员');
  if (!admin && config.REGISTRATION_INVITE_CODE && tokenHash(data.invite_code || '') !== tokenHash(config.REGISTRATION_INVITE_CODE)) throw new AppError(403, '邀请码不正确');
  return authRepo.create(pool, { ...data, password_hash: await hashPassword(data.password), role: admin ? 'admin' : 'member' });
}
export async function login(email: string, password: string) {
  const user = await authRepo.byEmail(pool, email);
  const valid = await verifyPassword(password, user?.password_hash || dummyHash);
  if (!user || !valid || !user.active) throw new AppError(401, '邮箱或密码不正确，或账号已停用');
  const token = randomBytes(32).toString('hex'); const csrf = randomBytes(32).toString('hex');
  await transaction(async db => {
    await db.query('DELETE FROM sessions WHERE expires_at < now()');
    await db.query("INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES ($1,$2,$3, now() + $4 * interval '1 day')", [tokenHash(token), user.id, csrf, config.SESSION_DAYS]);
  });
  return { user: publicUser(user), token, csrf };
}
export async function updateUser(actor: User, id: string, change: {role: 'admin'|'member'; active: boolean}) {
  if (actor.id === id && (!change.active || change.role !== 'admin')) throw new AppError(400, '不能停用自己或撤销自己的管理员权限');
  return transaction(async db => {
    await db.query('SELECT pg_advisory_xact_lock(81919002)');
    const existing = (await db.query('SELECT * FROM users WHERE id=$1 FOR UPDATE', [id])).rows[0];
    if (!existing) throw new AppError(404, '用户不存在');
    if (existing.role === 'admin' && (!change.active || change.role !== 'admin')) {
      const count = (await db.query("SELECT count(*) FROM users WHERE role='admin' AND active")).rows[0].count;
      if (Number(count) <= 1) throw new AppError(400, '至少需要保留一位启用的管理员');
    }
    await db.query('UPDATE users SET role=$2,active=$3,updated_at=now() WHERE id=$1', [id, change.role, change.active]);
    await db.query('DELETE FROM sessions WHERE user_id=$1', [id]);
  });
}

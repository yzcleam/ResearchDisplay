import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { User } from '../../shared/contracts.js';
import { config } from '../config.js';
import { pool, transaction } from '../db/index.js';
import { AppError } from '../shared/errors.js';
import { assertAdministrator } from './policies.js';
import { authRepo } from './repository.js';
const derive = promisify(scrypt);
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = (await derive(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password: string, stored: string) {
  const [method, salt, hex] = stored.split(':');
  if (method !== 'scrypt' || !salt || !hex) {
    return false;
  }
  const hash = (await derive(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hex, 'hex');
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}
const dummyHash = await hashPassword(randomBytes(32).toString('hex'));
export function publicUser(user: User): User {
  return {
    id: user.id,
    email: user.email,
    real_name: user.real_name,
    institution: user.institution,
    role: user.role,
    active: user.active,
    created_at: user.created_at,
  };
}
export async function register(
  data: {
    email: string;
    password: string;
    real_name: string;
    institution: string;
    invite_code?: string;
  },
  admin = false,
) {
  if (!admin && config.REGISTRATION_ENABLED !== 'true') {
    throw new AppError(403, '暂未开放注册，请联系管理员');
  }
  if (
    !admin &&
    config.REGISTRATION_INVITE_CODE &&
    tokenHash(data.invite_code || '') !== tokenHash(config.REGISTRATION_INVITE_CODE)
  ) {
    throw new AppError(403, '邀请码不正确');
  }
  return authRepo.create(pool, {
    ...data,
    password_hash: await hashPassword(data.password),
    role: admin ? 'admin' : 'member',
  });
}
export async function login(email: string, password: string) {
  const user = await authRepo.byEmail(pool, email);
  const valid = await verifyPassword(password, user?.password_hash || dummyHash);
  if (!user || !valid || !user.active) {
    throw new AppError(401, '邮箱或密码不正确，或账号已停用');
  }
  const token = randomBytes(32).toString('hex');
  const csrf = randomBytes(32).toString('hex');
  await transaction(async (db) => {
    await authRepo.createSession(db, tokenHash(token), user.id, csrf, config.SESSION_DAYS);
  });
  return { user: publicUser(user), token, csrf };
}
export async function updateUser(
  actor: User,
  id: string,
  change: { role: 'admin' | 'teacher' | 'member'; active: boolean },
) {
  assertAdministrator(actor);
  if (actor.id === id && (!change.active || change.role !== 'admin')) {
    throw new AppError(400, '不能停用自己或撤销自己的管理员权限');
  }
  return transaction(async (db) => {
    const existing = await authRepo.lockUserAdministration(db, id);
    if (!existing) {
      throw new AppError(404, '用户不存在');
    }
    if (existing.role === 'admin' && (!change.active || change.role !== 'admin')) {
      const count = await authRepo.activeAdminCount(db);
      if (Number(count) <= 1) {
        throw new AppError(400, '至少需要保留一位启用的管理员');
      }
    }
    await authRepo.updateUser(db, id, change);
  });
}

export async function createTeacher(
  actor: User,
  data: {
    email: string;
    password: string;
    real_name: string;
    institution: string;
  },
) {
  assertAdministrator(actor);
  return authRepo.create(pool, {
    ...data,
    password_hash: await hashPassword(data.password),
    role: 'teacher',
  });
}

export async function resolveSession(token: unknown) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
    throw new AppError(401, '请先登录');
  }
  const session = await authRepo.session(pool, tokenHash(token));
  if (!session) {
    throw new AppError(401, '登录已失效，请重新登录');
  }
  return { user: publicUser(session), csrf: session.csrf_token };
}

export async function logout(token: string) {
  await authRepo.deleteSession(pool, tokenHash(token));
}

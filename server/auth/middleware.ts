import type { Request, Response, NextFunction } from 'express';
import type { User } from '../../shared/contracts.js';
import { pool } from '../db/index.js';
import { authRepo } from './repository.js';
import { tokenHash, publicUser } from './service.js';
import { AppError } from '../shared/errors.js';
declare global { namespace Express { interface Request { user: User; csrfToken: string; requestId: string } } }
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.research_session;
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new AppError(401, '请先登录');
  const session = await authRepo.session(pool, tokenHash(token));
  if (!session) throw new AppError(401, '登录已失效，请重新登录');
  req.user = publicUser(session); req.csrfToken = session.csrf_token;
  if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.get('x-csrf-token') !== session.csrf_token) throw new AppError(403, '安全校验失败，请刷新页面后重试');
  next();
}
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user.role !== 'admin') throw new AppError(403, '此操作需要管理员权限'); next();
}

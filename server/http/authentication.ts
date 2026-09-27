import type { NextFunction, Request, Response } from 'express';
import type { User } from '../../shared/contracts.js';
import { assertAdministrator, resolveSession } from '../application/read-models/auth.js';
import { AppError } from '../shared/errors.js';

declare global {
  namespace Express {
    interface Request {
      user: User;
      csrfToken: string;
      requestId: string;
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const session = await resolveSession(req.cookies?.research_session);
  req.user = session.user;
  req.csrfToken = session.csrf;
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
    req.get('x-csrf-token') !== session.csrf
  ) {
    throw new AppError(403, '安全校验失败，请刷新页面后重试');
  }
  next();
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  assertAdministrator(req.user);
  next();
}

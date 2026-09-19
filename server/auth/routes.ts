import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { registerSchema } from '../../shared/contracts.js';
import { register, login, tokenHash, updateUser } from './service.js';
import { authenticate, requireAdmin } from './middleware.js';
import { pool } from '../db/index.js';
import { publicColumns } from './repository.js';
import { config } from '../config.js';
export const authRouter = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: '操作过于频繁，请稍后重试' } });
const cookie = { httpOnly: true, secure: config.secure, sameSite: 'lax' as const, path: '/' };
authRouter.post('/register', limiter, async (req, res) => { res.status(201).json({ user: await register(registerSchema.parse(req.body)) }); });
authRouter.post('/login', limiter, async (req, res) => {
  const data = z.object({ email: z.email().max(254).transform(v => v.toLowerCase()), password: z.string().min(1).max(128) }).strict().parse(req.body);
  const result = await login(data.email, data.password);
  res.cookie('research_session', result.token, { ...cookie, maxAge: config.SESSION_DAYS * 86400000 }).json({ user: result.user, csrf: result.csrf });
});
authRouter.get('/me', authenticate, (req, res) => res.json({ user: req.user, csrf: req.csrfToken }));
authRouter.post('/logout', authenticate, async (req, res) => {
  await pool.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash(req.cookies.research_session)]);
  res.clearCookie('research_session', cookie).status(204).end();
});
export const usersRouter = Router();
usersRouter.use(authenticate, requireAdmin);
usersRouter.get('/', async (_req, res) => { res.json((await pool.query(`SELECT ${publicColumns} FROM users ORDER BY created_at DESC LIMIT 500`)).rows); });
usersRouter.patch('/:id', async (req, res) => {
  await updateUser(req.user, z.uuid().parse(req.params.id), z.object({ role: z.enum(['admin','member']), active: z.boolean() }).strict().parse(req.body));
  res.status(204).end();
});

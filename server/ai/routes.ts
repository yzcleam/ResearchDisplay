import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate, requireAdmin } from '../auth/middleware.js';
import { aiGenerateSchema, aiSettingsSchema } from '../../shared/ai.js';
import { aiStatus, getAiSettings, saveAiSettings } from './settings.js';
import { generateSuggestions, testConnection } from './service.js';
import { AppError } from '../shared/errors.js';

export const aiRouter = Router();
aiRouter.use(authenticate);
aiRouter.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
const limit = rateLimit({ windowMs: 5 * 60 * 1000, limit: 10, keyGenerator: req => req.user.id, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'AI 请求过于频繁，每 5 分钟最多 10 次，请稍后再试' } });
const pending = new Set<string>();
async function run(req: Request, res: Response, task: (signal: AbortSignal) => Promise<unknown>) {
  if (pending.has(req.user.id)) throw new AppError(409, '已有生成请求正在处理，请稍候');
  pending.add(req.user.id);
  const controller = new AbortController();
  const abort = () => { if (!res.writableEnded) controller.abort(); };
  res.once('close', abort);
  try { const result = await task(controller.signal); if (!controller.signal.aborted) res.json(result); }
  catch (error) { if (!controller.signal.aborted) throw error; }
  finally { pending.delete(req.user.id); res.off('close', abort); }
}
aiRouter.get('/status', async (_req, res) => { res.json(await aiStatus()); });
aiRouter.get('/settings', requireAdmin, async (_req, res) => { res.json(await getAiSettings()); });
aiRouter.put('/settings', requireAdmin, async (req, res) => { res.json(await saveAiSettings(req.user, aiSettingsSchema.parse(req.body))); });
aiRouter.post('/test', requireAdmin, limit, (req, res) => run(req, res, signal => testConnection(signal)));
aiRouter.post('/generate', limit, async (req, res) => {
  const input = aiGenerateSchema.parse(req.body);
  await run(req, res, signal => generateSuggestions(req.user, input, signal));
});

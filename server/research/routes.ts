import { Router } from 'express';
import { z } from 'zod';
import { researchSchema, researchTypes } from '../../shared/contracts.js';
import { authenticate } from '../auth/middleware.js';
import { pool } from '../db/index.js';
import { researchRepo } from './repository.js';
import { createResearch, updateResearch, listResearch } from './service.js';
export const researchRouter = Router();
researchRouter.use(authenticate);
researchRouter.get('/', async (req, res) => {
  const query = z.object({ q: z.string().max(200).default(''), type: z.enum(researchTypes).optional(), factor: z.uuid().optional(), page: z.coerce.number().int().min(1).max(100000).default(1), mine: z.enum(['true','false']).default('false').transform(v=>v==='true') }).parse(req.query);
  res.json(await listResearch(query, req.user));
});
researchRouter.post('/', async (req, res) => { res.status(201).json(await createResearch(req.user, researchSchema.strict().parse(req.body))); });
researchRouter.get('/:id', async (req, res) => {
  const id = z.uuid().parse(req.params.id); res.json({ ...await researchRepo.get(pool, id), files: await researchRepo.files(pool, id) });
});
researchRouter.put('/:id', async (req, res) => { res.json(await updateResearch(req.user, z.uuid().parse(req.params.id), researchSchema.extend({version: z.number().int().min(1)}).strict().parse(req.body))); });
researchRouter.get('/:id/history', async (req, res) => {
  const id = z.uuid().parse(req.params.id); await researchRepo.get(pool, id);
  res.json((await pool.query('SELECT * FROM upload_events WHERE research_id=$1 ORDER BY created_at DESC LIMIT 200', [id])).rows);
});

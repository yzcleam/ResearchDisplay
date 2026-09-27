import { Router } from 'express';
import { z } from 'zod';
import { factorFiles, listFactors } from '../../application/read-models/factors.js';
import { addFactor, editFactor } from '../../application/write-models/factors.js';
import { authenticate, requireAdmin } from '../authentication.js';

export const factorsRouter = Router();
factorsRouter.use(authenticate);
factorsRouter.get('/', async (_req, res) => res.json(await listFactors()));
factorsRouter.post('/', requireAdmin, async (req, res) => {
  const { name } = z
    .object({ name: z.string().trim().min(1).max(80) })
    .strict()
    .parse(req.body);
  res.status(201).json(await addFactor(req.user, name));
});
factorsRouter.patch('/:id', requireAdmin, async (req, res) => {
  const input = z
    .object({
      name: z.string().trim().min(1).max(80),
      active: z.boolean(),
    })
    .strict()
    .parse(req.body);
  res.json(await editFactor(req.user, z.uuid().parse(req.params.id), input));
});
factorsRouter.get('/:id/files', async (req, res) => {
  const query = z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      history: z.enum(['true', 'false']).default('false'),
    })
    .parse(req.query);
  res.json(await factorFiles(z.uuid().parse(req.params.id), query.page, query.history === 'true'));
});

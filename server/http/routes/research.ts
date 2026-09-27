import { Router } from 'express';
import { z } from 'zod';
import { researchSchema, researchTypes } from '../../../shared/contracts.js';
import {
  getResearch,
  getResearchHistory,
  listResearch,
} from '../../application/read-models/research.js';
import { createResearch, updateResearch } from '../../application/write-models/research.js';
import { authenticate } from '../authentication.js';
export const researchRouter = Router();
researchRouter.use(authenticate);
researchRouter.get('/', async (req, res) => {
  const query = z
    .object({
      q: z.string().max(200).default(''),
      type: z.enum(researchTypes).optional(),
      factor: z.uuid().optional(),
      page: z.coerce.number().int().min(1).max(100000).default(1),
      mine: z
        .enum(['true', 'false'])
        .default('false')
        .transform((v) => v === 'true'),
    })
    .parse(req.query);
  res.json(await listResearch(query, req.user));
});
researchRouter.post('/', async (req, res) => {
  res.status(201).json(await createResearch(req.user, researchSchema.strict().parse(req.body)));
});
researchRouter.get('/:id', async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  res.json(await getResearch(id));
});
researchRouter.put('/:id', async (req, res) => {
  res.json(
    await updateResearch(
      req.user,
      z.uuid().parse(req.params.id),
      researchSchema
        .extend({ version: z.number().int().min(1) })
        .strict()
        .parse(req.body),
    ),
  );
});
researchRouter.get('/:id/history', async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  res.json(await getResearchHistory(id));
});

import { Router } from 'express';
import { z } from 'zod';
import { datasetDescriptionSchema } from '../../../shared/datasets.js';
import { getDescription } from '../../application/read-models/datasets.js';
import { ensureParsed, saveDescription } from '../../application/write-models/datasets.js';
import { authenticate } from '../authentication.js';

export const datasetsRouter = Router();
datasetsRouter.use(authenticate);
datasetsRouter.get('/:id', async (req, res) =>
  res.json(await getDescription(z.uuid().parse(req.params.id))),
);
datasetsRouter.post('/:id/parse', async (req, res) =>
  res.json(await ensureParsed(req.user, z.uuid().parse(req.params.id))),
);
datasetsRouter.put('/:id', async (req, res) =>
  res.json(
    await saveDescription(
      req.user,
      z.uuid().parse(req.params.id),
      datasetDescriptionSchema.parse(req.body),
    ),
  ),
);

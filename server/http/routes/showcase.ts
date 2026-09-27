import { Router } from 'express';
import { z } from 'zod';
import { showcaseQuery } from '../../../shared/showcase.js';
import {
  showcaseDetail,
  showcaseOverview,
  showcasePage,
} from '../../application/read-models/showcase.js';
import { authenticate } from '../authentication.js';

export const showcaseRouter = Router();
showcaseRouter.use(authenticate);
showcaseRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
});
showcaseRouter.get('/', async (req, res) => {
  res.json(await showcaseOverview(showcaseQuery.parse(req.query)));
});
showcaseRouter.get('/factors/:id/research', async (req, res) => {
  const { page, ...query } = showcaseQuery
    .omit({ factor: true })
    .extend({ page: z.coerce.number().int().min(1).max(100000).default(1) })
    .parse(req.query);
  res.json(await showcasePage(z.uuid().parse(req.params.id), query, page));
});
showcaseRouter.get('/research/:id', async (req, res) => {
  res.json(await showcaseDetail(z.uuid().parse(req.params.id)));
});

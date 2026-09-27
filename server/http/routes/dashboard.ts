import { Router } from 'express';
import { readDashboardStats, readRecentUploads } from '../../application/read-models/dashboard.js';
import { authenticate } from '../authentication.js';

export const dashboardRouter = Router();

dashboardRouter.get('/stats', authenticate, async (request, response) => {
  response.json(await readDashboardStats(request.user.id));
});

dashboardRouter.get('/uploads', authenticate, async (_request, response) => {
  response.json(await readRecentUploads());
});

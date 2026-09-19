import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/middleware.js';
import { sections } from '../../shared/contracts.js';
import { saveDocument, enqueuePdf, getJob } from './service.js';
export const documentsRouter=Router(); documentsRouter.use(authenticate);
documentsRouter.put('/research/:id/:section',async(req,res)=>{
  const data=z.object({html:z.string().max(1000000),revision:z.number().int().min(0)}).strict().parse(req.body);
  res.json(await saveDocument(req.user,z.uuid().parse(req.params.id),z.enum(sections).parse(req.params.section),data.html,data.revision));
});
documentsRouter.post('/research/:id/:section/pdf',async(req,res)=>{
  res.status(202).json(await enqueuePdf(req.user,z.uuid().parse(req.params.id),z.enum(sections).parse(req.params.section)));
});
documentsRouter.get('/jobs/:id',async(req,res)=>{res.json(await getJob(z.uuid().parse(req.params.id)));});

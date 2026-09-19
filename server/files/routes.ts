import { Router } from 'express';
import multer from 'multer';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { config } from '../config.js';
import { authenticate } from '../auth/middleware.js';
import { researchRepo, canEdit } from '../research/repository.js';
import { pool } from '../db/index.js';
import { fileRoles } from '../../shared/contracts.js';
import { uploadFiles } from './service.js';
import { AppError } from '../shared/errors.js';
const tmp=path.join(config.storage,'tmp'); await mkdir(tmp,{recursive:true});
const upload=multer({dest:tmp,limits:{fileSize:config.MAX_FILE_MB*1024*1024,files:12,fields:0,parts:12}}).fields(fileRoles.map(name=>({name,maxCount:name==='editor_image'?8:1})));
export const filesRouter=Router(); filesRouter.use(authenticate);
filesRouter.post('/research/:id', async(req,_res,next)=>{
  const research=await researchRepo.get(pool,z.uuid().parse(req.params.id)); canEdit(req.user,research); next();
},upload,async(req,res)=>{
  const files=Object.values(req.files||{}).flat() as Express.Multer.File[];
  res.status(201).json(await uploadFiles(req.user,req.params.id as string,files));
});
filesRouter.get('/:id/content',async(req,res)=>{
  const id=z.uuid().parse(req.params.id);
  const file=(await pool.query('SELECT * FROM file_mappings WHERE id=$1',[id])).rows[0];
  if(!file) throw new AppError(404,'文件不存在');
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('Content-Type',file.mime_type);
  // Inline only vetted image formats and PDFs; every download still requires a live session.
  const disposition=req.query.download==='1'||!['image/png','image/jpeg','image/webp','application/pdf'].includes(file.mime_type)?'attachment':'inline';
  res.setHeader('Content-Disposition',`${disposition}; filename="download"; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);
  res.sendFile(path.join(config.storage,'objects',file.storage_key),{dotfiles:'allow'});
});

import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { ZodError } from 'zod';
import multer from 'multer';
import { config } from './config.js';
import { logger } from './shared/logger.js';
import { AppError } from './shared/errors.js';
import { pool } from './db/index.js';
import { authRouter, usersRouter } from './auth/routes.js';
import { researchRouter } from './research/routes.js';
import { factorsRouter } from './factors/routes.js';
import { filesRouter } from './files/routes.js';
import { documentsRouter } from './documents/routes.js';
import { datasetsRouter } from './datasets/routes.js';
import { aiRouter } from './ai/routes.js';
import { showcaseRouter } from './showcase/routes.js';
import { authenticate } from './auth/middleware.js';
export function createApp() {
  const app=express(); app.disable('x-powered-by'); app.set('trust proxy',config.TRUST_PROXY);
  app.use(helmet({contentSecurityPolicy:{directives:{'img-src':["'self'",'data:','blob:'],'style-src':["'self'","'unsafe-inline'"],'upgrade-insecure-requests':config.secure?[]:null}},strictTransportSecurity:config.secure?undefined:false}));
  app.use((req,res,next)=>{
    req.requestId=randomUUID();res.setHeader('X-Request-ID',req.requestId);
    const started=Date.now(); res.on('finish',()=>logger.info({requestId:req.requestId,method:req.method,path:req.path,status:res.statusCode,duration:Date.now()-started},'http'));
    const origin=req.get('origin');
    if(origin && origin!==config.APP_ORIGIN) return next(new AppError(403,'不允许的请求来源'));
    if(origin) {res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Vary','Origin');}
    if(req.method==='OPTIONS') {res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,X-CSRF-Token');res.status(204).end();return;}
    if(!['GET','HEAD','OPTIONS'].includes(req.method) && origin!==config.APP_ORIGIN) return next(new AppError(403,'缺少有效的请求来源'));
    next();
  });
  app.use(express.json({limit:'2mb'}));app.use(cookieParser());
  app.get('/health',(_req,res)=>res.json({status:'ok'}));
  app.get('/ready',async(_req,res)=>{try{await pool.query('SELECT 1');res.json({status:'ok',database:'ok'});}catch{res.status(503).json({status:'unavailable'});}});
  app.use('/api/auth',authRouter);app.use('/api/users',usersRouter);app.use('/api/research',researchRouter);app.use('/api/factors',factorsRouter);app.use('/api/files',filesRouter);app.use('/api/documents',documentsRouter);
  app.use('/api/datasets',datasetsRouter);
  app.use('/api/ai',aiRouter);
  app.use('/api/showcase',showcaseRouter);
  app.get('/api/stats',authenticate,async(req,res)=>{
    const result=await pool.query(`SELECT (SELECT count(*)::int FROM research_records) AS research,(SELECT count(*)::int FROM file_mappings WHERE is_current) AS files,(SELECT count(*)::int FROM factor_types WHERE active) AS factors,(SELECT count(*)::int FROM research_records WHERE owner_id=$1) AS mine`,[req.user.id]);res.json(result.rows[0]);
  });
  app.get('/api/uploads',authenticate,async(_req,res)=>res.json((await pool.query('SELECT * FROM upload_events ORDER BY created_at DESC LIMIT 100')).rows));
  app.use('/api',(_req,_res,next)=>next(new AppError(404,'接口不存在')));
  if(existsSync(path.resolve('dist/index.html'))) {app.use(express.static('dist'));app.get('/{*path}',(_req,res)=>res.sendFile(path.resolve('dist/index.html')));}
  app.use((err:unknown,req:express.Request,res:express.Response,_next:express.NextFunction)=>{
    if(res.headersSent) return _next(err);
    if(err instanceof ZodError) return res.status(400).json({message:'请检查输入内容',fields:err.issues.map(i=>({path:i.path.join('.'),message:i.message})),requestId:req.requestId});
    if(err instanceof AppError) return res.status(err.status).json({message:err.message,code:err.code,requestId:req.requestId});
    if(err instanceof multer.MulterError) return res.status(400).json({message:err.code==='LIMIT_FILE_SIZE'?`单个文件不能超过 ${config.MAX_FILE_MB} MB`:'上传数量、字段或大小不符合要求'});
    const code=(err as {code?:string})?.code;
    if(code==='23505') return res.status(409).json({message:'邮箱、名称或记录已存在'});
    if(code==='23503') return res.status(409).json({message:'关联记录已改变，请刷新后重试'});
    if((err as {type?:string})?.type==='entity.too.large') return res.status(413).json({message:'提交内容过大，请通过插图按钮上传图片'});
    if(err instanceof SyntaxError && 'body' in err) return res.status(400).json({message:'请求格式不正确'});
    // Database errors can include PII in detail/query; never log raw request bodies or SQL parameters.
    logger.error({requestId:req.requestId,code:code||'INTERNAL',errorType:err instanceof Error?err.name:'unknown'},'请求失败');
    res.status(500).json({message:'服务暂时不可用，请稍后重试',requestId:req.requestId});
  });
  return app;
}

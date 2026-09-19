import { mkdir, writeFile, rm } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { pool, transaction } from '../db/index.js';
import { config } from '../config.js';
import { researchRepo, canEdit } from '../research/repository.js';
import { sectionLabels, type Section } from '../../shared/contracts.js';
import { renderPdf } from './render.js';
import { logger } from '../shared/logger.js';
export async function processOneJob() {
  const job=await transaction(async db=>{
    await db.query("UPDATE pdf_jobs SET status=CASE WHEN attempts<3 THEN 'queued' ELSE 'failed' END,error_message='转换任务中断，请重试',updated_at=now() WHERE status='running' AND updated_at < now()-interval '10 minutes'");
    const pending=(await db.query("SELECT * FROM pdf_jobs WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];
    if(!pending) return null;
    await db.query("UPDATE pdf_jobs SET status='running',attempts=attempts+1,updated_at=now() WHERE id=$1",[pending.id]); return pending;
  });
  if(!job) return false;
  const key=randomUUID(); const target=path.join(config.storage,'objects',key);
  try {
    const bytes=await renderPdf(job.research_id,job.title,sectionLabels[job.section as Section],job.html);
    const kept=await transaction(async db=>{
      const research=await researchRepo.get(db,job.research_id,true);
      const document=research.documents[job.section as Section];
      if(!document||document.revision!==job.revision) {
        await db.query("UPDATE pdf_jobs SET status='superseded',updated_at=now() WHERE id=$1",[job.id]); return false;
      }
      const user=(await db.query('SELECT * FROM users WHERE id=$1 AND active',[job.requested_by])).rows[0];
      if(!user) throw new Error('requester inactive'); canEdit(user,research);
      const id=randomUUID(),role=`${job.section}_pdf`,name=`${research.title.slice(0,100)}-${sectionLabels[job.section as Section]}.pdf`;
      const upload=await researchRepo.event(db,user,research,'pdf',[{id,name,role}],{section:job.section,revision:job.revision});
      await db.query('UPDATE file_mappings SET is_current=false WHERE research_id=$1 AND role=$2 AND is_current',[research.id,role]);
      await mkdir(path.dirname(target),{recursive:true}); await writeFile(target,bytes,{flag:'wx'});
      await db.query('INSERT INTO file_mappings(id,research_id,factor_type_id,upload_id,uploaded_by,role,original_name,storage_key,mime_type,size_bytes,sha256) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[id,research.id,research.factor_type_id,upload,user.id,role,name,key,'application/pdf',bytes.length,createHash('sha256').update(bytes).digest('hex')]);
      document.pdf_file_id=id; document.pdf_revision=job.revision;
      await db.query('UPDATE research_records SET documents=$2,version=version+1,updated_at=now() WHERE id=$1',[research.id,JSON.stringify(research.documents)]);
      await db.query("UPDATE pdf_jobs SET status='completed',file_id=$2,error_message=NULL,updated_at=now() WHERE id=$1",[job.id,id]); return true;
    });
    if(!kept) await rm(target,{force:true});
  } catch(err) {
    await rm(target,{force:true});
    logger.error({jobId:job.id, error:err instanceof Error?err.message:'unknown'},'PDF 转换失败');
    await pool.query("UPDATE pdf_jobs SET status=CASE WHEN attempts<3 THEN 'queued' ELSE 'failed' END,error_message='PDF 转换失败，请检查插图或联系管理员后重试',updated_at=now() WHERE id=$1",[job.id]);
  }
  return true;
}
if(process.argv[1]?.replaceAll('\\','/').match(/\/worker\.(ts|js)$/)) {
  let stop=false; process.on('SIGTERM',()=>{stop=true;}); process.on('SIGINT',()=>{stop=true;});
  process.on('message',message=>{if(message==='shutdown')stop=true;});
  await pool.query('SELECT 1');
  logger.info('PDF 工作进程已启动');
  if(process.connected)process.send?.('ready');
  while(!stop) { try { if(!await processOneJob()) await new Promise(r=>setTimeout(r,1500)); } catch(err) {logger.error({error:err instanceof Error?err.message:'unknown'},'PDF 任务轮询失败');await new Promise(r=>setTimeout(r,5000));} }
  await pool.end();
  if(process.connected)process.disconnect();
}

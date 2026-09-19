import { pool, transaction } from '../db/index.js';
import { researchRepo, canEdit } from '../research/repository.js';
import { AppError } from '../shared/errors.js';
import { cleanDocument, imageIds } from './sanitize.js';
import type { Section, User } from '../../shared/contracts.js';
export async function saveDocument(user:User,id:string,section:Section,html:string,revision:number) {
  return transaction(async db=>{
    const research=await researchRepo.get(db,id,true); canEdit(user,research);
    const old=research.documents[section];
    if((old?.revision||0)!==revision) throw new AppError(409,'文档已更新，请重新打开后再编辑');
    const clean=cleanDocument(html); const ids=[...new Set(imageIds(clean))];
    if(ids.length>100) throw new AppError(400,'单篇说明最多包含 100 张图片');
    if(ids.length) {
      const count=(await db.query("SELECT id FROM file_mappings WHERE id=ANY($1::uuid[]) AND research_id=$2 AND role='editor_image'",[ids,id])).rowCount;
      if(count!==ids.length) throw new AppError(400,'文档包含不属于本研究的插图，请重新插入');
    }
    research.documents[section]={...old,html:clean,revision:revision+1};
    await db.query('UPDATE research_records SET documents=$2,version=version+1,updated_at=now() WHERE id=$1',[id,JSON.stringify(research.documents)]);
    await researchRepo.event(db,user,research,'document',[],{section,revision:revision+1});
    return research.documents[section];
  });
}
export async function enqueuePdf(user:User,id:string,section:Section) {
  return transaction(async db=>{
    const research=await researchRepo.get(db,id,true); canEdit(user,research);
    const doc=research.documents[section];
    if(!doc?.html || !doc.html.replace(/<[^>]*>/g,'').trim()&&!doc.html.includes('<img')) throw new AppError(400,'请先保存文档内容');
    const existing=(await db.query("SELECT * FROM pdf_jobs WHERE research_id=$1 AND section=$2 AND revision=$3 AND status IN ('queued','running')",[id,section,doc.revision])).rows[0];
    if(existing) return existing;
    return (await db.query('INSERT INTO pdf_jobs(research_id,requested_by,section,revision,html,title) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',[id,user.id,section,doc.revision,doc.html,research.title])).rows[0];
  });
}
export async function getJob(id:string) {
  const job=(await pool.query('SELECT id,research_id,section,status,error_message,file_id FROM pdf_jobs WHERE id=$1',[id])).rows[0];
  if(!job) throw new AppError(404,'PDF 任务不存在'); return job;
}

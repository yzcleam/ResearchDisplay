import { readFile, rename, rm, mkdir } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import { config } from '../config.js';
import { transaction } from '../db/index.js';
import { researchRepo, canEdit } from '../research/repository.js';
import { validateUploadedFile } from './rar.js';
import { parseDataset } from '../datasets/parse.js';
import type { DatasetProfile } from '../../shared/datasets.js';
import type { FileRecord, User, Section } from '../../shared/contracts.js';
import { AppError } from '../shared/errors.js';
export async function uploadFiles(user: User, researchId: string, files: Express.Multer.File[]) {
  const prepared: {id:string;role:FileRecord['role'];name:string;mime:string;key:string;size:number;hash:string;source:string;profile?:DatasetProfile}[]=[];
  const moved: string[]=[];
  try {
    if(!files.length) throw new AppError(400,'请选择文件');
    if(files.reduce((n,f)=>n+f.size,0)>100*1024*1024) throw new AppError(400,'单次上传总量不能超过 100 MB');
    const seen=new Set<string>();
    for(const file of files) {
      if(file.fieldname!=='editor_image' && seen.has(file.fieldname)) throw new AppError(400,'每个材料类别一次只能上传一个文件');
      seen.add(file.fieldname);
      const decoded=Buffer.from(file.originalname,'latin1').toString('utf8');
      const name=(decoded.includes('\uFFFD')?file.originalname:decoded).replace(/[\r\n\x00]/g,'').slice(0,250);
      const bytes=await readFile(file.path); const role=file.fieldname as FileRecord['role'];
      const mime=await validateUploadedFile(bytes,name,role);
      const profile=role==='dataset'?await parseDataset(bytes):undefined;
      prepared.push({id:randomUUID(),role,name,mime,key:randomUUID(),size:bytes.length,hash:createHash('sha256').update(bytes).digest('hex'),source:file.path,profile});
    }
    await mkdir(path.join(config.storage,'objects'),{recursive:true});
    await transaction(async db=>{
      const research=await researchRepo.get(db,researchId,true); canEdit(user,research);
      const eventId=await researchRepo.event(db,user,research,'upload',prepared.map(f=>({id:f.id,name:f.name,role:f.role})));
      for(const file of prepared) {
        if(file.role!=='editor_image') await db.query('UPDATE file_mappings SET is_current=false WHERE research_id=$1 AND role=$2 AND is_current',[researchId,file.role]);
        const target=path.join(config.storage,'objects',file.key); await rename(file.source,target); moved.push(target);
        await db.query('INSERT INTO file_mappings(id,research_id,factor_type_id,upload_id,uploaded_by,role,original_name,storage_key,mime_type,size_bytes,sha256) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',[file.id,researchId,research.factor_type_id,eventId,user.id,file.role,file.name,file.key,file.mime,file.size,file.hash]);
        if(file.profile) await db.query('INSERT INTO dataset_descriptions(dataset_file_id,profile) VALUES ($1,$2)',[file.id,JSON.stringify(file.profile)]);
        if(file.role.endsWith('_pdf')) {
          const section=file.role.replace('_pdf','') as Section;
          const document=research.documents[section];
          research.documents[section]={html:document?.html||'',revision:(document?.revision||0)+1,pdf_file_id:file.id};
        }
      }
      await db.query('UPDATE research_records SET documents=$2,version=version+1,updated_at=now() WHERE id=$1',[researchId,JSON.stringify(research.documents)]);
    });
    return prepared.map(f=>({id:f.id,role:f.role,name:f.name,url:`/api/files/${f.id}/content`}));
  } catch(err) { await Promise.all(moved.map(p=>rm(p,{force:true}))); throw err; }
  finally { await Promise.all(files.map(f=>rm(f.path,{force:true}))); }
}

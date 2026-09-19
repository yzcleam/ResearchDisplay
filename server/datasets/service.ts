import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pool, transaction, type DB } from '../db/index.js';
import { config } from '../config.js';
import { AppError } from '../shared/errors.js';
import { canEdit, researchRepo } from '../research/repository.js';
import { validateFile } from '../files/validation.js';
import { parseDataset } from './parse.js';
import type { User } from '../../shared/contracts.js';
import type { DatasetDescription, DatasetDescriptionInput, DatasetProfile } from '../../shared/datasets.js';

async function datasetFile(db: DB, id: string) {
  const file = (await db.query("SELECT * FROM file_mappings WHERE id=$1 AND role='dataset'", [id])).rows[0];
  if (!file) throw new AppError(404, '数据集不存在');
  return file;
}

export async function getDescription(id: string, db: DB = pool): Promise<DatasetDescription> {
  const file = await datasetFile(db, id);
  const row = (await db.query('SELECT * FROM dataset_descriptions WHERE dataset_file_id=$1', [id])).rows[0];
  if (!row) throw new AppError(404, '该历史数据集尚未预解析，请由成果上传者打开在线填写功能完成解析');
  const profile = row.profile as DatasetProfile;
  return {
    ...profile, dataset_file_id: id, original_name: file.original_name, is_current: file.is_current,
    revision: row.revision, saved_at: row.saved_at,
    descriptions: row.saved_at ? profile.fields.map(field => row.descriptions.find((item: { key: string }) => item.key === field.key)) : profile.fields.map(field => ({ key: field.key, panel_role: field.suggested_panel_role, chinese_name: '', explanation: '', source: '' })),
  };
}

// Legacy uploads are parsed on explicit request; new uploads are parsed in their upload transaction.
export async function ensureParsed(user: User, id: string) {
  const file = await datasetFile(pool, id);
  canEdit(user, await researchRepo.get(pool, file.research_id));
  if (!(await pool.query('SELECT 1 FROM dataset_descriptions WHERE dataset_file_id=$1', [id])).rowCount) {
    const bytes = await readFile(path.join(config.storage, 'objects', file.storage_key));
    validateFile(bytes, file.original_name, 'dataset');
    const profile = await parseDataset(bytes);
    await pool.query('INSERT INTO dataset_descriptions(dataset_file_id,profile) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, JSON.stringify(profile)]);
  }
  return getDescription(id);
}

export async function saveDescription(user: User, id: string, input: DatasetDescriptionInput) {
  return transaction(async db => {
    const file = await datasetFile(db, id);
    const research = await researchRepo.get(db, file.research_id, true); canEdit(user, research);
    const row = (await db.query('SELECT * FROM dataset_descriptions WHERE dataset_file_id=$1 FOR UPDATE', [id])).rows[0];
    if (!row) throw new AppError(400, '请先完成数据集预解析');
    if (row.revision !== input.revision) throw new AppError(409, '数据说明已被其他窗口修改，请关闭并重新打开后编辑');
    const profile = row.profile as DatasetProfile;
    const keys = new Set(profile.fields.map(field => field.key));
    if (keys.size !== input.fields.length || input.fields.some(field => !keys.has(field.key))) throw new AppError(400, '说明字段与数据集不匹配，请重新打开后填写');
    await db.query('UPDATE dataset_descriptions SET descriptions=$2,revision=revision+1,updated_by=$3,saved_at=now() WHERE dataset_file_id=$1', [id, JSON.stringify(input.fields), user.id]);
    await researchRepo.event(db, user, research, 'edit', [], { dataset_file_id: id, action: 'dataset_description', field_count: input.fields.length });
    await db.query('UPDATE research_records SET version=version+1 WHERE id=$1', [research.id]);
    return getDescription(id, db);
  });
}

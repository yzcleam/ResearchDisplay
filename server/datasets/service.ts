import type { DatasetDescriptionInput, DatasetProfile } from '../../shared/datasets.js';
import type { DB } from '../db/index.js';
import { AppError } from '../shared/errors.js';
import { insertDatasetProfile, lockDescription, updateDescription } from './repository.js';

export function registerDataset(db: DB, fileId: string, profile: DatasetProfile) {
  return insertDatasetProfile(db, fileId, profile);
}

export async function changeDescription(
  db: DB,
  fileId: string,
  userId: string,
  input: DatasetDescriptionInput,
) {
  const current = await lockDescription(db, fileId);
  if (!current) {
    throw new AppError(400, '请先完成数据集预解析');
  }
  if (current.revision !== input.revision) {
    throw new AppError(409, '数据说明已被其他窗口修改，请关闭并重新打开后编辑');
  }
  const keys = new Set(current.profile.fields.map((field) => field.key));
  if (keys.size !== input.fields.length || input.fields.some((field) => !keys.has(field.key))) {
    throw new AppError(400, '说明字段与数据集不匹配，请重新打开后填写');
  }
  await updateDescription(db, fileId, userId, input);
}

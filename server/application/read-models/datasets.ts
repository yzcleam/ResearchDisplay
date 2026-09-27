import type { DatasetDescription } from '../../../shared/datasets.js';
import type { DatasetState } from '../../datasets/index.js';
import { pool, type DB } from '../../db/index.js';
import { readDatabase } from '../../db/read.js';
import { AppError } from '../../shared/errors.js';
import { getDatasetFile } from './files.js';

export async function readDatasetState(id: string, db: DB = pool) {
  return (
    await readDatabase(db).query<DatasetState>(
      'SELECT * FROM dataset_descriptions WHERE dataset_file_id = $1',
      [id],
    )
  ).rows[0];
}

export async function getDescription(id: string, db: DB = pool): Promise<DatasetDescription> {
  const file = await getDatasetFile(id, db);
  const state = await readDatasetState(id, db);
  if (!state) {
    throw new AppError(404, '该历史数据集尚未预解析，请由成果上传者打开在线填写功能完成解析');
  }
  return {
    ...state.profile,
    dataset_file_id: id,
    original_name: file.original_name,
    is_current: file.is_current,
    revision: state.revision,
    saved_at: state.saved_at,
    descriptions: state.saved_at
      ? state.profile.fields.map((field) =>
          state.descriptions.find((item) => item.key === field.key)!,
        )
      : state.profile.fields.map((field) => ({
          key: field.key,
          panel_role: field.suggested_panel_role,
          chinese_name: '',
          explanation: '',
          source: '',
        })),
  };
}

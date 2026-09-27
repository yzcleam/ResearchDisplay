import type { DatasetDescriptionInput, DatasetProfile } from '../../shared/datasets.js';
import type { DB } from '../db/index.js';
import type { DatasetState } from './model.js';

export async function insertDatasetProfile(db: DB, id: string, profile: DatasetProfile) {
  await db.query(
    `
    INSERT INTO dataset_descriptions (dataset_file_id, profile)
    VALUES ($1, $2) ON CONFLICT DO NOTHING
  `,
    [id, JSON.stringify(profile)],
  );
}

export async function lockDescription(db: DB, id: string) {
  return (
    await db.query<DatasetState>(
      `
    SELECT * FROM dataset_descriptions WHERE dataset_file_id = $1 FOR UPDATE
  `,
      [id],
    )
  ).rows[0];
}

export async function updateDescription(
  db: DB,
  id: string,
  userId: string,
  input: DatasetDescriptionInput,
) {
  await db.query(
    `
    UPDATE dataset_descriptions
    SET descriptions = $2, revision = revision + 1, updated_by = $3, saved_at = now()
    WHERE dataset_file_id = $1
  `,
    [id, JSON.stringify(input.fields), userId],
  );
}

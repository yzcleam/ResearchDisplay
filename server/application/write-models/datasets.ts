import type { User } from '../../../shared/contracts.js';
import type { DatasetDescriptionInput } from '../../../shared/datasets.js';
import { changeDescription, parseDataset, registerDataset } from '../../datasets/index.js';
import { transaction } from '../../db/index.js';
import { readStoredFile, validateFile } from '../../files/index.js';
import {
  advanceVersion,
  assertCanEditResearch,
  lockEditableResearch,
} from '../../research/index.js';
import { getDescription, readDatasetState } from '../read-models/datasets.js';
import { getDatasetFile } from '../read-models/files.js';
import { readResearchRecord } from '../read-models/research.js';
import { recordActivity } from './activity.js';

export async function ensureParsed(user: User, fileId: string) {
  const file = await getDatasetFile(fileId);
  assertCanEditResearch(user, await readResearchRecord(file.research_id));
  if (!(await readDatasetState(fileId))) {
    const bytes = await readStoredFile(file.storage_key);
    validateFile(bytes, file.original_name, 'dataset');
    const profile = await parseDataset(bytes);
    await transaction(async (db) => {
      await lockEditableResearch(db, user, file.research_id);
      await registerDataset(db, fileId, profile);
    });
  }
  return getDescription(fileId);
}

export function saveDescription(user: User, fileId: string, input: DatasetDescriptionInput) {
  return transaction(async (db) => {
    const file = await getDatasetFile(fileId, db);
    const research = await lockEditableResearch(db, user, file.research_id);
    await changeDescription(db, fileId, user.id, input);
    await recordActivity(db, {
      actor: user,
      research,
      action: 'edit',
      details: {
        dataset_file_id: fileId,
        action: 'dataset_description',
        field_count: input.fields.length,
      },
    });
    await advanceVersion(db, research.id);
    return getDescription(fileId, db);
  });
}

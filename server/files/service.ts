import type { DB } from '../db/index.js';
import {
  insertFileMapping,
  markFileDeleted,
  retireCurrentFile,
  setFileSharing,
  type NewFileMapping,
} from './repository.js';

export async function registerFile(db: DB, file: NewFileMapping) {
  if (file.role !== 'editor_image' && file.role !== 'other') {
    await retireCurrentFile(db, file.researchId, file.role);
  }
  await insertFileMapping(db, file);
}
export { markFileDeleted, setFileSharing };

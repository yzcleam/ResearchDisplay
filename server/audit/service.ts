import type { UploadEvent, User } from '../../shared/contracts.js';
import type { DB } from '../db/index.js';
import { insertActivity } from './repository.js';

export type ActivityInput = {
  actor: Pick<User, 'id' | 'real_name'>;
  research: { id: string; title: string };
  action: 'create' | 'edit' | 'upload' | 'document' | 'pdf';
  files?: UploadEvent['files'];
  details?: Record<string, unknown>;
};

export function appendActivity(db: DB, input: ActivityInput) {
  return insertActivity(db, input);
}

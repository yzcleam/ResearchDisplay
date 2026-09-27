import type { DocumentData, ResearchInput, Section, User } from '../../shared/contracts.js';
import type { DB } from '../db/index.js';
import { assertCanEditResearch, assertCurrentVersion, type ResearchState } from './model.js';
import { researchRepo } from './repository.js';

export async function lockEditableResearch(db: DB, user: User, id: string) {
  const research = await researchRepo.get(db, id, true);
  assertCanEditResearch(user, research);
  return research;
}

export async function createRecord(db: DB, user: User, input: ResearchInput) {
  const id = await researchRepo.create(db, user.id, input);
  return researchRepo.get(db, id);
}

export async function updateRecord(
  db: DB,
  current: ResearchState,
  input: ResearchInput & { version: number },
) {
  assertCurrentVersion(current, input.version);
  await researchRepo.update(db, current.id, input);
  return researchRepo.get(db, current.id);
}

/** documents 仍存储在研究记录中，由研究模块作为唯一写入者。 */
export function saveDocuments(
  db: DB,
  id: string,
  documents: Partial<Record<Section, DocumentData>>,
) {
  return researchRepo.saveDocuments(db, { id, documents });
}

export function recordLatestActivity(db: DB, researchId: string, activityId: string) {
  return researchRepo.recordLatestActivity(db, researchId, activityId);
}

export function advanceVersion(db: DB, researchId: string) {
  return researchRepo.advanceVersion(db, researchId);
}

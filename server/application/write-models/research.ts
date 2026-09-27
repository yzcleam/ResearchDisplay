import type { ResearchInput, User } from '../../../shared/contracts.js';
import { transaction } from '../../db/index.js';
import { assertAvailableFactor } from '../../factors/index.js';
import {
  assertCurrentVersion,
  createRecord,
  lockEditableResearch,
  updateRecord,
} from '../../research/index.js';
import { getResearch } from '../read-models/research.js';
import { recordActivity } from './activity.js';

export function createResearch(user: User, input: ResearchInput) {
  return transaction(async (db) => {
    await assertAvailableFactor(db, input.factor_type_id);
    const research = await createRecord(db, user, input);
    await recordActivity(db, { actor: user, research, action: 'create' });
    return getResearch(research.id, db);
  });
}

export function updateResearch(user: User, id: string, input: ResearchInput & { version: number }) {
  return transaction(async (db) => {
    const current = await lockEditableResearch(db, user, id);
    // 先检查版本，保持过期修改的冲突响应，不让分类检查掩盖并发冲突。
    assertCurrentVersion(current, input.version);
    await assertAvailableFactor(db, input.factor_type_id, current.factor_type_id);
    const updated = await updateRecord(db, current, input);
    await recordActivity(db, {
      actor: user,
      research: updated,
      action: 'edit',
      details: { previous_version: current.version },
    });
    return getResearch(id, db);
  });
}

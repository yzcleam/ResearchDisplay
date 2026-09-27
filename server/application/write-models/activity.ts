import { appendActivity, type ActivityInput } from '../../audit/index.js';
import type { DB } from '../../db/index.js';
import { recordLatestActivity } from '../../research/index.js';

/** 审计记录和研究的最新操作指针使用调用者的同一个事务。 */
export async function recordActivity(db: DB, input: ActivityInput) {
  const id = await appendActivity(db, input);
  await recordLatestActivity(db, input.research.id, id);
  return id;
}

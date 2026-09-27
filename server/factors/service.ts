import type { DB } from '../db/index.js';
import { AppError } from '../shared/errors.js';
import { insertFactor, readFactorStatus, updateFactor } from './repository.js';

export async function assertAvailableFactor(db: DB, id: string, previousId?: string) {
  const factor = await readFactorStatus(db, id);
  if (!factor || (!factor.active && id !== previousId)) {
    throw new AppError(400, '请选择启用的要素类型');
  }
}

export function createFactor(db: DB, name: string) {
  return insertFactor(db, name);
}

export async function changeFactor(db: DB, id: string, input: { name: string; active: boolean }) {
  const factor = await updateFactor(db, id, input);
  if (!factor) {
    throw new AppError(404, '要素类型不存在');
  }
  return factor;
}

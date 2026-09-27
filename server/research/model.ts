import type { Research, User } from '../../shared/contracts.js';
import { AppError } from '../shared/errors.js';

/** 写模型只携带研究自身的数据；姓名、要素名称和附件属于查询投影。 */
export type ResearchState = Omit<Research, 'owner_name' | 'factor_name' | 'files' | 'file_count'>;

export function assertCurrentVersion(current: Pick<ResearchState, 'version'>, version: number) {
  if (current.version !== version) {
    throw new AppError(409, '资料已被其他操作修改，请重新打开后再保存');
  }
}

export function assertCanEditResearch(user: User, research: Pick<ResearchState, 'owner_id'>) {
  if (user.role !== 'admin' && user.id !== research.owner_id) {
    throw new AppError(403, '只能修改自己的研究成果');
  }
}

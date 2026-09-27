import type { User } from '../../shared/contracts.js';
import { AppError } from '../shared/errors.js';

export function assertAdministrator(user: Pick<User, 'role'>) {
  if (user.role !== 'admin') {
    throw new AppError(403, '此操作需要管理员权限');
  }
}

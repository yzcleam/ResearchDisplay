import type { User } from '../../../shared/contracts.js';
import { assertAdministrator } from '../../auth/index.js';
import { transaction } from '../../db/index.js';
import { changeFactor, createFactor } from '../../factors/index.js';

export function addFactor(user: User, name: string) {
  assertAdministrator(user);
  return transaction((db) => createFactor(db, name));
}

export function editFactor(user: User, id: string, input: { name: string; active: boolean }) {
  assertAdministrator(user);
  return transaction((db) => changeFactor(db, id, input));
}

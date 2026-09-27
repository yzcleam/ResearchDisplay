import type { SharingInput, User } from '../../../shared/contracts.js';
import {
  prepareSpaceUploads,
  registerFile,
  setFileSharing,
  markFileDeleted,
  withFileBatch,
  type UploadSource,
} from '../../files/index.js';
import { transaction } from '../../db/index.js';
import { lockEditableResearch } from '../../research/index.js';
import { AppError } from '../../shared/errors.js';
import { activeUser } from '../read-models/users.js';
import { getSpaceFile } from '../read-models/files.js';
import { recordActivity } from './activity.js';

async function validateRecipients(db: Parameters<typeof activeUser>[1], sharing: SharingInput) {
  const ids = sharing.user_ids;
  if (new Set(ids).size !== ids.length) throw new AppError(400, '指定用户不能重复');
  for (const id of ids) {
    if (!(await activeUser(id, db))) throw new AppError(400, '指定用户不存在或已停用');
  }
}

export function uploadSpaceFiles(
  user: User,
  researchId: string,
  sources: UploadSource[],
  sharing: SharingInput,
) {
  return withFileBatch(
    sources.map((source) => source.path),
    async (batch) => {
      const prepared = await prepareSpaceUploads(sources);
      await transaction(async (db) => {
        const research = await lockEditableResearch(db, user, researchId);
        await validateRecipients(db, sharing);
        const uploadId = await recordActivity(db, {
          actor: user,
          research,
          action: 'upload',
          files: prepared.map((file) => ({
            id: file.id,
            name: file.originalName,
            role: file.role,
          })),
        });
        for (const file of prepared) {
          await batch.moveUpload(file);
          await registerFile(db, {
            id: file.id,
            researchId,
            factorTypeId: research.factor_type_id,
            uploadId,
            uploadedBy: user.id,
            role: 'other',
            originalName: file.originalName,
            storageKey: file.storageKey,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            sha256: file.sha256,
            shareScope: sharing.scope,
          });
          if (sharing.scope === 'specific') {
            await setFileSharing(db, file.id, sharing.scope, sharing.user_ids);
          }
        }
      });
      return prepared.map((file) => ({ id: file.id, name: file.originalName }));
    },
  );
}

export async function changeFileSharing(user: User, id: string, sharing: SharingInput) {
  await transaction(async (db) => {
    const file = await getSpaceFile(id, user, db);
    if (!file.can_share) throw new AppError(403, '无权修改此文件的共享权限');
    await validateRecipients(db, sharing);
    await setFileSharing(db, id, sharing.scope, sharing.user_ids);
  });
}

export async function deleteSpaceFile(user: User, id: string) {
  await transaction(async (db) => {
    const file = await getSpaceFile(id, user, db);
    if (!file.can_delete) throw new AppError(403, '无权删除此文件');
    await markFileDeleted(db, id);
  });
}

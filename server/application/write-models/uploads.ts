import type { Section, User } from '../../../shared/contracts.js';
import { parseDataset, registerDataset } from '../../datasets/index.js';
import { transaction } from '../../db/index.js';
import { uploadedPdfDocument } from '../../documents/index.js';
import {
  prepareUploads,
  registerFile,
  withFileBatch,
  type UploadSource,
} from '../../files/index.js';
import {
  assertCanEditResearch,
  lockEditableResearch,
  saveDocuments,
} from '../../research/index.js';
import { readResearchRecord } from '../read-models/research.js';
import { recordActivity } from './activity.js';

export async function assertUploadAllowed(user: User, researchId: string) {
  assertCanEditResearch(user, await readResearchRecord(researchId));
}

/** 跨模块写模型：所有数据库写入共用一个事务，磁盘写入由 FileBatch 补偿。 */
export function uploadFiles(user: User, researchId: string, sources: UploadSource[]) {
  return withFileBatch(
    sources.map((file) => file.path),
    async (batch) => {
      const prepared = await prepareUploads(sources);
      const uploads = await Promise.all(
        prepared.map(async (file) => ({
          file,
          profile: file.role === 'dataset' ? await parseDataset(file.bytes) : undefined,
        })),
      );

      await transaction(async (db) => {
        const research = await lockEditableResearch(db, user, researchId);
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
        const documents = { ...research.documents };
        for (const { file, profile } of uploads) {
          await batch.moveUpload(file);
          await registerFile(db, {
            id: file.id,
            researchId,
            factorTypeId: research.factor_type_id,
            uploadId,
            uploadedBy: user.id,
            role: file.role,
            originalName: file.originalName,
            storageKey: file.storageKey,
            mimeType: file.mimeType,
            sizeBytes: file.sizeBytes,
            sha256: file.sha256,
          });
          if (profile) {
            await registerDataset(db, file.id, profile);
          }
          if (file.role.endsWith('_pdf')) {
            const section = file.role.replace('_pdf', '') as Section;
            documents[section] = uploadedPdfDocument(documents[section], file.id);
          }
        }
        await saveDocuments(db, researchId, documents);
      });
      return prepared.map((file) => ({
        id: file.id,
        role: file.role,
        name: file.originalName,
        url: `/api/files/${file.id}/content`,
      }));
    },
  );
}

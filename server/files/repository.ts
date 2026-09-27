import type { FileRecord, ShareScope } from '../../shared/contracts.js';
import type { DB } from '../db/index.js';

export type NewFileMapping = {
  id: string;
  researchId: string;
  factorTypeId: string;
  uploadId: string;
  uploadedBy: string;
  role: FileRecord['role'];
  originalName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  shareScope?: ShareScope;
};

export async function retireCurrentFile(db: DB, researchId: string, role: FileRecord['role']) {
  await db.query(
    `
    UPDATE file_mappings
    SET is_current = false
    WHERE research_id = $1 AND role = $2 AND is_current AND deleted_at IS NULL
  `,
    [researchId, role],
  );
}

export async function insertFileMapping(db: DB, file: NewFileMapping) {
  await db.query(
    `
    INSERT INTO file_mappings (
      id, research_id, factor_type_id, upload_id, uploaded_by,
      role, original_name, storage_key, mime_type, size_bytes, sha256, share_scope
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  `,
    [
      file.id,
      file.researchId,
      file.factorTypeId,
      file.uploadId,
      file.uploadedBy,
      file.role,
      file.originalName,
      file.storageKey,
      file.mimeType,
      file.sizeBytes,
      file.sha256,
      file.shareScope ?? (file.role === 'dataset' ? 'private' : 'global'),
    ],
  );
}

export async function setFileSharing(db: DB, id: string, scope: ShareScope, userIds: string[]) {
  await db.query('UPDATE file_mappings SET share_scope=$2 WHERE id=$1', [id, scope]);
  await db.query('DELETE FROM file_share_recipients WHERE file_id=$1', [id]);
  for (const userId of userIds) {
    await db.query('INSERT INTO file_share_recipients(file_id,user_id) VALUES ($1,$2)', [
      id,
      userId,
    ]);
  }
}

export async function markFileDeleted(db: DB, id: string) {
  await db.query('UPDATE file_mappings SET deleted_at=now(), is_current=false WHERE id=$1', [id]);
}

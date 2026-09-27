import { pool, type DB } from '../../db/index.js';
import { readDatabase } from '../../db/read.js';
import { storedFilePath, type StoredFile } from '../../files/index.js';
import type { SpaceFile, SpaceFolder, SpaceProject, User } from '../../../shared/contracts.js';
import { AppError } from '../../shared/errors.js';

export async function getStoredFile(id: string, db: DB = pool): Promise<StoredFile> {
  const result = await readDatabase(db).query<StoredFile>(
    'SELECT * FROM file_mappings WHERE id = $1 AND deleted_at IS NULL',
    [id],
  );
  if (!result.rows[0]) {
    throw new AppError(404, '文件不存在');
  }
  return result.rows[0];
}

export async function getDatasetFile(id: string, db: DB = pool) {
  const result = await readDatabase(db).query<StoredFile>(
    "SELECT * FROM file_mappings WHERE id = $1 AND role = 'dataset' AND deleted_at IS NULL",
    [id],
  );
  if (!result.rows[0]) {
    throw new AppError(404, '数据集不存在');
  }
  return result.rows[0];
}

export async function readEditorImages(researchId: string, ids: string[], db: DB = pool) {
  const result = await readDatabase(db).query<StoredFile>(
    `
    SELECT * FROM file_mappings
    WHERE id = ANY($1::uuid[]) AND research_id = $2 AND role = 'editor_image' AND deleted_at IS NULL
  `,
    [ids, researchId],
  );
  return result.rows;
}

type SpaceRow = SpaceFile & { owner_id: string; storage_key: string };
function folderFor(role: string): SpaceFolder {
  if (role === 'manuscript') return 'manuscript';
  if (role === 'dataset') return 'dataset';
  return role === 'other' ? 'other' : 'documents';
}
function projectFile(row: SpaceRow, user: User): SpaceRow {
  const owner = row.owner_id === user.id;
  const uploader = row.uploaded_by === user.id;
  return {
    ...row,
    folder: folderFor(row.role),
    can_download:
      user.role !== 'member' ||
      owner ||
      row.share_scope === 'global' ||
      (row.share_scope === 'specific' && row.shared_with.includes(user.id)),
    can_delete: user.role === 'admin' || (user.role === 'teacher' ? uploader : owner),
    can_share: user.role === 'admin' || owner || (user.role === 'teacher' && uploader),
  };
}
export async function listSpaceProjects(): Promise<SpaceProject[]> {
  const result = await readDatabase(pool).query<SpaceProject>(`
    SELECT r.id,r.title,r.owner_id,u.real_name AS owner_name,
      count(f.id)::int AS file_count
    FROM research_records r
    JOIN users u ON u.id=r.owner_id
    LEFT JOIN file_mappings f ON f.research_id=r.id AND f.is_current AND f.deleted_at IS NULL
    GROUP BY r.id,u.real_name ORDER BY r.title,r.id
  `);
  return result.rows;
}
export async function listSpaceFiles(researchId: string, user: User): Promise<SpaceFile[]> {
  const rows = await readDatabase(pool).query<SpaceRow>(
    `
    SELECT f.id, f.research_id, f.factor_type_id, f.uploaded_by, f.role, f.original_name,
      f.mime_type, f.size_bytes, f.is_current, f.created_at, f.share_scope, f.storage_key,
      r.owner_id, u.real_name AS uploader_name,
      COALESCE((SELECT array_agg(s.user_id) FROM file_share_recipients s WHERE s.file_id=f.id), ARRAY[]::uuid[]) AS shared_with
    FROM file_mappings f
    JOIN research_records r ON r.id=f.research_id
    JOIN users u ON u.id=f.uploaded_by
    WHERE f.research_id=$1 AND f.is_current AND f.deleted_at IS NULL
    ORDER BY f.created_at DESC,f.id`,
    [researchId],
  );
  if (!rows.rows.length) {
    const project = await readDatabase(pool).query('SELECT 1 FROM research_records WHERE id=$1', [
      researchId,
    ]);
    if (!project.rowCount) throw new AppError(404, '科研项目不存在');
  }
  return rows.rows.map((row) => {
    const { storage_key: _storageKey, owner_id: _ownerId, ...file } = projectFile(row, user);
    return file;
  });
}
export async function getSpaceFile(id: string, user: User, db: DB = pool): Promise<SpaceRow> {
  const result = await readDatabase(db).query<SpaceRow>(
    `
    SELECT f.id, f.research_id, f.factor_type_id, f.uploaded_by, f.role, f.original_name,
      f.mime_type, f.size_bytes, f.is_current, f.created_at, f.share_scope, f.storage_key,
      r.owner_id, u.real_name AS uploader_name,
      COALESCE((SELECT array_agg(s.user_id) FROM file_share_recipients s WHERE s.file_id=f.id), ARRAY[]::uuid[]) AS shared_with
    FROM file_mappings f
    JOIN research_records r ON r.id=f.research_id
    JOIN users u ON u.id=f.uploaded_by
    WHERE f.id=$1 AND f.deleted_at IS NULL`,
    [id],
  );
  if (!result.rows[0]) throw new AppError(404, '文件不存在');
  return projectFile(result.rows[0], user);
}
export async function fileContent(id: string, user: User) {
  const file = await getSpaceFile(id, user);
  if (!file.can_download) throw new AppError(403, '无权下载此文件');
  return {
    originalName: file.original_name,
    mimeType: file.mime_type,
    absolutePath: storedFilePath(file.storage_key),
  };
}

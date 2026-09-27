import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { FileRecord } from '../../shared/contracts.js';
import { fileRoles } from '../../shared/contracts.js';
import { AppError } from '../shared/errors.js';
import type { UploadSource } from './model.js';
import { validateUploadedFile } from './rar.js';

const MAX_UPLOAD_BATCH_BYTES = 100 * 1024 * 1024;

export type PreparedUpload = {
  id: string;
  role: FileRecord['role'];
  originalName: string;
  mimeType: string;
  storageKey: string;
  sizeBytes: number;
  sha256: string;
  temporaryPath: string;
  bytes: Buffer;
};

export function normalizeUploadName(originalName: string) {
  // multipart 的文件名可能按 latin1 解码；无法还原 UTF-8 时保留收到的名称。
  const decodedName = Buffer.from(originalName, 'latin1').toString('utf8');
  const name = decodedName.includes('\uFFFD') ? originalName : decodedName;
  return name.replace(/[\r\n\x00]/g, '').slice(0, 250);
}

/** 整批文件验证完成后才能开始数据库事务，避免部分上传成功。 */
export async function prepareUploads(files: UploadSource[]): Promise<PreparedUpload[]> {
  if (files.length === 0) {
    throw new AppError(400, '请选择文件');
  }
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > MAX_UPLOAD_BATCH_BYTES) {
    throw new AppError(400, '单次上传总量不能超过 100 MB');
  }

  const seenRoles = new Set<string>();
  const prepared: PreparedUpload[] = [];
  for (const file of files) {
    if (file.fieldname !== 'editor_image' && seenRoles.has(file.fieldname)) {
      throw new AppError(400, '每个材料类别一次只能上传一个文件');
    }
    seenRoles.add(file.fieldname);

    const originalName = normalizeUploadName(file.originalname);
    const bytes = await readFile(file.path);
    if (!fileRoles.includes(file.fieldname as FileRecord['role'])) {
      throw new AppError(400, '不支持的材料类别');
    }
    const role = file.fieldname as FileRecord['role'];
    const mimeType = await validateUploadedFile(bytes, originalName, role);

    prepared.push({
      id: randomUUID(),
      role,
      originalName,
      mimeType,
      storageKey: randomUUID(),
      sizeBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      temporaryPath: file.path,
      bytes,
    });
  }
  return prepared;
}

/** 共享空间接收任意文件格式；按二进制附件下载，不信任客户端 MIME。 */
export async function prepareSpaceUploads(files: UploadSource[]): Promise<PreparedUpload[]> {
  if (!files.length) throw new AppError(400, '请选择文件');
  if (files.reduce((total, file) => total + file.size, 0) > MAX_UPLOAD_BATCH_BYTES) {
    throw new AppError(400, '单次上传总量不能超过 100 MB');
  }
  const prepared: PreparedUpload[] = [];
  for (const file of files) {
    const originalName = normalizeUploadName(file.originalname);
    if (!originalName || originalName === '.' || originalName === '..') {
      throw new AppError(400, '文件名无效');
    }
    const bytes = await readFile(file.path);
    if (!bytes.length) throw new AppError(400, '不能上传空文件');
    prepared.push({
      id: randomUUID(),
      role: 'other',
      originalName,
      mimeType: 'application/octet-stream',
      storageKey: randomUUID(),
      sizeBytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      temporaryPath: file.path,
      bytes,
    });
  }
  return prepared;
}

import type { FileRecord } from '../../shared/contracts.js';

/** HTTP 适配器将 multipart 文件转换为此输入；文件模块不依赖 Express。 */
export type UploadSource = {
  fieldname: string;
  originalname: string;
  path: string;
  size: number;
};

export type StoredFile = FileRecord & { storage_key: string; sha256: string };

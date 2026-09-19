import { createExtractorFromData } from 'node-unrar-js';
import path from 'node:path';
import { AppError } from '../shared/errors.js';
import { imageMime, validateFile } from './validation.js';
import type { FileRecord } from '../../shared/contracts.js';

export async function validateUploadedFile(bytes: Buffer, name: string, role: FileRecord['role']) {
  if (role !== 'image_pack' || path.extname(name).toLowerCase() !== '.rar') return validateFile(bytes, name, role);
  if (!bytes.subarray(0, 6).equals(Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07]))) throw new AppError(400, '请上传有效的 RAR 图片包');
  try {
    const extractor = await createExtractorFromData({ data: Uint8Array.from(bytes).buffer });
    const list = extractor.getFileList();
    let count = 0, total = 0, images = 0, problem = '';
    // Fully consume the native-backed iterators so UnRAR releases its archive handles.
    for (const header of list.fileHeaders) {
      count++; total += header.unpSize;
      const normalized = header.name.replaceAll('\\', '/');
      if (/^\/|^[A-Za-z]:|(^|\/)\.\.(\/|$)|\x00/.test(normalized)) problem = '压缩包包含不安全的路径';
      if (header.flags.encrypted || header.unpSize > 50 * 1024 * 1024 || total > 150 * 1024 * 1024) problem = '压缩包过大或含加密文件';
      if (!header.flags.directory) {
        images++;
        if (!/\.(png|jpe?g|webp)$/i.test(header.name)) problem = '图片包只能包含 PNG、JPG、WebP 图片';
      }
    }
    if (list.arcHeader.flags.volume || list.arcHeader.flags.headerEncrypted) throw new AppError(400, '图片包不支持分卷或加密的 RAR');
    if (!count || count > 3000) throw new AppError(400, '压缩包文件数量不符合要求');
    if (problem) throw new AppError(400, problem);
    if (!images) throw new AppError(400, '图片包中没有图片');
    for (const file of extractor.extract().files) {
      if (!file.fileHeader.flags.directory && (!file.extraction || !imageMime(Buffer.from(file.extraction)))) problem = '图片包中含有无效的图片文件';
    }
    if (problem) throw new AppError(400, problem);
    return 'application/vnd.rar';
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, 'RAR 图片包损坏、已加密或为分卷文件，请上传完整且未加密的图片包');
  }
}

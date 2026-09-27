import AdmZip from 'adm-zip';
import path from 'node:path';
import type { FileRecord } from '../../shared/contracts.js';
import { AppError } from '../shared/errors.js';
export function imageMime(bytes: Buffer) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return 'image/png';
  }
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return 'image/jpeg';
  }
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}
export function validateFile(bytes: Buffer, name: string, role: FileRecord['role']) {
  const ext = path.extname(name).toLowerCase();
  if (!bytes.length) {
    throw new AppError(400, '不能上传空文件');
  }
  if (role === 'other') {
    return 'application/octet-stream';
  }
  if (role === 'editor_image') {
    const mime = imageMime(bytes);
    if (!mime || !['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
      throw new AppError(400, '插图仅支持 PNG、JPG、WebP');
    }
    if (bytes.length > 8 * 1024 * 1024) {
      throw new AppError(400, '单张插图不能超过 8 MB');
    }
    return mime;
  }
  if (role === 'manuscript' || role.endsWith('_pdf')) {
    if (
      ext !== '.pdf' ||
      bytes.toString('ascii', 0, 5) !== '%PDF-' ||
      !bytes.subarray(-2048).includes(Buffer.from('%%EOF'))
    ) {
      throw new AppError(400, '请上传有效的 PDF 文件');
    }
    return 'application/pdf';
  }
  const isXlsx = role === 'dataset' || role === 'indicators';
  if (ext !== (isXlsx ? '.xlsx' : '.zip') || bytes[0] !== 80 || bytes[1] !== 75) {
    throw new AppError(
      400,
      isXlsx ? '数据文件必须为 XLSX 格式' : '研究图片包必须为 ZIP 或 RAR 格式',
    );
  }
  try {
    const zip = new AdmZip(bytes);
    const entries = zip.getEntries();
    if (entries.length > 3000 || entries.length === 0) {
      throw new AppError(400, '压缩包文件数量不符合要求');
    }
    let total = 0;
    let images = 0;
    for (const entry of entries) {
      if (/(^\/|^[A-Za-z]:|\\|(^|\/)\.\.\/)/.test(entry.entryName)) {
        throw new AppError(400, '压缩包包含不安全的路径');
      }
      total += entry.header.size;
      if (
        total > 150 * 1024 * 1024 ||
        entry.header.size > 50 * 1024 * 1024 ||
        entry.header.flags & 1
      ) {
        throw new AppError(400, '压缩包过大或含加密文件');
      }
      if (!isXlsx && !entry.isDirectory) {
        if (!/\.(png|jpe?g|webp)$/i.test(entry.entryName) || !imageMime(entry.getData())) {
          throw new AppError(400, '图片包只能包含 PNG、JPG、WebP 图片');
        }
        images++;
      }
    }
    if (isXlsx) {
      if (
        !zip.getEntry('[Content_Types].xml') ||
        !zip.getEntry('xl/workbook.xml') ||
        !entries.some((e) => /^xl\/worksheets\/sheet[^/]*\.xml$/.test(e.entryName))
      ) {
        throw new AppError(400, '文件不是有效的 XLSX 工作簿');
      }
      if (entries.some((e) => /vbaProject|embeddings\//i.test(e.entryName))) {
        throw new AppError(400, '工作簿不能含宏或嵌入式对象');
      }
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    if (!images) {
      throw new AppError(400, '图片包中没有图片');
    }
    return 'application/zip';
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    throw new AppError(400, '压缩包损坏或无法读取');
  }
}

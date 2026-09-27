import type { DocumentData, PdfJob } from '../../shared/contracts.js';
import { AppError } from '../shared/errors.js';
import { cleanDocument, imageIds } from './sanitize.js';

export type QueuedPdfJob = PdfJob & {
  research_id: string;
  requested_by: string;
  revision: number;
  html: string;
  title: string;
  attempts: number;
};

export function prepareDocument(
  previous: DocumentData | undefined,
  html: string,
  revision: number,
) {
  if ((previous?.revision || 0) !== revision) {
    throw new AppError(409, '文档已更新，请重新打开后再编辑');
  }
  const sanitizedHtml = cleanDocument(html);
  const referencedImageIds = [...new Set(imageIds(sanitizedHtml))];
  if (referencedImageIds.length > 100) {
    throw new AppError(400, '单篇说明最多包含 100 张图片');
  }
  return {
    document: { ...previous, html: sanitizedHtml, revision: revision + 1 },
    referencedImageIds,
  };
}

/** 外部 PDF 无法证明与当前正文一致，因此不设置 pdf_revision。 */
export function uploadedPdfDocument(
  previous: DocumentData | undefined,
  fileId: string,
): DocumentData {
  return {
    html: previous?.html || '',
    revision: (previous?.revision || 0) + 1,
    pdf_file_id: fileId,
  };
}

export function assertDocumentReady(
  document: DocumentData | undefined,
): asserts document is DocumentData {
  if (
    !document?.html ||
    (!document.html.replace(/<[^>]*>/g, '').trim() && !document.html.includes('<img'))
  ) {
    throw new AppError(400, '请先保存文档内容');
  }
}

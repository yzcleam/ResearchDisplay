import type { Section, User } from '../../../shared/contracts.js';
import { transaction } from '../../db/index.js';
import { imageIds, prepareDocument, queuePdf, renderDocumentPdf } from '../../documents/index.js';
import { readStoredFile } from '../../files/index.js';
import { lockEditableResearch, saveDocuments } from '../../research/index.js';
import { AppError } from '../../shared/errors.js';
import { readEditorImages } from '../read-models/files.js';
import { recordActivity } from './activity.js';

export function saveDocument(
  user: User,
  id: string,
  section: Section,
  html: string,
  revision: number,
) {
  return transaction(async (db) => {
    const research = await lockEditableResearch(db, user, id);
    const prepared = prepareDocument(research.documents[section], html, revision);
    const images = await readEditorImages(id, prepared.referencedImageIds, db);
    if (images.length !== prepared.referencedImageIds.length) {
      throw new AppError(400, '文档包含不属于本研究的插图，请重新插入');
    }
    await saveDocuments(db, id, { ...research.documents, [section]: prepared.document });
    await recordActivity(db, {
      actor: user,
      research,
      action: 'document',
      details: { section, revision: revision + 1 },
    });
    return prepared.document;
  });
}

export function enqueuePdf(user: User, id: string, section: Section) {
  return transaction(async (db) => {
    const research = await lockEditableResearch(db, user, id);
    return queuePdf(db, {
      researchId: id,
      requestedBy: user.id,
      title: research.title,
      section,
      document: research.documents[section],
    });
  });
}

/** 先通过读模型取授权图片，再把纯内容交给渲染器；渲染器不读数据库和存储目录。 */
export async function renderPdf(researchId: string, title: string, label: string, html: string) {
  const ids = [...new Set(imageIds(html))];
  const files = await readEditorImages(researchId, ids);
  if (files.length !== ids.length) {
    throw new AppError(400, '文档插图不存在');
  }
  const images = await Promise.all(
    files.map(async (file) => ({
      id: file.id,
      mimeType: file.mime_type,
      bytes: await readStoredFile(file.storage_key),
    })),
  );
  return renderDocumentPdf(title, label, html, images);
}

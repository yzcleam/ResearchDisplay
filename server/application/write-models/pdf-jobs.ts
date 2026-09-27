import { createHash, randomUUID } from 'node:crypto';
import { sectionLabels } from '../../../shared/contracts.js';
import { transaction } from '../../db/index.js';
import { claimPdfJob, completePdfJob, failPdfJob, supersedePdfJob } from '../../documents/index.js';
import { registerFile, withFileBatch } from '../../files/index.js';
import { lockEditableResearch, saveDocuments } from '../../research/index.js';
import { AppError } from '../../shared/errors.js';
import { logger } from '../../shared/logger.js';
import { activeUser } from '../read-models/users.js';
import { recordActivity } from './activity.js';
import { renderPdf } from './documents.js';

export async function processOneJob() {
  const job = await transaction((db) => claimPdfJob(db));
  if (!job) {
    return false;
  }
  try {
    const pdfBytes = await renderPdf(
      job.research_id,
      job.title,
      sectionLabels[job.section],
      job.html,
    );
    await withFileBatch([], async (batch) => {
      await transaction(async (db) => {
        const requester = await activeUser(job.requested_by, db);
        if (!requester) {
          throw new AppError(403, '任务发起人已停用');
        }
        const research = await lockEditableResearch(db, requester, job.research_id);
        const document = research.documents[job.section];
        if (!document || document.revision !== job.revision) {
          await supersedePdfJob(db, job.id);
          return;
        }
        const id = randomUUID();
        const storageKey = randomUUID();
        const role = `${job.section}_pdf` as const;
        const originalName = `${research.title.slice(0, 100)}-${sectionLabels[job.section]}.pdf`;
        const uploadId = await recordActivity(db, {
          actor: requester,
          research,
          action: 'pdf',
          files: [{ id, name: originalName, role }],
          details: { section: job.section, revision: job.revision },
        });
        await batch.writeGenerated(storageKey, pdfBytes);
        await registerFile(db, {
          id,
          researchId: research.id,
          factorTypeId: research.factor_type_id,
          uploadId,
          uploadedBy: requester.id,
          role,
          originalName,
          storageKey,
          mimeType: 'application/pdf',
          sizeBytes: pdfBytes.length,
          sha256: createHash('sha256').update(pdfBytes).digest('hex'),
        });
        await saveDocuments(db, research.id, {
          ...research.documents,
          [job.section]: { ...document, pdf_file_id: id, pdf_revision: job.revision },
        });
        await completePdfJob(db, job.id, id);
      });
    });
  } catch (error) {
    logger.error(
      { jobId: job.id, error: error instanceof Error ? error.message : 'unknown' },
      'PDF 转换失败',
    );
    await transaction((db) => failPdfJob(db, job.id));
  }
  return true;
}

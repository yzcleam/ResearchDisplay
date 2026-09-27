import type { DocumentData, Section } from '../../shared/contracts.js';
import type { DB } from '../db/index.js';
import * as jobs from './job-repository.js';
import { assertDocumentReady } from './model.js';

export async function queuePdf(
  db: DB,
  input: {
    researchId: string;
    requestedBy: string;
    title: string;
    section: Section;
    document: DocumentData | undefined;
  },
) {
  assertDocumentReady(input.document);
  const existing = await jobs.findPendingJob(
    db,
    input.researchId,
    input.section,
    input.document.revision,
  );
  return existing || jobs.insertJob(db, { ...input, document: input.document });
}

export function claimPdfJob(db: DB) {
  return jobs.claimNextPdfJob(db);
}
export function supersedePdfJob(db: DB, id: string) {
  return jobs.markPdfSuperseded(db, id);
}
export function completePdfJob(db: DB, id: string, fileId: string) {
  return jobs.markPdfCompleted(db, id, fileId);
}
export function failPdfJob(db: DB, id: string) {
  return jobs.recordPdfFailure(db, id);
}

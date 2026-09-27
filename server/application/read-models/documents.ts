import type { PdfJob } from '../../../shared/contracts.js';
import { pool } from '../../db/index.js';
import { readDatabase } from '../../db/read.js';
import { AppError } from '../../shared/errors.js';

export async function getJob(id: string) {
  const job = (
    await readDatabase(pool).query<PdfJob & { research_id: string }>(
      `
    SELECT id, research_id, section, status, error_message, file_id FROM pdf_jobs WHERE id = $1
  `,
      [id],
    )
  ).rows[0];
  if (!job) {
    throw new AppError(404, 'PDF 任务不存在');
  }
  return job;
}

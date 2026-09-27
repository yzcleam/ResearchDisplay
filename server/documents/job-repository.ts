import type { DocumentData, Section } from '../../shared/contracts.js';
import type { DB } from '../db/index.js';
import type { QueuedPdfJob } from './model.js';

const MAX_JOB_ATTEMPTS = 3;

/** 领取与 attempts 递增在同一事务中，SKIP LOCKED 避免多个 worker 领取同一任务。 */
export async function claimNextPdfJob(db: DB): Promise<QueuedPdfJob | null> {
  await db.query(
    `
      UPDATE pdf_jobs
      SET status = CASE WHEN attempts < $1 THEN 'queued' ELSE 'failed' END,
          error_message = '转换任务中断，请重试', updated_at = now()
      WHERE status = 'running' AND updated_at < now() - interval '10 minutes'
    `,
    [MAX_JOB_ATTEMPTS],
  );

  const result = await db.query<QueuedPdfJob>(`
      SELECT * FROM pdf_jobs
      WHERE status = 'queued'
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `);
  const job = result.rows[0];
  if (!job) {
    return null;
  }

  await db.query(
    `
      UPDATE pdf_jobs
      SET status = 'running', attempts = attempts + 1, updated_at = now()
      WHERE id = $1
    `,
    [job.id],
  );
  return job;
}

export async function markPdfSuperseded(db: DB, jobId: string) {
  await db.query(
    `
    UPDATE pdf_jobs SET status = 'superseded', updated_at = now()
    WHERE id = $1
  `,
    [jobId],
  );
}

export async function markPdfCompleted(db: DB, jobId: string, fileId: string) {
  await db.query(
    `
    UPDATE pdf_jobs
    SET status = 'completed', file_id = $2, error_message = NULL, updated_at = now()
    WHERE id = $1
  `,
    [jobId, fileId],
  );
}

export async function recordPdfFailure(db: DB, jobId: string) {
  await db.query(
    `
    UPDATE pdf_jobs
    SET status = CASE WHEN attempts < $2 THEN 'queued' ELSE 'failed' END,
        error_message = 'PDF 转换失败，请检查插图或联系管理员后重试',
        updated_at = now()
    WHERE id = $1
  `,
    [jobId, MAX_JOB_ATTEMPTS],
  );
}

export async function findPendingJob(
  db: DB,
  researchId: string,
  section: Section,
  revision: number,
) {
  return (
    await db.query<QueuedPdfJob>(
      `
    SELECT * FROM pdf_jobs
    WHERE research_id = $1 AND section = $2 AND revision = $3 AND status IN ('queued', 'running')
  `,
      [researchId, section, revision],
    )
  ).rows[0];
}

export async function insertJob(
  db: DB,
  input: {
    researchId: string;
    requestedBy: string;
    title: string;
    section: Section;
    document: DocumentData;
  },
) {
  return (
    await db.query<QueuedPdfJob>(
      `
    INSERT INTO pdf_jobs (research_id, requested_by, section, revision, html, title)
    VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
  `,
      [
        input.researchId,
        input.requestedBy,
        input.section,
        input.document.revision,
        input.document.html,
        input.title,
      ],
    )
  ).rows[0];
}

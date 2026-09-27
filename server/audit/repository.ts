import type { DB } from '../db/index.js';
import type { ActivityInput } from './service.js';

export async function insertActivity(db: DB, input: ActivityInput) {
  const result = await db.query<{ id: string }>(
    `
    INSERT INTO upload_events (
      user_id, uploader_name, research_id, research_title, action, files, details
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
  `,
    [
      input.actor.id,
      input.actor.real_name,
      input.research.id,
      input.research.title,
      input.action,
      JSON.stringify(input.files ?? []),
      JSON.stringify(input.details ?? {}),
    ],
  );
  return result.rows[0].id;
}

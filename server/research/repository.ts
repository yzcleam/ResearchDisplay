import type { ResearchInput } from '../../shared/contracts.js';
import type { DB } from '../db/index.js';
import { AppError } from '../shared/errors.js';
import type { ResearchState } from './model.js';

export const researchRepo = {
  async get(db: DB, id: string, lock = false): Promise<ResearchState> {
    const result = await db.query<ResearchState>(
      `
      SELECT * FROM research_records WHERE id = $1
      ${lock ? 'FOR UPDATE' : ''}
    `,
      [id],
    );
    if (!result.rows[0]) {
      throw new AppError(404, '研究成果不存在');
    }
    return result.rows[0];
  },
  async create(db: DB, ownerId: string, data: ResearchInput): Promise<string> {
    const result = await db.query<{ id: string }>(
      `
      INSERT INTO research_records (
        owner_id, title, research_type, factor_type_id, economic_data_names,
        mechanism_summary, impact_summary, risk_summary, policy_summary
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `,
      [
        ownerId,
        data.title,
        data.research_type,
        data.factor_type_id,
        JSON.stringify(data.economic_data_names),
        data.mechanism_summary,
        data.impact_summary,
        data.risk_summary,
        data.policy_summary,
      ],
    );
    return result.rows[0].id;
  },
  async update(db: DB, researchId: string, data: ResearchInput) {
    await db.query(
      `
      UPDATE research_records
      SET title = $2, research_type = $3, factor_type_id = $4,
          economic_data_names = $5, mechanism_summary = $6, impact_summary = $7,
          risk_summary = $8, policy_summary = $9,
          version = version + 1, updated_at = now()
      WHERE id = $1
    `,
      [
        researchId,
        data.title,
        data.research_type,
        data.factor_type_id,
        JSON.stringify(data.economic_data_names),
        data.mechanism_summary,
        data.impact_summary,
        data.risk_summary,
        data.policy_summary,
      ],
    );
  },
  async saveDocuments(db: DB, research: Pick<ResearchState, 'id' | 'documents'>) {
    await db.query(
      `
      UPDATE research_records
      SET documents = $2, version = version + 1, updated_at = now()
      WHERE id = $1
    `,
      [research.id, JSON.stringify(research.documents)],
    );
  },
  async recordLatestActivity(db: DB, id: string, activityId: string) {
    await db.query(
      `
      UPDATE research_records SET latest_upload_id = $2, updated_at = now() WHERE id = $1
    `,
      [id, activityId],
    );
  },
  async advanceVersion(db: DB, id: string) {
    await db.query('UPDATE research_records SET version = version + 1 WHERE id = $1', [id]);
  },
};

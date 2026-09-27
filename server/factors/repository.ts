import type { Factor } from '../../shared/contracts.js';
import type { DB } from '../db/index.js';

export async function readFactorStatus(db: DB, id: string) {
  return (
    await db.query<{ active: boolean }>(
      `
    SELECT active FROM factor_types WHERE id = $1 FOR SHARE
  `,
      [id],
    )
  ).rows[0];
}

export async function insertFactor(db: DB, name: string) {
  return (
    await db.query<Factor>(
      `
    INSERT INTO factor_types(name) VALUES ($1) RETURNING *
  `,
      [name],
    )
  ).rows[0];
}

export async function updateFactor(db: DB, id: string, input: { name: string; active: boolean }) {
  return (
    await db.query<Factor>(
      `
    UPDATE factor_types SET name = $2, active = $3, updated_at = now()
    WHERE id = $1 RETURNING *
  `,
      [id, input.name, input.active],
    )
  ).rows[0];
}

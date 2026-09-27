import type { AiSettings, AiSettingsInput } from '../../shared/ai.js';
import { pool, type DB } from '../db/index.js';

type StoredSettings = Omit<AiSettings, 'has_api_key'> & { api_key_encrypted: string | null };

export async function readPublicSettings() {
  return (
    await pool.query<AiSettings>(`
    SELECT enabled, base_url, model, json_mode, timeout_seconds, revision,
      (api_key_encrypted IS NOT NULL) AS has_api_key
    FROM llm_settings WHERE id = true
  `)
  ).rows[0];
}

export async function readRuntimeSettings() {
  return (await pool.query<StoredSettings>('SELECT * FROM llm_settings WHERE id = true')).rows[0];
}

export async function lockSettings(db: DB) {
  await db.query('SELECT pg_advisory_xact_lock(81919003)');
  return (await db.query<StoredSettings>('SELECT * FROM llm_settings WHERE id = true FOR UPDATE'))
    .rows[0];
}

export async function persistSettings(
  db: DB,
  userId: string,
  input: AiSettingsInput,
  secret: string | null,
) {
  await db.query(
    `
    INSERT INTO llm_settings (
      id, enabled, base_url, model, api_key_encrypted, json_mode, timeout_seconds, updated_by
    ) VALUES (true, $1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (id) DO UPDATE SET
      enabled = $1, base_url = $2, model = $3, api_key_encrypted = $4,
      json_mode = $5, timeout_seconds = $6, updated_by = $7,
      updated_at = now(), revision = llm_settings.revision + 1
  `,
    [
      input.enabled,
      input.base_url.replace(/\/+$/, ''),
      input.model,
      secret,
      input.json_mode,
      input.timeout_seconds,
      userId,
    ],
  );
}

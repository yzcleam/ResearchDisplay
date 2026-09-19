import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { pool, transaction } from '../db/index.js';
import { AppError } from '../shared/errors.js';
import type { User } from '../../shared/contracts.js';
import type { AiSettings, AiSettingsInput, AiStatus } from '../../shared/ai.js';

async function encryptionKey(create: boolean) {
  const directory = path.join(config.storage, '.secrets'), filename = path.join(directory, 'llm.key');
  if (create) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    try { await writeFile(filename, randomBytes(32), { flag: 'wx', mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  }
  const key = await readFile(filename).catch(() => { throw new AppError(503, 'LLM 密钥文件缺失，请由管理员重新填写并保存 API Key'); });
  if (key.length !== 32) throw new AppError(503, 'LLM 密钥文件无效，请检查服务器存储');
  return key;
}
async function encrypt(value: string) {
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', await encryptionKey(true), iv);
  const bytes = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString('base64');
}
async function decrypt(value: string) {
  const bytes = Buffer.from(value, 'base64'), key = await encryptionKey(false);
  try { const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12)); cipher.setAuthTag(bytes.subarray(12, 28)); return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8'); }
  catch { throw new AppError(503, '无法读取 LLM API Key，请由管理员重新填写并保存'); }
}
export async function getAiSettings(): Promise<AiSettings> {
  const row = (await pool.query('SELECT enabled,base_url,model,json_mode,timeout_seconds,revision,(api_key_encrypted IS NOT NULL) AS has_api_key FROM llm_settings WHERE id=true')).rows[0];
  return row || { enabled: false, base_url: 'https://api.openai.com/v1', model: '', json_mode: true, timeout_seconds: 60, revision: 0, has_api_key: false };
}
export async function aiStatus(): Promise<AiStatus> {
  const settings = await getAiSettings(), ready = settings.enabled && settings.has_api_key && !!settings.model;
  return { ready, enabled: settings.enabled, model: settings.model, provider_host: new URL(settings.base_url).host,
    message: ready ? '已配置，可生成智能建议' : '请由管理员在“LLM 设置”中配置并启用模型服务' };
}
export async function saveAiSettings(user: User, input: AiSettingsInput) {
  await transaction(async db => {
    await db.query('SELECT pg_advisory_xact_lock(81919003)');
    const old = (await db.query('SELECT * FROM llm_settings WHERE id=true FOR UPDATE')).rows[0];
    if ((old?.revision || 0) !== input.revision) throw new AppError(409, 'LLM 设置已被修改，请刷新后重试');
    const changedEndpoint = old && old.base_url !== input.base_url.replace(/\/+$/, '');
    if (changedEndpoint && old.api_key_encrypted && !input.api_key && !input.clear_api_key) throw new AppError(400, '更换服务地址时请重新填写 API Key，避免将原密钥发送到其他服务');
    const secret = input.api_key ? await encrypt(input.api_key) : input.clear_api_key ? null : old?.api_key_encrypted || null;
    if (input.enabled && !secret) throw new AppError(400, '启用 LLM 前请填写 API Key');
    await db.query(`INSERT INTO llm_settings(id,enabled,base_url,model,api_key_encrypted,json_mode,timeout_seconds,updated_by) VALUES(true,$1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(id) DO UPDATE SET enabled=$1,base_url=$2,model=$3,api_key_encrypted=$4,json_mode=$5,timeout_seconds=$6,updated_by=$7,updated_at=now(),revision=llm_settings.revision+1`,
    [input.enabled, input.base_url.replace(/\/+$/, ''), input.model, secret, input.json_mode, input.timeout_seconds, user.id]);
  });
  return getAiSettings();
}
export async function runtimeSettings(test = false) {
  const row = (await pool.query('SELECT * FROM llm_settings WHERE id=true')).rows[0];
  if (!row || !row.api_key_encrypted || !row.model || (!test && !row.enabled)) throw new AppError(503, 'LLM 尚未配置或未启用，请联系管理员');
  return { ...row, api_key: await decrypt(row.api_key_encrypted) } as AiSettings & { api_key: string };
}

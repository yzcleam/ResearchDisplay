// Isolated, synthetic fixtures for browser QA; no external model or business data.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { postgresControl } from './postgres-control.js';
import { mockLlm } from '../tests/helpers/llm.js';
const id = randomUUID();
const password = randomUUID();
const directory = path.resolve('.local', `qa-ai-${id}`);
const cluster = new EmbeddedPostgres({
  databaseDir: directory,
  user: 'qa',
  password,
  port: 55436,
  persistent: false,
  authMethod: 'scram-sha-256',
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
  onError: () => {},
});
await cluster.initialise();
const control = await postgresControl(directory, path.resolve('.local', `qa-ai-${id}.log`));
await control.start(55436);
const bootstrap = new pg.Client({
  host: '127.0.0.1',
  port: 55436,
  user: 'qa',
  password,
  database: 'postgres',
});
await bootstrap.connect();
await bootstrap.query('CREATE DATABASE qa_ai');
await bootstrap.end();
process.env.DATABASE_URL = `postgresql://qa:${password}@127.0.0.1:55436/qa_ai`;
process.env.APP_ORIGIN = 'http://localhost:5180';
process.env.STORAGE_DIR = path.resolve('.local', `qa-ai-files-${id}`);
process.env.LOG_LEVEL = 'warn';
process.env.NODE_ENV = 'test';
process.env.COOKIE_SECURE = 'false';
process.env.REGISTRATION_ENABLED = 'true';
process.env.REGISTRATION_INVITE_CODE = '';
const { pool } = await import('../server/db/index.js');
await (await import('../server/db/migrate.js')).migrate();
const user = await (
  await import('../server/auth/index.js')
).register(
  {
    email: 'qa-ai@example.test',
    real_name: '测试研究员',
    institution: '界面验证课题组',
    password: 'Local-QA-Only-Password-29',
  },
  true,
);
const factor = (await pool.query("INSERT INTO factor_types(name) VALUES ('资本') RETURNING id"))
  .rows[0].id;
const html =
  '<h2>资本要素与生产网络</h2><p>本研究使用城市面板数据分析资本要素配置与产业协同的关系。城市间生产网络联系有助于解释样本中的协同差异。研究结果反映相关性，尚不能据此判断因果方向。经济数据包括地区生产总值和就业人数。</p>';
await pool.query(
  'INSERT INTO research_records(owner_id,title,research_type,factor_type_id,mechanism_summary,documents) VALUES($1,$2,$3,$4,$5,$6)',
  [
    user.id,
    '城市资本配置研究',
    '要素集聚',
    factor,
    '已有摘要，检查时应保留。',
    JSON.stringify({ mechanism: { html, revision: 1 } }),
  ],
);
const mock = await mockLlm();
mock.state.content = JSON.stringify({
  title: '城市资本与产业协同研究',
  research_type: '要素流动',
  factor_type_id: factor,
  economic_data_names: ['地区生产总值', '就业人数'],
  mechanism_summary: '资本配置与生产网络联系可能共同影响产业协同，现有证据仅支持相关关系。',
  impact_summary: '样本中的资本配置与经济表现相关，具体影响有待进一步识别。',
  notes: ['原文未提供风险和政策内容，请补充原文后再生成。'],
});
const { saveAiSettings } = await import('../server/application/write-models/ai.js');
mock.state.connectionTest = true;
await saveAiSettings(user, {
  enabled: true,
  base_url: mock.url,
  model: '本地模拟模型（界面测试）',
  api_key: 'synthetic-ui-test-key',
  json_mode: true,
  timeout_seconds: 30,
  revision: 0,
});
const server = (await import('../server/app.js')).createApp().listen(5180, '127.0.0.1');
let stopping = false;
async function stop() {
  if (stopping) {
    return;
  }
  stopping = true;
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mock.close();
  await pool.end();
  await control.stop();
  process.exit(0);
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
console.log('LLM 界面验证服务：http://localhost:5180（本地模拟接口）');

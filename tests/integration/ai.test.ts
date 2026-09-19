import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { postgresControl } from '../../scripts/postgres-control.js';
import { mockLlm } from '../helpers/llm.js';
import type { ResearchInput } from '../../shared/contracts.js';

const run = randomUUID(), password = randomUUID(), directory = path.resolve('.local', `test-ai-${run}`);
const cluster = new EmbeddedPostgres({ databaseDir: directory, user: 'aitest', password, port: 55435, persistent: false, authMethod: 'scram-sha-256', initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {}, onError: () => {} });
let server: Server, base: string, pool: typeof import('../../server/db/index.js').pool, control: Awaited<ReturnType<typeof postgresControl>>, mock: Awaited<ReturnType<typeof mockLlm>>;
type Session = { cookie: string; csrf: string };
let admin: Session, member: Session, other: Session, researchId: string, factorId: string, current: ResearchInput, config: Record<string, unknown>;
const origin = 'http://localhost:5173';
async function request(route: string, method = 'GET', body?: unknown, session?: Session, headers = {}) {
  return fetch(base + '/api' + route, { method, headers: { Origin: origin, 'Content-Type': 'application/json', ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrf } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
}
before(async () => {
  await cluster.initialise(); control = await postgresControl(directory, path.resolve('.local', `test-ai-${run}.log`)); await control.start(55435);
  const bootstrap = new pg.Client({ host: '127.0.0.1', port: 55435, user: 'aitest', password, database: 'postgres' });
  await bootstrap.connect(); try { await bootstrap.query('CREATE DATABASE research_ai'); } finally { await bootstrap.end(); }
  process.env.DATABASE_URL = `postgresql://aitest:${password}@127.0.0.1:55435/research_ai`; process.env.APP_ORIGIN = origin; process.env.STORAGE_DIR = path.resolve('.local', `test-ai-files-${run}`); process.env.LOG_LEVEL = 'silent'; process.env.COOKIE_SECURE = 'false'; process.env.NODE_ENV = 'test'; process.env.REGISTRATION_INVITE_CODE = ''; process.env.REGISTRATION_ENABLED = 'true';
  pool = (await import('../../server/db/index.js')).pool;
  await (await import('../../server/db/migrate.js')).migrate();
  const { register } = await import('../../server/auth/service.js');
  const users = [];
  for (const [index, name] of ['管理员', '张研究', '李研究'].entries()) users.push(await register({ email: `ai-${index}@example.test`, real_name: name, institution: '模拟课题组', password: 'Test-Only-Password-29' }, index === 0));
  factorId = (await pool.query("INSERT INTO factor_types(name) VALUES ('资本') RETURNING id")).rows[0].id;
  current = { title: '原有研究题目', research_type: '其他', factor_type_id: factorId, economic_data_names: ['地区生产总值'], mechanism_summary: '原有摘要应保留', impact_summary: '', risk_summary: '', policy_summary: '' };
  const html = '<h2>机制说明</h2><p>本研究利用城市面板数据考察资本要素配置。生产网络连接上下游产业，通过供需联系影响产业协同。本研究讨论的是相关关系，尚不能确定因果方向。</p>';
  researchId = (await pool.query('INSERT INTO research_records(owner_id,title,research_type,factor_type_id,mechanism_summary,documents) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [users[1].id, current.title, current.research_type, factorId, current.mechanism_summary, JSON.stringify({ mechanism: { html, revision: 1 } })])).rows[0].id;
  server = (await import('../../server/app.js')).createApp().listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve)); base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const sessions = [];
  for (let index = 0; index < 3; index++) { const response = await request('/auth/login', 'POST', { email: `ai-${index}@example.test`, password: 'Test-Only-Password-29' }); assert.equal(response.status, 200); sessions.push({ cookie: response.headers.get('set-cookie')!.split(';')[0], csrf: (await response.json()).csrf }); }
  [admin, member, other] = sessions;
  mock = await mockLlm(); config = { enabled: true, base_url: mock.url, model: 'local-test-model', api_key: 'SYNTHETIC-TEST-KEY', json_mode: true, timeout_seconds: 10, revision: 0 };
}, { timeout: 120000 });
after(async () => { if (server) await new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }); if (pool) await pool.end(); if (mock) await mock.close(); if (control) await control.stop(); });

test('LLM 配置仅管理员可写读，CSRF 和密钥加密、版本保护生效', async () => {
  assert.equal((await request('/ai/status')).status, 401);
  assert.equal((await (await request('/ai/status', 'GET', undefined, member)).json()).ready, false);
  assert.equal((await request('/ai/settings', 'GET', undefined, member)).status, 403);
  assert.equal((await request('/ai/settings', 'PUT', config, member)).status, 403);
  assert.equal((await request('/ai/settings', 'PUT', config, admin, { 'X-CSRF-Token': 'wrong' })).status, 403);
  const saved = await request('/ai/settings', 'PUT', config, admin); assert.equal(saved.status, 200); const data = await saved.json(); assert.equal(data.has_api_key, true); assert.equal(data.revision, 1); assert(!JSON.stringify(data).includes('SYNTHETIC'));
  const stored = (await pool.query('SELECT api_key_encrypted FROM llm_settings')).rows[0].api_key_encrypted; assert(stored); assert(!stored.includes('SYNTHETIC'));
  const read = await request('/ai/settings', 'GET', undefined, admin); assert.equal(read.headers.get('cache-control'), 'no-store'); assert(!(await read.text()).includes('api_key_encrypted'));
  assert.equal((await request('/ai/settings', 'PUT', config, admin)).status, 409);
  assert.equal((await request('/ai/settings', 'PUT', { ...config, revision: 1, base_url: 'https://different.example/v1', api_key: '' }, admin)).status, 400);
  assert.equal((await request('/ai/test', 'POST', {}, member)).status, 403);
  assert.equal((await request('/ai/test', 'POST', {}, admin)).status, 200);
  assert.equal(mock.state.requests[0].authorization, 'Bearer SYNTHETIC-TEST-KEY');
  assert.equal((await (await request('/ai/status', 'GET', undefined, member)).json()).ready, true);
});
test('智能填充不直接写入成果；四类 200 字摘要可分别填入并保存', async () => {
  const before = (await pool.query('SELECT * FROM research_records WHERE id=$1', [researchId])).rows[0];
  const summaries = { mechanism_summary: '机制' + '字'.repeat(198), impact_summary: '影响' + '字'.repeat(198), risk_summary: '风险' + '字'.repeat(198), policy_summary: '政策' + '字'.repeat(198) };
  mock.state.content = JSON.stringify({ title: '城市资本配置研究', ...summaries, factor_type_id: factorId, economic_data_names: ['地区生产总值'], notes: [] });
  const response = await request('/ai/generate', 'POST', { research_id: researchId, mode: 'research', current: { ...current, title: '尚未保存的新题目' } }, member); assert.equal(response.status, 200, await response.clone().text());
  const data = await response.json(); assert.equal(data.suggestions.title, '城市资本配置研究');
  for (const [key, value] of Object.entries(summaries)) assert.equal(data.suggestions[key], value);
  assert(mock.state.requests.at(-1)!.body.messages[0].content.includes('不超过 200 个字符'));
  const prompt = mock.state.requests.at(-1)!.body.messages[0].content;
  assert(prompt.includes('省略主语的段落式语言'));
  assert(prompt.includes('不得使用“原文指出”'));
  assert(prompt.includes('每个摘要只写一个连贯段落'));
  assert(prompt.includes('资料缺失说明只写入 notes'));
  const sent = mock.state.requests.at(-1)!.body.messages[1].content; assert(sent.includes('尚未保存的新题目')); assert(sent.includes('尚不能确定因果方向')); assert(!sent.includes('<h2>'));
  assert.deepEqual((await pool.query('SELECT * FROM research_records WHERE id=$1', [researchId])).rows[0], before);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM upload_events')).rows[0].n, 0);
  const saved = await request(`/research/${researchId}`, 'PUT', { ...current, ...data.suggestions, version: before.version }, member);
  assert.equal(saved.status, 200, await saved.clone().text());
  const persisted = await (await request(`/research/${researchId}`, 'GET', undefined, member)).json();
  for (const [key, value] of Object.entries(summaries)) assert.equal(persisted[key], value);
  assert.deepEqual(persisted.documents, before.documents);
});
test('单篇摘要读取未保存正文，只返回对应摘要；拒绝越权、空文和超长文本', async () => {
  const html = '<p>未保存的经济影响正文。本文分析城市经济发展与要素投入的关联，涉及生产率和就业人数指标。当前证据仅揭示样本中的相关关系，并不支持直接解释为因果效应。</p>';
  mock.state.content = JSON.stringify({ impact_summary: '要素投入与经济发展存在相关关系。', mechanism_summary: '不应进入的其他摘要', title: '不应覆盖的题目' });
  const input = { research_id: researchId, mode: 'section', section: 'impact', html, current };
  const before = mock.state.requests.length;
  assert.equal((await request('/ai/generate', 'POST', input, other)).status, 403); assert.equal(mock.state.requests.length, before);
  const response = await request('/ai/generate', 'POST', input, member); assert.equal(response.status, 200); assert.deepEqual((await response.json()).suggestions, { impact_summary: '要素投入与经济发展存在相关关系。' });
  assert(mock.state.requests.at(-1)!.body.messages[1].content.includes('未保存的经济影响正文'));
  assert.equal((await request('/ai/generate', 'POST', { ...input, html: '<p>空文</p>' }, member)).status, 400);
  assert.equal((await request('/ai/generate', 'POST', { ...input, html: '<p>' + '字'.repeat(60001) + '</p>' }, member)).status, 400);
});
test('模型异常返回可读提示且不泄露服务响应；停用后禁止生成', async () => {
  const input = { research_id: researchId, mode: 'research', current };
  mock.state.status = 500;
  const response = await request('/ai/generate', 'POST', input, member); assert.equal(response.status, 502); assert(!(await response.text()).includes('PRIVATE_PROVIDER_DETAIL'));
  mock.state.status = 200; mock.state.content = '{"research_type":"不合法的类型"}';
  assert.equal((await request('/ai/generate', 'POST', input, member)).status, 502);
  assert.equal((await request('/ai/settings', 'PUT', { ...config, api_key: '', revision: 1, enabled: false }, admin)).status, 200);
  assert.equal((await request('/ai/generate', 'POST', input, member)).status, 503);
  const stored = (await pool.query('SELECT api_key_encrypted FROM llm_settings')).rows[0].api_key_encrypted; assert(stored);
  assert.equal((await request('/ai/settings', 'PUT', { ...config, api_key: '', revision: 2, enabled: false, clear_api_key: true }, admin)).status, 200);
  assert.equal((await pool.query('SELECT api_key_encrypted FROM llm_settings')).rows[0].api_key_encrypted, null);
});
test('同一成员的并发请求不会重复调用模型，取消后可重试，频率上限生效', async () => {
  assert.equal((await request('/ai/settings', 'PUT', { ...config, revision: 3 }, admin)).status, 200);
  mock.state.content = '{"mechanism_summary":"测试摘要"}'; mock.state.delay = 1000;
  const input = { research_id: researchId, mode: 'research', current };
  const before = mock.state.requests.length;
  const controller = new AbortController();
  const running = fetch(base + '/api/ai/generate', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf }, body: JSON.stringify(input), signal: controller.signal });
  // Attach rejection handling immediately; the request is cancelled below.
  const settled = running.catch(() => undefined);
  for (let i = 0; i < 100 && mock.state.requests.length === before; i++) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(mock.state.requests.length, before + 1);
  assert.equal((await request('/ai/generate', 'POST', input, admin)).status, 409);
  assert.equal(mock.state.requests.length, before + 1);
  controller.abort(); await settled; await new Promise(resolve => setTimeout(resolve, 100));
  mock.state.delay = 0;
  assert.equal((await request('/ai/generate', 'POST', input, admin)).status, 200);
  // This member previously made seven generation attempts; the eleventh is rejected.
  for (let i = 0; i < 3; i++) assert.equal((await request('/ai/generate', 'POST', input, member)).status, 200);
  assert.equal((await request('/ai/generate', 'POST', input, member)).status, 429);
});

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import EmbeddedPostgres from 'embedded-postgres';
import AdmZip from 'adm-zip';
import type { Server } from 'node:http';
import { workbookBytes, rarBytes } from '../helpers/datasets.js';
import type { DatasetDescription } from '../../shared/datasets.js';

const runId = randomUUID();
const origin = 'http://localhost:5173';
const databasePassword = randomUUID();
const cluster = new EmbeddedPostgres({
  databaseDir: path.resolve('.local', `test-pg-${runId}`),
  user: 'testuser',
  password: databasePassword,
  port: 55433,
  persistent: false,
  authMethod: 'scram-sha-256',
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  postgresFlags: ['-c', 'listen_addresses=127.0.0.1'],
  onLog: () => {},
  onError: () => {},
});
let server: Server;
let base: string;
let pool: typeof import('../../server/db/index.js').pool;
let processOneJob: typeof import('../../server/workers/pdf.js').processOneJob;
type Session = { cookie: string; csrf: string; user: { id: string } };
let admin: Session;
let member: Session;
let other: Session;
let factorId: string;
let secondFactorId: string;
let researchId: string;
let imageId: string;
let datasetId: string;
const password = 'TestPassword-ForIntegration-29';
const png = await readFile('tests/fixtures/research-figure.png');
async function request(
  route: string,
  method = 'GET',
  body?: unknown,
  session?: Session,
  headers: Record<string, string> = {},
) {
  const response = await fetch(base + '/api' + route, {
    method,
    headers: {
      Origin: origin,
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(session ? { Cookie: session.cookie, 'X-CSRF-Token': session.csrf } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const bytes = await response.arrayBuffer();
  return new Response(bytes.byteLength ? bytes : null, {
    status: response.status,
    headers: response.headers,
  });
}
async function login(email: string): Promise<Session> {
  const res = await request('/auth/login', 'POST', { email, password });
  assert.equal(res.status, 200);
  const data = await res.json();
  return { cookie: res.headers.get('set-cookie')!.split(';')[0], csrf: data.csrf, user: data.user };
}
before(
  async () => {
    await cluster.initialise();
    await cluster.start();
    await cluster.createDatabase('research_test');
    // Credentials belong only to this newly created, disposable PostgreSQL cluster.
    process.env.DATABASE_URL = `postgresql://testuser:${databasePassword}@127.0.0.1:55433/research_test`;
    process.env.APP_ORIGIN = origin;
    process.env.STORAGE_DIR = path.resolve('.local', `test-files-${runId}`);
    process.env.LOG_LEVEL = 'silent';
    process.env.COOKIE_SECURE = 'false';
    process.env.NODE_ENV = 'test';
    process.env.REGISTRATION_INVITE_CODE = '';
    process.env.REGISTRATION_ENABLED = 'true';
    if (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')) {
      process.env.CHROMIUM_EXECUTABLE_PATH =
        'C:/Program Files/Google/Chrome/Application/chrome.exe';
    }
    const db = await import('../../server/db/index.js');
    pool = db.pool;
    await (await import('../../server/db/migrate.js')).migrate();
    const { register } = await import('../../server/auth/index.js');
    await register(
      { email: 'admin@example.test', real_name: '测试管理员', institution: '测试课题组', password },
      true,
    );
    const { createApp } = await import('../../server/app.js');
    server = createApp().listen(0, '127.0.0.1');
    await new Promise<void>((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    processOneJob = (await import('../../server/workers/pdf.js')).processOneJob;
  },
  { timeout: 120000 },
);
after(async () => {
  if (server) {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
  }
  if (pool) {
    await pool.end();
  }
  await cluster.stop();
});

test('实名注册、大小写唯一邮箱、禁止自授管理员', async () => {
  const data = {
    email: 'member@example.test',
    password,
    real_name: '张研究',
    institution: '经济研究课题组',
  };
  assert.equal((await request('/auth/register', 'POST', { ...data, role: 'admin' })).status, 400);
  assert.equal((await request('/auth/register', 'POST', { ...data, real_name: '' })).status, 400);
  assert.equal((await request('/auth/register', 'POST', data)).status, 201);
  assert.equal(
    (await request('/auth/register', 'POST', { ...data, email: 'MEMBER@example.test' })).status,
    409,
  );
  assert.equal(
    (
      await request('/auth/register', 'POST', {
        ...data,
        email: 'other@example.test',
        real_name: '李研究',
      })
    ).status,
    201,
  );
  admin = await login('admin@example.test');
  member = await login('member@example.test');
  other = await login('other@example.test');
  const stored = (
    await pool.query('SELECT password_hash,role FROM users WHERE id=$1', [member.user.id])
  ).rows[0];
  assert.notEqual(stored.password_hash, password);
  assert.equal(stored.role, 'member');
  assert.equal(
    (await request('/auth/login', 'POST', { email: data.email, password: 'wrong' })).status,
    401,
  );
});
test('身份验证、来源和 CSRF 校验、要素字典管理权限', async () => {
  assert.equal((await request('/research')).status, 401);
  assert.equal((await request('/factors', 'POST', { name: '资本' }, member)).status, 403);
  assert.equal(
    (await request('/factors', 'POST', { name: '资本' }, admin, { 'X-CSRF-Token': 'wrong' }))
      .status,
    403,
  );
  assert.equal(
    (
      await request('/factors', 'POST', { name: '资本' }, admin, {
        Origin: 'https://external.example',
      })
    ).status,
    403,
  );
  const first = await request('/factors', 'POST', { name: '资本' }, admin);
  assert.equal(first.status, 201);
  factorId = (await first.json()).id;
  secondFactorId = (await (await request('/factors', 'POST', { name: '劳动力' }, admin)).json()).id;
});
test('创建成果、用户归属、并发修改冲突及禁止成员越权', async () => {
  const data = {
    title: '城市要素配置与产业结构研究',
    research_type: '要素集聚',
    factor_type_id: factorId,
    economic_data_names: ['地区生产总值', '就业人数'],
    mechanism_summary: '资本通过生产网络传导。',
    impact_summary: '促进生产率提升。',
    risk_summary: '关注区域分化。',
    policy_summary: '完善要素市场。',
  };
  const res = await request('/research', 'POST', data, member);
  assert.equal(res.status, 201);
  const record = await res.json();
  researchId = record.id;
  assert.equal(record.owner_id, member.user.id);
  assert.ok(record.latest_upload_id);
  assert.equal(
    (await request(`/research/${researchId}`, 'PUT', { ...data, version: 1 }, other)).status,
    403,
  );
  assert.equal(
    (await request(`/research/${researchId}`, 'PUT', { ...data, version: 1 }, member)).status,
    200,
  );
  assert.equal(
    (await request(`/research/${researchId}`, 'PUT', { ...data, version: 1 }, member)).status,
    409,
  );
  assert.equal(
    (await request(`/files/research/${researchId}`, 'POST', new FormData(), other)).status,
    403,
  );
});
test('真实 XLSX / ZIP / PDF / 插图上传，历史版本与归属映射', { timeout: 120000 }, async () => {
  const xlsx = await workbookBytes([
    ['city', 'province', 'year', 'time', 'GDP'],
    ['北京', '北京', 2024, 2024, 120],
    ['上海', '上海', 2025, 2025, 130],
  ]);
  const images = new AdmZip();
  images.addFile('figure.png', png);
  const { renderPdf } = await import('../../server/application/write-models/documents.js');
  const pdf = await renderPdf(
    researchId,
    '论文原稿测试',
    '研究材料',
    '<h2>测试论文</h2><p>中文正文。Research data.</p>',
  );
  const form = new FormData();
  form.append('dataset', new Blob([new Uint8Array(xlsx)]), 'dataset.xlsx');
  form.append('indicators', new Blob([new Uint8Array(xlsx)]), 'indicators.xlsx');
  form.append('image_pack', new Blob([new Uint8Array(images.toBuffer())]), 'figures.zip');
  form.append('manuscript', new Blob([new Uint8Array(pdf)]), 'paper.pdf');
  form.append('editor_image', new Blob([new Uint8Array(png)]), 'figure.png');
  const result = await request(`/files/research/${researchId}`, 'POST', form, member);
  assert.equal(result.status, 201, await result.clone().text());
  const files = await result.json();
  imageId = files.find((f: { role: string }) => f.role === 'editor_image').id;
  datasetId = files.find((f: { role: string }) => f.role === 'dataset').id;
  assert.equal((await request(`/files/${datasetId}/content`)).status, 401);
  assert.equal((await request(`/files/${datasetId}/content`, 'GET', undefined, other)).status, 403);
  const downloaded = await request(`/files/${datasetId}/content`, 'GET', undefined, member);
  assert.equal(downloaded.status, 200);
  assert.equal(
    downloaded.headers.get('content-type'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  const invalid = new FormData();
  invalid.append('dataset', new Blob(['fake']), 'fake.xlsx');
  assert.equal(
    (await request(`/files/research/${researchId}`, 'POST', invalid, member)).status,
    400,
  );
  const replacement = new FormData();
  replacement.append('dataset', new Blob([new Uint8Array(xlsx)]), 'dataset-v2.xlsx');
  assert.equal(
    (await request(`/files/research/${researchId}`, 'POST', replacement, member)).status,
    201,
  );
  const count = await pool.query(
    "SELECT is_current,count(*)::int FROM file_mappings WHERE research_id=$1 AND role='dataset' GROUP BY is_current",
    [researchId],
  );
  assert.equal(count.rows.length, 2);
  assert(count.rows.every((r) => r.count === 1));
  const events = await (
    await request(`/research/${researchId}/history`, 'GET', undefined, member)
  ).json();
  assert(
    events.some(
      (e: { uploader_name: string; files: unknown[] }) =>
        e.uploader_name === '张研究' && e.files.length === 5,
    ),
  );
});
test('文件共享空间的目录、逐文件权限、导师和删除规则', async () => {
  const teacherInput = {
    email: 'teacher@example.test',
    password,
    real_name: '王导师',
    institution: '测试课题组',
  };
  assert.equal((await request('/users', 'POST', teacherInput, member)).status, 403);
  assert.equal(
    (await request('/auth/register', 'POST', { ...teacherInput, role: 'teacher' })).status,
    400,
  );
  assert.equal((await request('/users', 'POST', teacherInput, admin)).status, 201);
  const teacher = await login(teacherInput.email);
  const strangerInput = {
    email: 'stranger@example.test',
    password,
    real_name: '赵研究',
    institution: '测试课题组',
  };
  assert.equal((await request('/auth/register', 'POST', strangerInput)).status, 201);
  const stranger = await login(strangerInput.email);

  const projects = await (await request('/files/space', 'GET', undefined, stranger)).json();
  assert(projects.some((project: { id: string }) => project.id === researchId));
  const listing = await (
    await request(`/files/space/${researchId}`, 'GET', undefined, stranger)
  ).json();
  assert(
    listing.some(
      (file: { role: string; folder: string; share_scope: string; can_download: boolean }) =>
        file.role === 'dataset' &&
        file.folder === 'dataset' &&
        file.share_scope === 'private' &&
        !file.can_download,
    ),
  );
  assert(
    listing.some(
      (file: { role: string; folder: string; can_download: boolean }) =>
        file.role === 'manuscript' && file.folder === 'manuscript' && file.can_download,
    ),
  );
  assert.equal(
    (await request(`/files/${datasetId}/content`, 'GET', undefined, teacher)).status,
    200,
  );
  assert.equal(
    (await request(`/files/${datasetId}/content`, 'GET', undefined, stranger)).status,
    403,
  );

  const form = new FormData();
  form.append('files', new Blob(['arbitrary text']), 'notes.txt');
  form.append('sharing', JSON.stringify({ scope: 'specific', user_ids: [other.user.id] }));
  assert.equal((await request(`/files/space/${researchId}`, 'POST', form, stranger)).status, 403);
  const created = await request(`/files/space/${researchId}`, 'POST', form, member);
  assert.equal(created.status, 201, await created.clone().text());
  const fileId = (await created.json())[0].id;
  assert.equal((await request(`/files/${fileId}/content`, 'GET', undefined, other)).status, 200);
  assert.equal((await request(`/files/${fileId}/content`, 'GET', undefined, stranger)).status, 403);
  assert.equal((await request(`/files/${fileId}/content`, 'GET', undefined, teacher)).status, 200);
  assert.equal(
    (await request(`/files/${fileId}/sharing`, 'PATCH', { scope: 'global', user_ids: [] }, other))
      .status,
    403,
  );
  assert.equal(
    (await request(`/files/${fileId}/sharing`, 'PATCH', { scope: 'private', user_ids: [] }, member))
      .status,
    204,
  );
  assert.equal((await request(`/files/${fileId}/content`, 'GET', undefined, other)).status, 403);
  assert.equal((await request(`/files/${fileId}`, 'DELETE', {}, teacher)).status, 403);
  assert.equal((await request(`/files/${fileId}`, 'DELETE', {}, other)).status, 403);
  assert.equal((await request(`/files/${fileId}`, 'DELETE', {}, member)).status, 204);
  assert.equal((await request(`/files/${fileId}/content`, 'GET', undefined, admin)).status, 404);

  const adminForm = new FormData();
  adminForm.append('files', new Blob(['administrator test']), 'admin-delete.bin');
  adminForm.append('sharing', JSON.stringify({ scope: 'global', user_ids: [] }));
  const adminFile = await request(`/files/space/${researchId}`, 'POST', adminForm, member);
  assert.equal(adminFile.status, 201);
  const adminFileId = (await adminFile.json())[0].id;
  assert.equal(
    (
      await request(
        `/files/${adminFileId}/sharing`,
        'PATCH',
        { scope: 'private', user_ids: [] },
        admin,
      )
    ).status,
    204,
  );
  assert.equal(
    (await request(`/files/${adminFileId}/content`, 'GET', undefined, stranger)).status,
    403,
  );
  assert.equal((await request(`/files/${adminFileId}`, 'DELETE', {}, admin)).status, 204);
});
test('数据集自动解析、RAR 上传、结构错误回滚、在线说明权限与版本隔离', async () => {
  assert.equal((await request(`/datasets/${datasetId}`)).status, 401);
  let data: DatasetDescription = await (
    await request(`/datasets/${datasetId}`, 'GET', undefined, member)
  ).json();
  assert.equal(data.fields.length, 5);
  assert.equal(data.row_count, 2);
  assert.equal(data.revision, 0);
  assert.deepEqual(
    data.fields.map((field) => field.data_type),
    ['文本型', '文本型', '数值型', '数值型', '数值型'],
  );
  assert.equal(data.descriptions.filter((field) => field.panel_role === 'individual').length, 2);
  assert.equal(data.descriptions.filter((field) => field.panel_role === 'time').length, 2);
  const fill = data.descriptions.map((field) => ({
    ...field,
    chinese_name: 'GDP',
    source: '统计年鉴',
    explanation: '测试数据说明',
  }));
  assert.equal(
    (await request(`/datasets/${datasetId}`, 'PUT', { revision: 0, fields: fill }, member)).status,
    400,
  );
  const fields = fill.map((field, index) => ({
    ...field,
    panel_role: index === 0 ? 'individual' : index === 2 ? 'time' : 'general',
  }));
  assert.equal(
    (await request(`/datasets/${datasetId}`, 'PUT', { revision: 0, fields }, other)).status,
    403,
  );
  assert.equal((await request(`/datasets/${datasetId}/parse`, 'POST', {}, other)).status, 403);
  assert.equal(
    (
      await request(`/datasets/${datasetId}`, 'PUT', { revision: 0, fields }, member, {
        'X-CSRF-Token': 'bad',
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/datasets/${datasetId}`,
        'PUT',
        { revision: 0, fields: fields.slice(1) },
        member,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        `/datasets/${datasetId}`,
        'PUT',
        {
          revision: 0,
          fields: fields.map((field, i) => (i ? field : { ...field, data_type: '文本型' })),
        },
        member,
      )
    ).status,
    400,
  );
  for (const [key, max] of [
    ['chinese_name', 10],
    ['source', 20],
    ['explanation', 100],
  ] as const) {
    assert.equal(
      (
        await request(
          `/datasets/${datasetId}`,
          'PUT',
          {
            revision: 0,
            fields: fields.map((field, i) =>
              i ? field : { ...field, [key]: '字'.repeat(max + 1) },
            ),
          },
          member,
        )
      ).status,
      400,
    );
  }
  const saved = await request(
    `/datasets/${datasetId}`,
    'PUT',
    { revision: 0, fields: [...fields].reverse() },
    member,
  );
  assert.equal(saved.status, 200, await saved.clone().text());
  data = await saved.json();
  assert.equal(data.revision, 1);
  assert(data.saved_at);
  assert.equal(data.descriptions[0].key, data.fields[0].key);
  assert.equal(
    (await request(`/datasets/${datasetId}`, 'PUT', { revision: 0, fields }, member)).status,
    409,
  );
  const read = await (await request(`/datasets/${datasetId}`, 'GET', undefined, other)).json();
  assert.equal(read.descriptions[0].source, '统计年鉴');
  const current = (
    await pool.query(
      "SELECT id FROM file_mappings WHERE research_id=$1 AND role='dataset' AND is_current",
      [researchId],
    )
  ).rows[0].id;
  const next = await (await request(`/datasets/${current}`, 'GET', undefined, member)).json();
  assert.equal(next.revision, 0);
  assert.equal(next.saved_at, null);
  const before = (
    await pool.query('SELECT count(*)::int AS n FROM upload_events WHERE research_id=$1', [
      researchId,
    ])
  ).rows[0].n;
  const bad = new FormData();
  bad.append(
    'dataset',
    new Blob([new Uint8Array(await workbookBytes([['id', 'value'], [1, 10], [], [2, 20]]))]),
    'bad.xlsx',
  );
  bad.append(
    'image_pack',
    new Blob([new Uint8Array(rarBytes([{ name: 'figure.png', bytes: png }]))]),
    'valid.rar',
  );
  const rejected = await request(`/files/research/${researchId}`, 'POST', bad, member);
  assert.equal(rejected.status, 400);
  assert.match((await rejected.json()).message, /第 3 行为空行/);
  assert.equal(
    (
      await pool.query('SELECT count(*)::int AS n FROM upload_events WHERE research_id=$1', [
        researchId,
      ])
    ).rows[0].n,
    before,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT id FROM file_mappings WHERE research_id=$1 AND role='dataset' AND is_current",
        [researchId],
      )
    ).rows[0].id,
    current,
  );
  const rar = new FormData();
  rar.append(
    'image_pack',
    new Blob([new Uint8Array(rarBytes([{ name: 'figure.png', bytes: png }]))]),
    'figures.rar',
  );
  const uploaded = await request(`/files/research/${researchId}`, 'POST', rar, member);
  assert.equal(uploaded.status, 201, await uploaded.clone().text());
  const rarId = (await uploaded.json())[0].id;
  assert.equal(
    (await request(`/files/${rarId}/content`, 'GET', undefined, member)).headers.get(
      'content-type',
    ),
    'application/vnd.rar',
  );
  // Simulate a pre-upgrade dataset: explicit parse reconstructs its profile without touching another version's notes.
  await pool.query('DELETE FROM dataset_descriptions WHERE dataset_file_id=$1', [current]);
  assert.equal((await request(`/datasets/${current}`, 'GET', undefined, member)).status, 404);
  assert.equal((await request(`/datasets/${current}/parse`, 'POST', {}, member)).status, 200);
  assert.equal(
    (await (await request(`/datasets/${datasetId}`, 'GET', undefined, member)).json()).revision,
    1,
  );
  const overview = await (
    await request(`/research/${researchId}`, 'GET', undefined, member)
  ).json();
  assert.equal(
    overview.files.find((file: { id: string }) => file.id === current).dataset_summary.field_count,
    5,
  );
});
test(
  '四类图文说明可保存及转换中文 PDF；插图授权、XSS 与版本保护',
  { timeout: 180000 },
  async () => {
    for (const section of ['mechanism', 'impact', 'risk', 'policy']) {
      const html = `<h2>研究发现 · ${section}</h2><p>产业结构与要素配置的中文说明。</p><img src="/api/files/${imageId}/content" alt="研究插图"><table><tr><th>指标</th><th>数值</th></tr><tr><td>就业人数</td><td>100</td></tr></table><script>alert('xss')</script>`;
      const saved = await request(
        `/documents/research/${researchId}/${section}`,
        'PUT',
        { html, revision: 0 },
        member,
      );
      assert.equal(saved.status, 200);
      const doc = await saved.json();
      assert.equal(doc.revision, 1);
      assert(!doc.html.includes('<script'));
      assert.equal(
        (
          await request(
            `/documents/research/${researchId}/${section}`,
            'PUT',
            { html, revision: 0 },
            member,
          )
        ).status,
        409,
      );
      const jobRes = await request(
        `/documents/research/${researchId}/${section}/pdf`,
        'POST',
        {},
        member,
      );
      assert.equal(jobRes.status, 202);
      const job = await jobRes.json();
      const duplicate = await (
        await request(`/documents/research/${researchId}/${section}/pdf`, 'POST', {}, member)
      ).json();
      assert.equal(duplicate.id, job.id);
      await processOneJob();
      const finished = await (
        await request(`/documents/jobs/${job.id}`, 'GET', undefined, member)
      ).json();
      assert.equal(finished.status, 'completed', JSON.stringify(finished));
      const file = await request(`/files/${finished.file_id}/content`, 'GET', undefined, member);
      const bytes = Buffer.from(await file.arrayBuffer());
      assert.equal(bytes.toString('ascii', 0, 5), '%PDF-');
      assert(bytes.length > 5000);
      await mkdir('output/verification', { recursive: true });
      await writeFile(`output/verification/${section}.pdf`, bytes);
    }
    const invalid = await request(
      `/documents/research/${researchId}/mechanism`,
      'PUT',
      { html: `<p>错误引用</p><img src="/api/files/${datasetId}/content">`, revision: 1 },
      member,
    );
    assert.equal(invalid.status, 400);
    assert.equal(
      (
        await request(
          `/documents/research/${researchId}/mechanism`,
          'PUT',
          { html: '<p>越权</p>', revision: 1 },
          other,
        )
      ).status,
      403,
    );
  },
);
test('前端图谱分组分页、全文按需读取、图文清理与论文预览下载', async () => {
  assert.equal((await request('/showcase')).status, 401);
  assert.equal((await request(`/showcase/research/${researchId}`)).status, 401);
  const overview = await request('/showcase', 'GET', undefined, other);
  assert.equal(overview.status, 200, await overview.clone().text());
  assert.equal(overview.headers.get('cache-control'), 'private, no-store');
  const grouped = await overview.json();
  assert.equal(grouped.total, 1);
  assert.equal(grouped.groups.length, 2);
  assert.equal(
    grouped.groups.find((g: { id: string }) => g.id === factorId).items[0].id,
    researchId,
  );
  assert.equal(grouped.groups.find((g: { id: string }) => g.id === secondFactorId).items.length, 0);
  assert(!JSON.stringify(grouped).includes('documents'));
  assert(!JSON.stringify(grouped).includes('<h2>'));
  assert(!JSON.stringify(grouped).includes('storage_key'));
  const detail = await (
    await request(`/showcase/research/${researchId}`, 'GET', undefined, other)
  ).json();
  assert.equal(Object.keys(detail.sections).length, 4);
  assert(detail.sections.mechanism.html.includes(`/api/files/${imageId}/content`));
  assert(detail.sections.mechanism.pdf);
  assert(detail.manuscript);
  assert(!('files' in detail));
  assert(!('owner_id' in detail));
  const inline = await request(`/files/${detail.manuscript.id}/content`, 'GET', undefined, other);
  assert.equal(inline.headers.get('content-type'), 'application/pdf');
  assert.match(inline.headers.get('content-disposition')!, /^inline/);
  const download = await request(
    `/files/${detail.manuscript.id}/content?download=1`,
    'GET',
    undefined,
    other,
  );
  assert.match(download.headers.get('content-disposition')!, /^attachment/);
  assert.equal(
    Buffer.from(await inline.arrayBuffer())
      .subarray(0, 5)
      .toString(),
    '%PDF-',
  );
  const inserted = await pool.query(
    `INSERT INTO research_records(owner_id,factor_type_id,title,research_type,mechanism_summary,documents)
    SELECT $1,$2,'分页案例 '||n,'其他','分页摘要', $3::jsonb FROM generate_series(1,8) n RETURNING id`,
    [
      member.user.id,
      factorId,
      JSON.stringify({
        mechanism: {
          html: '<p>可读全文</p><script>unsafe()</script><img src="https://external.example/figure"><a href="javascript:alert(1)">引用</a>',
          revision: 1,
        },
      }),
    ],
  );
  const query = await (
    await request('/showcase?q=分页案例&type=其他', 'GET', undefined, other)
  ).json();
  assert.equal(query.total, 8);
  assert.equal(query.groups.length, 1);
  assert.equal(query.groups[0].items.length, 3);
  const second = await (
    await request(
      `/showcase/factors/${factorId}/research?q=分页案例&type=其他&page=2`,
      'GET',
      undefined,
      other,
    )
  ).json();
  const third = await (
    await request(
      `/showcase/factors/${factorId}/research?q=分页案例&type=其他&page=3`,
      'GET',
      undefined,
      other,
    )
  ).json();
  assert.equal(second.total, 8);
  assert.equal(second.items.length, 3);
  assert.equal(third.items.length, 2);
  assert.equal(
    new Set([...query.groups[0].items, ...second.items, ...third.items].map((item) => item.id))
      .size,
    8,
  );
  const clean = await (
    await request(`/showcase/research/${inserted.rows[0].id}`, 'GET', undefined, other)
  ).json();
  assert.match(clean.sections.mechanism.html, /可读全文/);
  assert(!/script|external\.example|javascript:/.test(clean.sections.mechanism.html));
  assert.equal(clean.manuscript, null);
  assert.equal(clean.sections.policy.html, '');
  assert.equal(
    (await (await request('/showcase?q=不存在的关键词', 'GET', undefined, other)).json()).groups
      .length,
    0,
  );
  assert.equal((await request('/showcase?factor=invalid', 'GET', undefined, other)).status, 400);
  assert.equal(
    (await request(`/showcase/factors/${factorId}/research?page=0`, 'GET', undefined, other))
      .status,
    400,
  );
  assert.equal(
    (await request(`/showcase/research/${randomUUID()}`, 'GET', undefined, other)).status,
    404,
  );
  await pool.query('UPDATE factor_types SET active=false WHERE id=$1', [factorId]);
  assert(
    (await (await request('/showcase', 'GET', undefined, other)).json()).groups.some(
      (group: { id: string }) => group.id === factorId,
    ),
  );
  await pool.query('UPDATE factor_types SET active=true WHERE id=$1', [factorId]);
});
test('要素变更级联更新所有历史映射，停用类型禁止用于新研究', async () => {
  const record = await (await request(`/research/${researchId}`, 'GET', undefined, member)).json();
  const { researchSchema } = await import('../../shared/contracts.js');
  const data = {
    ...researchSchema.parse(record),
    factor_type_id: secondFactorId,
    version: record.version,
  };
  assert.equal((await request(`/research/${researchId}`, 'PUT', data, member)).status, 200);
  assert.equal(
    (
      await pool.query('SELECT 1 FROM file_mappings WHERE research_id=$1 AND factor_type_id<>$2', [
        researchId,
        secondFactorId,
      ])
    ).rowCount,
    0,
  );
  const mapped = await (
    await request(`/factors/${secondFactorId}/files?history=true`, 'GET', undefined, member)
  ).json();
  assert(mapped.total >= 10);
  assert.equal(
    (await request(`/factors/${secondFactorId}`, 'PATCH', { name: '劳动力', active: false }, admin))
      .status,
    200,
  );
  const { version, ...newData } = data;
  void version;
  assert.equal((await request('/research', 'POST', newData, member)).status, 400);
});
test('过期 PDF 任务不覆盖新稿；账户停用立即撤销会话', { timeout: 120000 }, async () => {
  const queued = await (
    await request(`/documents/research/${researchId}/mechanism/pdf`, 'POST', {}, member)
  ).json();
  assert.equal(
    (
      await request(
        `/documents/research/${researchId}/mechanism`,
        'PUT',
        { html: '<p>更新后的说明</p>', revision: 1 },
        member,
      )
    ).status,
    200,
  );
  await processOneJob();
  assert.equal(
    (await (await request(`/documents/jobs/${queued.id}`, 'GET', undefined, member)).json()).status,
    'superseded',
  );
  assert.equal(
    (await request(`/users/${admin.user.id}`, 'PATCH', { role: 'member', active: false }, admin))
      .status,
    400,
  );
  assert.equal(
    (await request(`/users/${member.user.id}`, 'PATCH', { role: 'member', active: false }, admin))
      .status,
    204,
  );
  assert.equal((await request('/auth/me', 'GET', undefined, member)).status, 401);
  assert.equal(
    (await request('/auth/login', 'POST', { email: 'member@example.test', password })).status,
    401,
  );
  assert.equal((await request('/auth/logout', 'POST', {}, other)).status, 204);
  assert.equal((await request('/auth/me', 'GET', undefined, other)).status, 401);
});
test('管理员命令清楚区分错误并能创建账号，不输出密码', { timeout: 80000 }, async () => {
  const cli = (email: string, secret: string) =>
    spawnSync(
      process.execPath,
      ['--import', 'tsx', 'server/auth/create-admin.ts', email, '测试管理员', '测试课题组'],
      {
        cwd: process.cwd(),
        env: { ...process.env, ADMIN_PASSWORD: secret, LOG_LEVEL: 'info' },
        encoding: 'utf8',
        timeout: 15000,
      },
    );
  const secret = 'AdminCliTestPassword-29';
  const escaped = cli('new-admin\\@example.test', secret);
  assert.ifError(escaped.error);
  assert.notEqual(escaped.status, 0);
  assert.match(escaped.stdout + escaped.stderr, /邮箱格式不正确/);
  assert(!(escaped.stdout + escaped.stderr).includes(secret));
  const short = cli('new-admin@example.test', 'too-short');
  assert.notEqual(short.status, 0);
  assert.match(short.stdout + short.stderr, /密码长度需为 10 至 128 位/);
  const created = cli('new-admin@example.test', secret);
  assert.equal(created.status, 0, created.stdout + created.stderr);
  const row = (
    await pool.query('SELECT role FROM users WHERE email=$1', ['new-admin@example.test'])
  ).rows[0];
  assert.equal(row.role, 'admin');
  const duplicate = cli('new-admin@example.test', secret);
  assert.notEqual(duplicate.status, 0);
  assert.match(duplicate.stdout + duplicate.stderr, /邮箱已注册/);
});
test('导师可以删除自己上传的文件', async () => {
  const teacher = await login('teacher@example.test');
  const research = {
    title: '导师的研究资料',
    research_type: '其他',
    factor_type_id: factorId,
    economic_data_names: [],
    mechanism_summary: '',
    impact_summary: '',
    risk_summary: '',
    policy_summary: '',
  };
  const created = await request('/research', 'POST', research, teacher);
  assert.equal(created.status, 201);
  const researchId = (await created.json()).id;
  const form = new FormData();
  form.append('files', new Blob(['teacher data']), 'teacher.dat');
  form.append('sharing', JSON.stringify({ scope: 'private', user_ids: [] }));
  const uploaded = await request(`/files/space/${researchId}`, 'POST', form, teacher);
  assert.equal(uploaded.status, 201);
  const id = (await uploaded.json())[0].id;
  assert.equal((await request(`/files/${id}`, 'DELETE', {}, teacher)).status, 204);
  assert.equal((await request(`/files/${id}/content`, 'GET', undefined, teacher)).status, 404);
});

// Synthetic browser QA workspace. Never connects to the project's business database.
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { postgresControl } from './postgres-control.js';
import { sections } from '../shared/contracts.js';
const run = randomUUID();
const password = randomUUID();
const directory = path.resolve('.local', `qa-showcase-${run}`);
const cluster = new EmbeddedPostgres({
  databaseDir: directory,
  user: 'qa',
  password,
  port: 55437,
  persistent: false,
  authMethod: 'scram-sha-256',
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
  onError: () => {},
});
await cluster.initialise();
const control = await postgresControl(directory, path.resolve('.local', `qa-showcase-${run}.log`));
await control.start(55437);
const bootstrap = new pg.Client({
  host: '127.0.0.1',
  port: 55437,
  user: 'qa',
  password,
  database: 'postgres',
});
await bootstrap.connect();
await bootstrap.query('CREATE DATABASE qa_showcase');
await bootstrap.end();
process.env.DATABASE_URL = `postgresql://qa:${password}@127.0.0.1:55437/qa_showcase`;
process.env.APP_ORIGIN = 'http://localhost:5181';
process.env.STORAGE_DIR = path.resolve('.local', `qa-showcase-files-${run}`);
process.env.LOG_LEVEL = 'warn';
process.env.NODE_ENV = 'test';
process.env.COOKIE_SECURE = 'false';
process.env.REGISTRATION_ENABLED = 'true';
process.env.REGISTRATION_INVITE_CODE = '';
if (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')) {
  process.env.CHROMIUM_EXECUTABLE_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
}
const { pool } = await import('../server/db/index.js');
await (await import('../server/db/migrate.js')).migrate();
const user = await (
  await import('../server/auth/index.js')
).register(
  {
    email: 'qa-showcase@example.test',
    real_name: '测试研究员',
    institution: '界面验证课题组',
    password: 'Local-QA-Only-Password-29',
  },
  true,
);
const factors = (
  await pool.query(
    "INSERT INTO factor_types(name) VALUES ('资本'),('劳动力'),('数据'),('土地') RETURNING id,name",
  )
).rows;
const titles = [
  '金融集聚如何推动区域产业升级',
  '跨区域资本流动与生产网络协同',
  '数字金融与企业创新投入',
  '资本配置效率与城市发展差异',
  '公共投资的空间溢出效应',
  '人才流动与城市创新网络',
  '就业结构转型与技能供需匹配',
  '数据要素流通与产业组织变革',
];
const summaries = {
  mechanism:
    '通过降低融资约束与信息搜寻成本，引导资本向具有比较优势的企业和地区集聚。生产网络连接上下游部门，促进知识扩散与专业化分工，形成要素配置与产业协同的共同作用。',
  impact:
    '改善资源配置效率，带动产业结构调整与生产率提升。跨区域联系进一步扩大技术和市场的辐射范围，但不同地区的获益程度仍取决于既有产业基础和吸收能力。',
  risk: '过度集聚可能加大区域发展差距，并通过生产网络传导局部冲击。若资本扩张与实体需求脱节，可能积累结构性错配，应关注中小企业融资与市场进入壁垒。',
  policy:
    '完善统一的要素市场，降低跨区域流动的制度成本。健全信息共享与风险监测机制，兼顾核心地区的创新引领和外围地区的承接能力，分阶段推进配套政策。',
};
const { createResearch } = await import('../server/application/write-models/research.js');
const records = [];
for (let index = 0; index < titles.length; index++) {
  records.push(
    await createResearch(user, {
      title: titles[index],
      factor_type_id: factors[index < 5 ? 0 : index < 7 ? 1 : 2].id,
      research_type: index % 2 ? '要素流动' : '要素集聚',
      economic_data_names: ['地区生产总值', '就业人数'],
      mechanism_summary: summaries.mechanism,
      impact_summary: summaries.impact,
      risk_summary: summaries.risk,
      policy_summary: summaries.policy,
    }),
  );
}
// Keep the first research at the top, independent of fixture creation order.
const record = records[0];
const tmp = path.join(process.env.STORAGE_DIR, 'fixture-tmp');
await mkdir(tmp, { recursive: true });
const { uploadFiles } = await import('../server/application/write-models/uploads.js');
async function upload(role: string, name: string, bytes: Buffer) {
  const filename = path.join(tmp, randomUUID());
  await writeFile(filename, bytes);
  return uploadFiles(user, record.id, [
    {
      fieldname: role,
      originalname: name,
      path: filename,
      size: bytes.length,
    } as Express.Multer.File,
  ]);
}
const image = (
  await upload(
    'editor_image',
    'research-figure.png',
    await readFile('tests/fixtures/research-figure.png'),
  )
)[0];
const { saveDocument } = await import('../server/application/write-models/documents.js');
for (const section of sections) {
  await saveDocument(
    user,
    record.id,
    section,
    `<h2>${section === 'mechanism' ? '融资约束、知识扩散与生产网络' : section === 'impact' ? '配置效率与空间差异' : section === 'risk' ? '结构性错配与冲击传导' : '分阶段推进要素市场建设'}</h2><p>${summaries[section]}</p><p>结合城市层面的经济联系和企业行为进行分析，区分直接关联与网络传导。不同地区的产业基础存在差异，相关结论的适用范围需要结合样本口径进一步核对。</p><img src="/api/files/${image.id}/content" alt="生产网络与要素配置研究示意图"><h3>指标与分析口径</h3><table><tr><th>观察维度</th><th>研究关注</th></tr><tr><td>城市联系</td><td>跨区域流动与知识扩散</td></tr><tr><td>产业协同</td><td>上下游网络的传导路径</td></tr></table><blockquote>测试资料仅用于界面验证，不构成真实研究结论。</blockquote><p>${summaries[section]}</p>`,
    0,
  );
}
const pdf = await (
  await import('../server/application/write-models/documents.js')
).renderPdf(
  record.id,
  record.title,
  '论文原稿',
  '<h2>界面验证论文</h2><p>此 PDF 用于验证新标签页预览和文件下载。</p>',
);
await upload('manuscript', 'research-paper.pdf', pdf);
const server = (await import('../server/app.js')).createApp().listen(5181, '127.0.0.1');
let stopping = false;
async function stop() {
  if (stopping) {
    return;
  }
  stopping = true;
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
  await control.stop();
  process.exit(0);
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
console.log('研究展示验证服务：http://localhost:5181（隔离模拟资料）');

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import type { Research, ResearchInput, User } from '../../shared/contracts.js';
import { postgresControl } from '../../scripts/postgres-control.js';
import { workbookBytes } from '../helpers/datasets.js';

const run = randomUUID();
const password = randomUUID();
const directory = path.resolve('.local', `test-architecture-${run}`);
const storage = path.resolve('.local', `test-architecture-files-${run}`);
const cluster = new EmbeddedPostgres({
  databaseDir: directory,
  user: 'architecturetest',
  password,
  port: 55439,
  persistent: false,
  authMethod: 'scram-sha-256',
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
  onError: () => {},
});
let control: Awaited<ReturnType<typeof postgresControl>>;
let pool: typeof import('../../server/db/index.js').pool;
let admin: User;
let research: Research;

before(
  async () => {
    await cluster.initialise();
    control = await postgresControl(
      directory,
      path.resolve('.local', `test-architecture-${run}.log`),
    );
    await control.start(55439);
    const bootstrap = new pg.Client({
      host: '127.0.0.1',
      port: 55439,
      user: 'architecturetest',
      password,
      database: 'postgres',
    });
    await bootstrap.connect();
    try {
      await bootstrap.query('CREATE DATABASE research_architecture');
    } finally {
      await bootstrap.end();
    }

    Object.assign(process.env, {
      DATABASE_URL: `postgresql://architecturetest:${password}@127.0.0.1:55439/research_architecture`,
      APP_ORIGIN: 'http://localhost:5173',
      STORAGE_DIR: storage,
      LOG_LEVEL: 'silent',
      COOKIE_SECURE: 'false',
      NODE_ENV: 'test',
      REGISTRATION_INVITE_CODE: '',
      REGISTRATION_ENABLED: 'true',
    });
    pool = (await import('../../server/db/index.js')).pool;
    await (await import('../../server/db/migrate.js')).migrate();
    admin = await (
      await import('../../server/auth/index.js')
    ).register(
      {
        email: 'architecture@example.test',
        real_name: '架构测试',
        institution: '测试课题组',
        password: 'Test-Only-Password-29',
      },
      true,
    );
    const factor = await (
      await import('../../server/application/write-models/factors.js')
    ).addFactor(admin, '测试要素');
    const input: ResearchInput = {
      title: '架构边界测试',
      research_type: '其他',
      factor_type_id: factor.id,
      mechanism_summary: '',
      impact_summary: '',
      risk_summary: '',
      policy_summary: '',
      economic_data_names: [],
    };
    research = await (
      await import('../../server/application/write-models/research.js')
    ).createResearch(admin, input);
    await mkdir(path.join(storage, 'objects'), { recursive: true });
  },
  { timeout: 60000 },
);

after(async () => {
  await pool?.end();
  await control?.stop();
});

test('普通读模型使用真实只读事务，SELECT 调用的写入函数也不能修改数据', async () => {
  const { readDatabase } = await import('../../server/db/read.js');
  await pool.query('CREATE TABLE architecture_probe(value integer)');
  await pool.query(`
    CREATE FUNCTION write_architecture_probe() RETURNS integer LANGUAGE plpgsql AS $$
    BEGIN INSERT INTO architecture_probe VALUES (1); RETURN 1; END $$
  `);
  await assert.rejects(
    readDatabase(pool).query('SELECT write_architecture_probe()'),
    (error: unknown) => (error as { code?: string }).code === '25006',
  );
  assert.equal(
    (await pool.query('SELECT count(*)::int AS count FROM architecture_probe')).rows[0].count,
    0,
  );
  assert.equal((await readDatabase(pool).query('SELECT 7 AS value')).rows[0].value, 7);
});

test('写模型的查询投影复用当前事务，可以读取未提交的修改且随事务一起回滚', async () => {
  const { transaction } = await import('../../server/db/index.js');
  const { advanceVersion } = await import('../../server/research/index.js');
  const { getResearch } = await import('../../server/application/read-models/research.js');
  const original = await getResearch(research.id);
  const rollback = new Error('architecture intentional rollback');
  await assert.rejects(
    transaction(async (db) => {
      await advanceVersion(db, research.id);
      assert.equal((await getResearch(research.id, db)).version, original.version + 1);
      throw rollback;
    }),
    (error) => error === rollback,
  );
  assert.equal((await getResearch(research.id)).version, original.version);
});

test('文件移动后数据集写入失败，跨模块记录及磁盘对象全部回滚', async () => {
  const { uploadFiles } = await import('../../server/application/write-models/uploads.js');
  const { getResearch, getResearchHistory } =
    await import('../../server/application/read-models/research.js');
  const original = await getResearch(research.id);
  const history = await getResearchHistory(research.id);
  const objects = await readdir(path.join(storage, 'objects'));
  const temporaryPath = path.join(storage, 'failed-upload.xlsx');
  const bytes = await workbookBytes([
    ['city', 'year', 'value'],
    ['北京', 2020, 100],
    ['上海', 2021, 200],
  ]);
  await writeFile(temporaryPath, bytes);
  await pool.query(`
    CREATE FUNCTION reject_dataset_profile() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'architecture injected failure after moving file'; END $$
  `);
  await pool.query(
    'CREATE TRIGGER reject_dataset BEFORE INSERT ON dataset_descriptions FOR EACH ROW EXECUTE FUNCTION reject_dataset_profile()',
  );
  try {
    await assert.rejects(
      uploadFiles(admin, research.id, [
        {
          fieldname: 'dataset',
          originalname: 'dataset.xlsx',
          path: temporaryPath,
          size: bytes.length,
        },
      ]),
      /architecture injected failure/,
    );
  } finally {
    await pool.query('DROP TRIGGER reject_dataset ON dataset_descriptions');
    await pool.query('DROP FUNCTION reject_dataset_profile()');
  }
  const unchanged = await getResearch(research.id);
  assert.equal(unchanged.version, original.version);
  assert.equal(unchanged.latest_upload_id, original.latest_upload_id);
  assert.deepEqual(unchanged.files, original.files);
  assert.deepEqual(await getResearchHistory(research.id), history);
  assert.deepEqual(await readdir(path.join(storage, 'objects')), objects);
  await assert.rejects(
    stat(temporaryPath),
    (error: unknown) => (error as { code?: string }).code === 'ENOENT',
  );
  assert.equal(
    (await pool.query('SELECT count(*)::int AS count FROM dataset_descriptions')).rows[0].count,
    0,
  );
});

test('操作已提交后的临时文件清理错误，不得删除成功归档的对象或伪报业务失败', async () => {
  const { withFileBatch, storedFilePath } = await import('../../server/files/index.js');
  // rm 不带 recursive 时不能删除目录，稳定模拟清理失败，不依赖平台 ACL。
  const unremovableAsFile = path.join(storage, 'temporary-directory');
  await mkdir(unremovableAsFile);
  const key = randomUUID();
  const result = await withFileBatch([unremovableAsFile], async (batch) => {
    await batch.writeGenerated(key, Buffer.from('committed content'));
    return 'committed';
  });
  assert.equal(result, 'committed');
  assert.equal(await readFile(storedFilePath(key), 'utf8'), 'committed content');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inspectArchitecture } from '../scripts/architecture-rules.js';
import { assertReadQuery } from '../server/db/sql.js';

function rules(files: Record<string, string>) {
  return inspectArchitecture(new Map(Object.entries(files))).map((issue) => issue.rule);
}

test('模块可通过显式公开入口被写模型协调，模块之间不可直接依赖', () => {
  const files = {
    'server/files/index.ts': "export { registerFile } from './service.js';",
    'server/files/service.ts': 'export function registerFile() {}',
    'server/application/write-models/uploads.ts':
      "import { registerFile } from '../../files/index.js';",
  };
  assert.deepEqual(rules(files), []);
  assert(
    rules({
      ...files,
      'server/research/service.ts': "import { registerFile } from '../files/index.js';",
    }).includes('module-dependency'),
  );
  assert(
    rules({
      ...files,
      'server/application/write-models/uploads.ts':
        "import { registerFile } from '../../files/service.js';",
    }).includes('private-import'),
  );
});

test('HTTP 不得越过应用层；业务 SQL 必须留在所属仓储', () => {
  assert(
    rules({
      'server/research/index.ts': '',
      'server/http/routes/research.ts': "import '../../research/index.js';",
    }).includes('http-boundary'),
  );
  assert(
    rules({ 'server/research/service.ts': "db.query('SELECT * FROM research_records');" }).includes(
      'sql-location',
    ),
  );
  assert(
    rules({
      'server/research/repository.ts': "db.query('UPDATE file_mappings SET active = false');",
    }).includes('table-ownership'),
  );
  assert.deepEqual(
    rules({
      'server/research/repository.ts':
        'db.query(\'SELECT * FROM public."research_records" FOR UPDATE\');',
    }),
    [],
  );
});

test('读模型阻止绕过查询适配器、调用命令或导入写入能力', () => {
  assert(
    rules({
      'server/application/read-models/research.ts': "pool.query('SELECT * FROM research_records');",
    }).includes('read-model-bypass'),
  );
  assert(
    rules({
      'server/application/read-models/research.ts':
        "readDatabase(pool).query('WITH removed AS (DELETE FROM research_records RETURNING *) SELECT * FROM removed');",
    }).includes('read-model-write'),
  );
  assert(
    rules({
      'server/application/read-models/research.ts': "import '../write-models/research.js';",
      'server/application/write-models/research.ts': '',
    }).includes('read-model-write'),
  );
  assert(
    rules({
      'server/files/index.ts': '',
      'server/application/read-models/files.ts':
        "import { registerFile } from '../../files/index.js';",
    }).includes('read-model-capability'),
  );
});

test('公开入口不泄露仓储，前端功能不能直接调用传输接口', () => {
  assert(
    rules({
      'server/files/repository.ts': 'export const repository = {};',
      'server/files/index.ts': "export * from './repository.js';",
    }).includes('public-contract'),
  );
  assert(
    rules({
      'client/api.ts': 'export const api = () => {};',
      'client/research/form.ts': "import { api } from '../api';",
    }).includes('frontend-api'),
  );
  assert(
    rules({ 'client/data/read-models.ts': "api('/research', {method: 'POST'});" }).includes(
      'read-model-write',
    ),
  );
  assert.deepEqual(rules({ 'client/data/read-models.ts': "api('/research', {signal});" }), []);
});

test('运行时循环依赖被拒绝，纯类型引用不产生运行时循环', () => {
  assert(
    rules({
      'server/research/a.ts': "import './b.js';",
      'server/research/b.ts': "import './a.js';",
    }).includes('dependency-cycle'),
  );
  assert.deepEqual(
    rules({
      'server/research/a.ts': "import type { B } from './b.js'; export type A = B;",
      'server/research/b.ts': "import type { A } from './a.js'; export interface B {parent?: A}",
    }),
    [],
  );
});

test('只读 SQL 忽略注释、字符串和带引号的字段名', () => {
  for (const sql of [
    "SELECT 'DELETE; UPDATE' AS text",
    '/* SELECT /* nested */ */ WITH recent AS (SELECT 1) SELECT * FROM recent;',
    'SELECT "update", $$INSERT INTO users$$ FROM research_records',
    "SELECT E'escaped\\'DELETE' FROM research_records -- FOR UPDATE",
  ]) {
    assert.doesNotThrow(() => assertReadQuery(sql), sql);
  }
});

test('只读 SQL 拒绝写入 CTE、行锁、修改函数及多语句', () => {
  for (const sql of [
    'WITH removed AS (DELETE FROM research_records RETURNING *) SELECT * FROM removed',
    'SELECT * FROM research_records FOR UPDATE',
    'SELECT * FROM research_records FOR KEY SHARE',
    'SELECT * INTO exported FROM research_records',
    "SELECT nextval('counter')",
    "SELECT pg_catalog.\"set_config\"('x', 'y', false)",
    'SELECT pg_advisory_lock(1)',
    'SELECT 1; COMMIT',
    'UPDATE research_records SET version = 2',
  ]) {
    assert.throws(() => assertReadQuery(sql), /读模型/, sql);
  }
});

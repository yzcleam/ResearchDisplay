// Isolated fixtures for browser verification; never opens the business database.
import EmbeddedPostgres from 'embedded-postgres';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { workbookBytes, rarBytes } from '../tests/helpers/datasets.js';
const run = randomUUID();
const password = randomUUID();
const cluster = new EmbeddedPostgres({ databaseDir: path.resolve('.local', `qa-datasets-${run}`), user: 'qa', password, port: 55434, persistent: false, authMethod: 'scram-sha-256', initdbFlags: ['--encoding=UTF8', '--locale=C'], postgresFlags: ['-c', 'listen_addresses=127.0.0.1'], onLog: () => {}, onError: () => {} });
await cluster.initialise(); await cluster.start(); await cluster.createDatabase('qa_datasets');
process.env.DATABASE_URL = `postgresql://qa:${password}@127.0.0.1:55434/qa_datasets`;
process.env.APP_ORIGIN = 'http://localhost:5180'; process.env.PORT = '5180'; process.env.STORAGE_DIR = path.resolve('.local', `qa-datasets-files-${run}`);
process.env.LOG_LEVEL = 'warn'; process.env.NODE_ENV = 'test'; process.env.COOKIE_SECURE = 'false'; process.env.REGISTRATION_INVITE_CODE = ''; process.env.REGISTRATION_ENABLED = 'true';
const { pool } = await import('../server/db/index.js');
await (await import('../server/db/migrate.js')).migrate();
const user = await (await import('../server/auth/service.js')).register({ email: 'qa-dataset@example.test', real_name: '测试研究员', institution: '测试课题组', password: 'Local-QA-Only-Password-29' }, true);
const factor = (await pool.query("INSERT INTO factor_types(name) VALUES ('资本') RETURNING id")).rows[0];
await pool.query("INSERT INTO research_records(owner_id,title,research_type,factor_type_id) VALUES ($1,'城市经济数据归档验证','要素集聚',$2)", [user.id, factor.id]);
await mkdir('output/playwright', { recursive: true });
await writeFile('output/playwright/dataset-valid.xlsx', await workbookBytes([['city', 'province', 'year', 'time', 'GDP'], ['北京', '北京', 2024, 2024, 120], ['上海', '上海', 2025, 2025, 130]]));
await writeFile('output/playwright/dataset-invalid.xlsx', await workbookBytes([['city', 'GDP'], ['北京', 120], [], ['上海', 130]]));
await writeFile('output/playwright/images.rar', rarBytes([{ name: 'figure.png', bytes: await readFile('tests/fixtures/research-figure.png') }]));
const server = (await import('../server/app.js')).createApp().listen(5180, '127.0.0.1');
async function stop() { await new Promise<void>(resolve => server.close(() => resolve())); await pool.end(); await cluster.stop(); process.exit(0); }
process.on('SIGINT', () => void stop()); process.on('SIGTERM', () => void stop());
console.log('数据说明界面验证服务：http://localhost:5180');

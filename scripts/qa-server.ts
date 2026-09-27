// Isolated, local-only UI verification server. Never seeds the business database.
import 'dotenv/config';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
const databaseName = `qa_${randomUUID().replaceAll('-', '')}`;
const connection = new URL(process.env.DATABASE_URL!);
connection.pathname = '/postgres';
const setup = new pg.Client({ connectionString: connection.toString() });
await setup.connect();
await setup.query(`CREATE DATABASE "${databaseName}"`);
await setup.end();
connection.pathname = `/${databaseName}`;
process.env.DATABASE_URL = connection.toString();
process.env.APP_ORIGIN = 'http://localhost:5174';
process.env.PORT = '3002';
process.env.STORAGE_DIR = path.resolve('.local', databaseName);
process.env.LOG_LEVEL = 'warn';
process.env.NODE_ENV = 'test';
process.env.REGISTRATION_INVITE_CODE = '';
process.env.REGISTRATION_ENABLED = 'true';
await (await import('../server/db/migrate.js')).migrate();
await (
  await import('../server/auth/index.js')
).register(
  {
    email: 'qa-admin@example.test',
    real_name: '界面测试管理员',
    institution: '测试课题组',
    password: 'Local-QA-Only-Password-29',
  },
  true,
);
const { createApp } = await import('../server/app.js');
const { processOneJob } = await import('../server/workers/pdf.js');
const { pool } = await import('../server/db/index.js');
const server = createApp().listen(3002, '127.0.0.1');
let stop = false;
async function shutdown() {
  stop = true;
  server.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
console.log('隔离的界面验证 API 已启动：127.0.0.1:3002');
while (!stop) {
  try {
    if (!(await processOneJob())) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  } catch {
    await new Promise((r) => setTimeout(r, 2000));
  }
}

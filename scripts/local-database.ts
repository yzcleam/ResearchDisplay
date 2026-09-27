import EmbeddedPostgres from 'embedded-postgres';
import pg from 'pg';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { postgresControl } from './postgres-control.js';

type Credentials = { user: string; password: string; port: number };
async function connects(url: string) {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => {});
  }
}

/** Reuse configured databases; only stop a cluster started by this invocation. */
export async function ensureDatabase() {
  loadEnv({ quiet: true });
  await mkdir('.local', { recursive: true });
  const credentialsPath = path.resolve('.local/postgres.json');
  let credentials: Credentials | undefined = existsSync(credentialsPath)
    ? JSON.parse(await readFile(credentialsPath, 'utf8'))
    : undefined;
  if (!process.env.DATABASE_URL) {
    if (existsSync('.env')) {
      throw new Error('请先在 .env 中填写 DATABASE_URL，现有配置不会被覆盖。');
    }
    credentials ??= { user: 'research', password: randomBytes(24).toString('hex'), port: 55432 };
    if (!existsSync(credentialsPath)) {
      await writeFile(credentialsPath, JSON.stringify(credentials), { flag: 'wx' });
    }
    const browser =
      process.platform === 'win32'
        ? [
            'C:/Program Files/Google/Chrome/Application/chrome.exe',
            'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
          ].find(existsSync) || ''
        : '';
    await writeFile(
      '.env',
      `DATABASE_URL=postgresql://${encodeURIComponent(credentials.user)}:${encodeURIComponent(credentials.password)}@127.0.0.1:${credentials.port}/research_display\nPORT=3001\nAPP_ORIGIN=http://localhost:5173\nSTORAGE_DIR=./storage\nCOOKIE_SECURE=false\nREGISTRATION_ENABLED=true\nCHROMIUM_EXECUTABLE_PATH=${browser}\n`,
      { flag: 'wx' },
    );
    loadEnv({ quiet: true });
  }
  const connectionString = process.env.DATABASE_URL!;
  if (await connects(connectionString)) {
    console.log('[数据库] 已连接现有 PostgreSQL，退出时不会关闭它。');
    return async () => {};
  }
  const url = new URL(connectionString);
  const managed =
    credentials &&
    ['localhost', '127.0.0.1'].includes(url.hostname) &&
    Number(url.port) === credentials.port &&
    decodeURIComponent(url.username) === credentials.user &&
    decodeURIComponent(url.password) === credentials.password &&
    url.pathname === '/research_display';
  if (!managed || !credentials) {
    throw new Error('无法连接配置的数据库。请检查 DATABASE_URL，或先启动对应 PostgreSQL 服务。');
  }
  const databaseDir = path.resolve('.local/postgres');
  if (!existsSync(path.join(databaseDir, 'PG_VERSION'))) {
    const initializer = new EmbeddedPostgres({
      databaseDir,
      ...credentials,
      persistent: true,
      authMethod: 'scram-sha-256',
      initdbFlags: ['--encoding=UTF8', '--locale=C'],
      onLog: () => {},
      onError: () => {},
    });
    await initializer.initialise();
  }
  const control = await postgresControl(databaseDir, path.resolve('.local/postgres.log'));
  let started = false;
  try {
    console.log('[数据库] 正在启动本地 PostgreSQL…');
    await control.start(credentials.port);
    started = true;
    const client = new pg.Client({
      user: credentials.user,
      password: credentials.password,
      port: credentials.port,
      host: '127.0.0.1',
      database: 'postgres',
      connectionTimeoutMillis: 5000,
    });
    try {
      await client.connect();
      if (
        !(await client.query("SELECT 1 FROM pg_database WHERE datname='research_display'")).rowCount
      ) {
        await client.query('CREATE DATABASE research_display');
      }
    } finally {
      await client.end();
    }
    console.log(`[数据库] 本地 PostgreSQL 已启动，端口 ${credentials.port}。`);
    return async () => {
      await control.stop();
      console.log('[数据库] 已正常停止。');
    };
  } catch (error) {
    if (started) {
      await control.stop();
    }
    throw error;
  }
}

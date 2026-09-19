import { spawn, type ChildProcess } from 'node:child_process';
import { createServer as createTcpServer } from 'node:net';
import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { config as loadEnv } from 'dotenv';
import type { ViteDevServer } from 'vite';
import { ensureDatabase } from './local-database.js';

// embedded-postgres installs process-wide exit hooks. This supervisor owns the
// shutdown order: stop HTTP and PDF work before stopping its database.
const exitHooks = createRequire(import.meta.url)('async-exit-hook') as { unhookEvent: (event: string) => void };
for (const event of ['beforeExit', 'SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK', 'message']) exitHooks.unhookEvent(event);

process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
loadEnv({ quiet: true });
const lockPath = path.resolve('.local/start.lock');
let ownsLock = false, starting = true, stopRequested = false;
let stopDatabase: (() => Promise<void>) | undefined;
let apiServer: Server | undefined;
let frontend: ViteDevServer | undefined;
let worker: ChildProcess | undefined;
let closePool: (() => Promise<void>) | undefined;
let closing: Promise<void> | undefined;

async function lock() {
  await mkdir('.local', { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try { await writeFile(lockPath, String(process.pid), { flag: 'wx' }); ownsLock = true; return; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const pid = Number(await readFile(lockPath, 'utf8'));
    let alive = false;
    if (Number.isSafeInteger(pid) && pid > 0) {
      try { process.kill(pid, 0); alive = true; }
      catch (error) { alive = (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
    }
    if (alive) throw new Error('已有 npm start 正在运行，请使用原窗口，或先在原窗口按 Ctrl+C 停止。');
    await rm(lockPath, { force: true });
  }
  throw new Error('未能获取启动锁，请稍后重试。');
}

async function checkPort(port: number, host: string, label: string) {
  const probe = createTcpServer();
  await new Promise<void>((resolve, reject) => {
    probe.once('error', () => reject(new Error(`${label}端口 ${port} 已占用，请先停止旧的 npm run dev / npm start 或调整 .env。`)));
    probe.listen(port, host, () => probe.close(error => error ? reject(error) : resolve()));
  });
}

async function stopWorker() {
  if (!worker || worker.exitCode !== null || worker.signalCode !== null) return;
  const child = worker;
  await new Promise<void>(resolve => {
    const timer = setTimeout(() => {
      if (child.pid) {
        if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { windowsHide: true, stdio: 'ignore' });
        else child.kill('SIGKILL');
      }
    }, 65000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
    if (child.connected) child.send('shutdown', () => {});
    else child.kill('SIGTERM');
  });
}

async function shutdown(code = 0) {
  if (closing) return closing;
  closing = (async () => {
    console.log('\n正在停止本次启动的服务，保留数据库与上传资料…');
    const errors: unknown[] = [];
    const clean = async (fn: () => Promise<unknown>) => { try { await fn(); } catch (error) { errors.push(error); } };
    await clean(async () => { await frontend?.close(); });
    await clean(async () => {
      if (apiServer) await new Promise<void>(resolve => {
        const timer = setTimeout(() => apiServer?.closeAllConnections(), 5000);
        apiServer!.close(() => { clearTimeout(timer); resolve(); });
      });
    });
    await clean(stopWorker);
    await clean(async () => { await closePool?.(); });
    await clean(async () => { await stopDatabase?.(); });
    if (ownsLock) await clean(() => rm(lockPath, { force: true }));
    for (const error of errors) console.error(`停止服务时发生错误：${error instanceof Error ? error.message : '未知错误'}`);
    if (!errors.length) console.log('本次启动的服务已全部停止。');
    if (process.connected) process.disconnect();
    process.exit(errors.length ? 1 : code);
  })();
  return closing;
}

function requestStop() { stopRequested = true; if (!starting) void shutdown(); }
process.on('SIGINT', requestStop);
process.on('SIGTERM', requestStop);
process.on('SIGHUP', requestStop);
process.on('SIGBREAK', requestStop);
process.on('message', message => { if (message === 'shutdown') requestStop(); });
function checkStopped() { if (stopRequested) throw new Error('已取消启动。'); }

try {
  await lock();
  const apiPort = Number(process.env.PORT || 3001);
  const origin = new URL(process.env.APP_ORIGIN || 'http://localhost:5173');
  if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)) {
    throw new Error('npm start 用于本地开发，请将 APP_ORIGIN 设置为 http://localhost:5173。服务器部署请使用 Docker 或 start:api。');
  }
  const webPort = Number(origin.port || 80);
  const apiHost = process.env.HOST || '127.0.0.1';
  const webHost = origin.hostname === '[::1]' ? '::1' : '127.0.0.1';
  if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535 || apiPort === webPort) throw new Error('PORT 必须是有效端口，且不能与管理页面端口相同。');
  await Promise.all([checkPort(apiPort, apiHost, '后端'), checkPort(webPort, webHost, '管理页面')]);
  checkStopped();
  stopDatabase = await ensureDatabase();
  checkStopped();
  // Configuration is imported after first-run .env creation.
  const { pool } = await import('../server/db/index.js');
  closePool = () => pool.end();
  const { migrate } = await import('../server/db/migrate.js');
  await migrate();
  console.log('[数据库] 表结构已就绪。');
  checkStopped();
  const { createApp } = await import('../server/app.js');
  await new Promise<void>((resolve, reject) => {
    apiServer = createApp().listen(apiPort, apiHost, error => error ? reject(error) : resolve());
    apiServer.once('error', reject);
  });
  worker = spawn(process.execPath, ['--import', 'tsx', 'server/documents/worker.ts'], {
    env: process.env, stdio: ['ignore', 'inherit', 'inherit', 'ipc'], windowsHide: true,
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('PDF 工作进程启动超时。')), 15000);
    worker!.once('error', () => { clearTimeout(timer); reject(new Error('PDF 工作进程无法启动。')); });
    worker!.once('exit', () => { clearTimeout(timer); reject(new Error('PDF 工作进程在启动时退出。')); });
    worker!.on('message', message => { if (message === 'ready') { clearTimeout(timer); resolve(); } });
  });
  worker.once('exit', code => {
    if (!closing && !starting) { console.error(`PDF 工作进程意外退出（${code}），正在停止其他服务。`); void shutdown(1); }
  });
  checkStopped();
  const { createServer } = await import('vite');
  const proxyHost = apiHost === '::1' ? '[::1]' : apiHost === '0.0.0.0' ? '127.0.0.1' : apiHost;
  frontend = await createServer({ server: { host: webHost, port: webPort, strictPort: true, proxy: { '/api': `http://${proxyHost}:${apiPort}` } } });
  await frontend.listen();
  checkStopped();
  starting = false;
  console.log(`\n所有服务已启动：${origin.origin}\n包含 PostgreSQL、后端 API、PDF 转换进程和管理页面。\n按 Ctrl+C 统一停止，已有资料会保留。\n`);
  if (process.connected) process.send?.('ready');
} catch (error) {
  starting = false;
  console.error(`启动失败：${error instanceof Error ? error.message : '请检查服务配置。'}`);
  await shutdown(stopRequested ? 0 : 1);
}

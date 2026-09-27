import { ensureDatabase } from './local-database.js';
import { createRequire } from 'node:module';
const exitHooks = createRequire(import.meta.url)('async-exit-hook') as {
  unhookEvent: (event: string) => void;
};
for (const event of ['beforeExit', 'SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK', 'message']) {
  exitHooks.unhookEvent(event);
}
let stopDatabase: (() => Promise<void>) | undefined;
let requested = false;
let stopping = false;
async function stop() {
  requested = true;
  if (!stopDatabase || stopping) {
    return;
  }
  stopping = true;
  try {
    await stopDatabase();
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : '数据库停止失败');
    process.exit(1);
  }
}
for (const event of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(event, () => void stop());
}
try {
  stopDatabase = await ensureDatabase();
  if (requested) {
    await stop();
  }
  console.log('数据库已就绪，配置保存在 .env。按 Ctrl+C 退出，已有资料会保留。');
  setInterval(() => {}, 60000);
} catch (error) {
  console.error(error instanceof Error ? error.message : '数据库启动失败');
  process.exitCode = 1;
}

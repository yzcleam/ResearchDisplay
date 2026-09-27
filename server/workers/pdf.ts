import { setTimeout as delay } from 'node:timers/promises';
import { processOneJob } from '../application/write-models/pdf-jobs.js';
import { checkDatabase, pool } from '../db/index.js';
import { logger } from '../shared/logger.js';

// 保留测试与现有启动脚本使用的导出入口。
export { processOneJob } from '../application/write-models/pdf-jobs.js';

const IDLE_POLL_INTERVAL_MS = 1500;
const FAILED_POLL_INTERVAL_MS = 5000;

async function runPdfWorker() {
  let stopRequested = false;
  const requestStop = () => {
    stopRequested = true;
  };
  process.on('SIGTERM', requestStop);
  process.on('SIGINT', requestStop);
  process.on('message', (message) => {
    if (message === 'shutdown') {
      requestStop();
    }
  });

  await checkDatabase();
  logger.info('PDF 工作进程已启动');
  if (process.connected) {
    process.send?.('ready');
  }

  // 等待当前任务完成后退出，避免中断正在写入的 PDF 和数据库事务。
  while (!stopRequested) {
    try {
      const processed = await processOneJob();
      if (!processed) {
        await delay(IDLE_POLL_INTERVAL_MS);
      }
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'unknown' },
        'PDF 任务轮询失败',
      );
      await delay(FAILED_POLL_INTERVAL_MS);
    }
  }

  await pool.end();
  if (process.connected) {
    process.disconnect();
  }
}

const launchedAsWorker = /\/pdf\.(ts|js)$/.test(process.argv[1]?.replaceAll('\\', '/') || '');
if (launchedAsWorker) {
  await runPdfWorker();
}

import { spawn } from 'node:child_process';
import { open, stat } from 'node:fs/promises';
import path from 'node:path';

/** Every child outcome settles exactly once, including spawn failure and timeout. */
export function runPostgresCommand(executable: string, args: string[], timeoutMs = 40000): Promise<{ code: number; output: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', settled = false;
    const finish = (error?: Error, code = 1) => {
      if (settled) return; settled = true; clearTimeout(timer);
      if (error) reject(error); else resolve({ code, output: output.trim() });
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error('PostgreSQL 控制命令超时，请检查 .local/postgres.log。'));
    }, timeoutMs);
    const collect = (chunk: Buffer) => { output = (output + chunk.toString('utf8')).slice(-8192); };
    child.stdout.on('data', collect); child.stderr.on('data', collect);
    child.once('error', error => finish(new Error(`无法运行 PostgreSQL 控制工具：${error.message}`)));
    child.once('exit', code => {
      // On Windows, the detached server may inherit pipe handles. Waiting for
      // 'close' would then wait for the database itself, not for pg_ctl to exit.
      child.stdout.destroy(); child.stderr.destroy();
      finish(undefined, code ?? 1);
    });
    child.once('close', code => finish(undefined, code ?? 1));
  });
}

async function startupLog(logFile: string, offset: number) {
  const file = await open(logFile, 'r').catch(() => undefined);
  if (!file) return '';
  try {
    const { size } = await file.stat();
    const start = Math.max(offset, size - 8192);
    const bytes = Buffer.alloc(Math.max(0, size - start));
    await file.read(bytes, 0, bytes.length, start);
    return bytes.toString('utf8').trim();
  } finally { await file.close(); }
}

export async function postgresControl(databaseDir: string, logFile: string, timeoutSeconds = 30) {
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const binaries = await import(`@embedded-postgres/${platform}-${process.arch}`) as { pg_ctl: string };
  const directory = path.resolve(databaseDir);
  const run = (args: string[]) => runPostgresCommand(binaries.pg_ctl, [...args, '-D', directory], (timeoutSeconds + 10) * 1000);
  return {
    status: () => run(['status']),
    async start(port: number) {
      if ((await run(['status'])).code === 0) throw new Error('本地 PostgreSQL 已有进程运行但无法连接，请检查数据库连接配置，稍后重试。');
      const offset = (await stat(logFile).catch(() => undefined))?.size || 0;
      // pg_ctl detaches PostgreSQL from the console, preventing Ctrl+C from
      // interrupting the postmaster and its workers before a clean shutdown.
      const result = await run(['start', '-l', path.resolve(logFile), '-o', `-p ${port} -c listen_addresses=127.0.0.1`, '-w', '-t', String(timeoutSeconds)]);
      if (result.code !== 0) {
        const detail = await startupLog(logFile, offset) || result.output;
        throw new Error(`本地 PostgreSQL 启动失败：\n${detail}\n完整日志：${logFile}`);
      }
    },
    async stop() {
      // Idempotent: a previously exited server must never be waited on again.
      if ((await run(['status'])).code === 3) return;
      const result = await run(['stop', '-m', 'fast', '-w', '-t', String(timeoutSeconds)]);
      if (result.code !== 0 && (await run(['status'])).code !== 3) throw new Error(`本地 PostgreSQL 未能正常停止：${result.output}`);
    },
  };
}

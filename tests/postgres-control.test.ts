import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runPostgresCommand } from '../scripts/postgres-control.js';

test('PostgreSQL 控制命令提前退出或无法启动时立即结束等待', async () => {
  const failed = await runPostgresCommand(process.execPath, ['-e', 'process.stderr.write("startup failed"); process.exit(3)']);
  assert.equal(failed.code, 3); assert.match(failed.output, /startup failed/);
  await assert.rejects(runPostgresCommand('definitely-missing-postgres-control', []), /无法运行 PostgreSQL 控制工具/);
});

test('PostgreSQL 控制命令超时会报告明确错误，不遗留未完成等待', async () => {
  await assert.rejects(runPostgresCommand(process.execPath, ['-e', 'setInterval(()=>{},1000)'], 100), /控制命令超时/);
});

test('控制命令退出后不等待后台子进程继承的输出句柄', async () => {
  const code = `require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(()=>{},1500)'], { detached: true, windowsHide: true, stdio: 'inherit' }).unref(); process.exit(0);`;
  const result = await runPostgresCommand(process.execPath, ['-e', code], 1000);
  assert.equal(result.code, 0);
});

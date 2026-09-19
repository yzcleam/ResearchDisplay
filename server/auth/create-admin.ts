import { registerSchema } from '../../shared/contracts.js';
import { register } from './service.js';
import { pool } from '../db/index.js';
import { logger } from '../shared/logger.js';
const [email, real_name, institution] = process.argv.slice(2);
try {
  if (!process.env.ADMIN_PASSWORD) {
    throw new Error('未读取到 ADMIN_PASSWORD。请确认变量名没有反斜杠，并在同一个 PowerShell 窗口运行命令。');
  }
  const parsed = registerSchema.safeParse({ email, real_name, institution, password: process.env.ADMIN_PASSWORD });
  if (!parsed.success) {
    const reasons = [...new Set(parsed.error.issues.map(issue => {
      switch (issue.path[0]) {
        case 'email': return '邮箱格式不正确；邮箱地址中不要加入反斜杠。';
        case 'password': return '密码长度需为 10 至 128 位。';
        case 'real_name': return '真实姓名需为 2 至 80 个字。';
        case 'institution': return '所属单位需为 2 至 160 个字。';
        default: return '命令参数不正确，请按文档输入邮箱、姓名和单位。';
      }
    }))];
    throw new Error(reasons.join(' '));
  }
  await register(parsed.data, true);
  logger.info('管理员已创建。请清除 ADMIN_PASSWORD 环境变量。');
} catch (error) {
  const code = (error as { code?: string }).code;
  let reason: string;
  if (code === '23505') reason = '该邮箱已注册，请换一个未注册邮箱；现有账号可由管理员在“成员管理”中提升权限。';
  else if (['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', '57P01'].includes(code || '')) {
    reason = '数据库未连接。请先在另一个终端运行 npm start，保持服务运行后重试。';
  } else if (error instanceof Error && !code) reason = error.message;
  else reason = `数据库操作失败（代码 ${code || 'unknown'}），请检查数据库状态。`;
  logger.error({ reason }, '管理员创建失败');
  process.exitCode = 1;
}
finally { await pool.end(); }

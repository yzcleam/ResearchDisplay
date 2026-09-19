import 'dotenv/config';
import { z } from 'zod';
import path from 'node:path';
const env = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//), PORT: z.coerce.number().int().min(1).max(65535).default(3001), HOST: z.string().default('127.0.0.1'),
  APP_ORIGIN: z.url().default('http://localhost:5173'), STORAGE_DIR: z.string().default('./storage'),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'), TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  REGISTRATION_ENABLED: z.enum(['true', 'false']).default('true'), SESSION_DAYS: z.coerce.number().min(1).max(30).default(7),
  MAX_FILE_MB: z.coerce.number().int().min(1).max(100).default(25),
  CHROMIUM_EXECUTABLE_PATH: z.string().optional(), LOG_LEVEL: z.string().default('info'),
  REGISTRATION_INVITE_CODE: z.string().optional(), NODE_ENV: z.string().default('development'),
}).parse(process.env);
if (env.NODE_ENV === 'production' && (env.COOKIE_SECURE !== 'true' || !env.APP_ORIGIN.startsWith('https://'))) {
  throw new Error('生产环境必须使用 HTTPS APP_ORIGIN 和 COOKIE_SECURE=true');
}
export const config = { ...env, storage: path.resolve(env.STORAGE_DIR), secure: env.COOKIE_SECURE === 'true' };

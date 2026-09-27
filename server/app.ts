import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { checkDatabase } from './db/index.js';
import { handleRequestError } from './http/error-handler.js';
import { logRequest, validateRequestOrigin } from './http/request-middleware.js';
import { aiRouter } from './http/routes/ai.js';
import { authRouter, usersRouter } from './http/routes/auth.js';
import { dashboardRouter } from './http/routes/dashboard.js';
import { datasetsRouter } from './http/routes/datasets.js';
import { documentsRouter } from './http/routes/documents.js';
import { factorsRouter } from './http/routes/factors.js';
import { filesRouter } from './http/routes/files.js';
import { researchRouter } from './http/routes/research.js';
import { showcaseRouter } from './http/routes/showcase.js';
import { AppError } from './shared/errors.js';

/** 按请求处理顺序装配应用；业务规则在各功能目录中实现。 */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:', 'blob:'],
          'style-src': ["'self'", "'unsafe-inline'"],
          'upgrade-insecure-requests': config.secure ? [] : null,
        },
      },
      strictTransportSecurity: config.secure ? undefined : false,
    }),
  );
  app.use(logRequest);
  app.use(validateRequestOrigin);
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.get('/health', (_request, response) => response.json({ status: 'ok' }));
  app.get('/ready', async (_request, response) => {
    try {
      await checkDatabase();
      response.json({ status: 'ok', database: 'ok' });
    } catch {
      response.status(503).json({ status: 'unavailable' });
    }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/research', researchRouter);
  app.use('/api/factors', factorsRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/datasets', datasetsRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/showcase', showcaseRouter);
  app.use('/api', dashboardRouter);
  app.use('/api', (_request, _response, next) => next(new AppError(404, '接口不存在')));

  // API 的 404 必须先处理，避免返回前端 HTML。
  const frontendEntry = path.resolve('dist/index.html');
  if (existsSync(frontendEntry)) {
    app.use(express.static('dist'));
    app.get('/{*path}', (_request, response) => response.sendFile(frontendEntry));
  }
  app.use(handleRequestError);
  return app;
}

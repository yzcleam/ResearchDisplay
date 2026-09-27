import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';
import { AppError } from '../shared/errors.js';
import { logger } from '../shared/logger.js';

export const logRequest: RequestHandler = (request, response, next) => {
  request.requestId = randomUUID();
  response.setHeader('X-Request-ID', request.requestId);
  const startedAt = Date.now();
  response.on('finish', () => {
    logger.info(
      {
        requestId: request.requestId,
        method: request.method,
        path: request.path,
        status: response.statusCode,
        duration: Date.now() - startedAt,
      },
      'http',
    );
  });
  next();
};

/** 写请求必须来自配置的前端；文件预览等无 Origin 的只读请求仍可通过。 */
export const validateRequestOrigin: RequestHandler = (request, response, next) => {
  const origin = request.get('origin');
  if (origin && origin !== config.APP_ORIGIN) {
    return next(new AppError(403, '不允许的请求来源'));
  }
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Vary', 'Origin');
  }
  if (request.method === 'OPTIONS') {
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-CSRF-Token');
    response.status(204).end();
    return;
  }
  const isReadOnlyRequest = ['GET', 'HEAD'].includes(request.method);
  if (!isReadOnlyRequest && origin !== config.APP_ORIGIN) {
    return next(new AppError(403, '缺少有效的请求来源'));
  }
  next();
};

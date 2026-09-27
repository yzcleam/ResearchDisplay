import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { config } from '../config.js';
import { AppError } from '../shared/errors.js';
import { logger } from '../shared/logger.js';

/** 保留既有 API 错误格式；数据库错误只记录代码，避免泄露 SQL 和个人信息。 */
export const handleRequestError: ErrorRequestHandler = (
  error: unknown,
  request,
  response,
  next,
) => {
  if (response.headersSent) {
    return next(error);
  }
  if (error instanceof ZodError) {
    return response.status(400).json({
      message: '请检查输入内容',
      fields: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      requestId: request.requestId,
    });
  }
  if (error instanceof AppError) {
    return response.status(error.status).json({
      message: error.message,
      code: error.code,
      requestId: request.requestId,
    });
  }
  if (error instanceof multer.MulterError) {
    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? `单个文件不能超过 ${config.MAX_FILE_MB} MB`
        : '上传数量、字段或大小不符合要求';
    return response.status(400).json({ message });
  }
  const databaseCode = (error as { code?: string })?.code;
  if (databaseCode === '23505') {
    return response.status(409).json({ message: '邮箱、名称或记录已存在' });
  }
  if (databaseCode === '23503') {
    return response.status(409).json({ message: '关联记录已改变，请刷新后重试' });
  }
  if ((error as { type?: string })?.type === 'entity.too.large') {
    return response.status(413).json({ message: '提交内容过大，请通过插图按钮上传图片' });
  }
  if (error instanceof SyntaxError && 'body' in error) {
    return response.status(400).json({ message: '请求格式不正确' });
  }
  logger.error(
    {
      requestId: request.requestId,
      code: databaseCode || 'INTERNAL',
      errorType: error instanceof Error ? error.name : 'unknown',
    },
    '请求失败',
  );
  response
    .status(500)
    .json({ message: '服务暂时不可用，请稍后重试', requestId: request.requestId });
};

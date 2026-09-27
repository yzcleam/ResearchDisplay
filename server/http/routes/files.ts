import { Router } from 'express';
import multer from 'multer';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { fileRoles, sharingSchema } from '../../../shared/contracts.js';
import {
  fileContent,
  listSpaceFiles,
  listSpaceProjects,
} from '../../application/read-models/files.js';
import {
  changeFileSharing,
  deleteSpaceFile,
  uploadSpaceFiles,
} from '../../application/write-models/file-space.js';
import { assertUploadAllowed, uploadFiles } from '../../application/write-models/uploads.js';
import { config } from '../../config.js';
import { AppError } from '../../shared/errors.js';
import { authenticate } from '../authentication.js';

const temporaryDirectory = path.join(config.storage, 'tmp');
await mkdir(temporaryDirectory, { recursive: true });
const upload = multer({
  dest: temporaryDirectory,
  limits: { fileSize: config.MAX_FILE_MB * 1024 * 1024, files: 12, fields: 0, parts: 12 },
}).fields(
  fileRoles
    .filter((name) => name !== 'other')
    .map((name) => ({ name, maxCount: name === 'editor_image' ? 8 : 1 })),
);
const spaceUpload = multer({
  dest: temporaryDirectory,
  limits: { fileSize: config.MAX_FILE_MB * 1024 * 1024, files: 12, fields: 1, parts: 13 },
}).array('files', 12);

export const filesRouter = Router();
filesRouter.use(authenticate);
filesRouter.get('/space', async (_req, res) => {
  res.json(await listSpaceProjects());
});
filesRouter.get('/space/:id', async (req, res) => {
  res.json(await listSpaceFiles(z.uuid().parse(req.params.id), req.user));
});
filesRouter.post(
  '/space/:id',
  async (req, _res, next) => {
    await assertUploadAllowed(req.user, z.uuid().parse(req.params.id));
    next();
  },
  spaceUpload,
  async (req, res) => {
    const files = ((req.files as Express.Multer.File[]) || []).map((file) => ({
      fieldname: file.fieldname,
      originalname: file.originalname,
      path: file.path,
      size: file.size,
    }));
    let sharing: unknown;
    try {
      try {
        sharing = JSON.parse(String(req.body.sharing));
      } catch {
        throw new AppError(400, '共享权限格式无效');
      }
      res
        .status(201)
        .json(
          await uploadSpaceFiles(
            req.user,
            req.params.id as string,
            files,
            sharingSchema.parse(sharing),
          ),
        );
    } finally {
      await Promise.allSettled(files.map((file) => rm(file.path, { force: true })));
    }
  },
);
filesRouter.post(
  '/research/:id',
  async (req, _res, next) => {
    await assertUploadAllowed(req.user, z.uuid().parse(req.params.id));
    next();
  },
  upload,
  async (req, res) => {
    const files = (Object.values(req.files || {}).flat() as Express.Multer.File[]).map((file) => ({
      fieldname: file.fieldname,
      originalname: file.originalname,
      path: file.path,
      size: file.size,
    }));
    res.status(201).json(await uploadFiles(req.user, req.params.id as string, files));
  },
);
filesRouter.get('/:id/content', async (req, res) => {
  const file = await fileContent(z.uuid().parse(req.params.id), req.user);
  const disposition =
    req.query.download === '1' ||
    !['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.mimeType)
      ? 'attachment'
      : 'inline';
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Type', file.mimeType);
  res.setHeader(
    'Content-Disposition',
    `${disposition}; filename="download"; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
  );
  res.sendFile(file.absolutePath, { dotfiles: 'allow' });
});
filesRouter.patch('/:id/sharing', async (req, res) => {
  await changeFileSharing(req.user, z.uuid().parse(req.params.id), sharingSchema.parse(req.body));
  res.status(204).end();
});
filesRouter.delete('/:id', async (req, res) => {
  await deleteSpaceFile(req.user, z.uuid().parse(req.params.id));
  res.status(204).end();
});

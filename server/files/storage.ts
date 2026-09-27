import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { logger } from '../shared/logger.js';
import type { PreparedUpload } from './prepare-upload.js';

export function storedFilePath(storageKey: string) {
  return path.join(config.storage, 'objects', storageKey);
}

export function readStoredFile(storageKey: string) {
  return readFile(storedFilePath(storageKey));
}

/** 记录本次创建的对象；SQL 回滚后补偿删除，提交后只清理临时文件。 */
export class FileBatch {
  private readonly createdPaths: string[] = [];

  async moveUpload(file: PreparedUpload) {
    const destination = storedFilePath(file.storageKey);
    await mkdir(path.dirname(destination), { recursive: true });
    await rename(file.temporaryPath, destination);
    this.createdPaths.push(destination);
  }

  async writeGenerated(storageKey: string, bytes: Buffer) {
    const destination = storedFilePath(storageKey);
    await mkdir(path.dirname(destination), { recursive: true });
    const handle = await open(destination, 'wx');
    this.createdPaths.push(destination);
    try {
      await handle.writeFile(bytes);
    } finally {
      await handle.close();
    }
  }

  async rollback() {
    await removeFiles(this.createdPaths);
  }
}

async function removeFiles(paths: string[]) {
  const results = await Promise.allSettled(paths.map((filename) => rm(filename, { force: true })));
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error({ errorType: result.reason?.name ?? 'unknown' }, '临时文件清理失败');
    }
  }
}

export async function withFileBatch<T>(
  temporaryPaths: string[],
  task: (batch: FileBatch) => Promise<T>,
) {
  const batch = new FileBatch();
  try {
    return await task(batch);
  } catch (error) {
    await batch.rollback();
    throw error;
  } finally {
    // 清理失败不能把已经提交的操作变成失败响应，也不能删除已提交的对象。
    await removeFiles(temporaryPaths);
  }
}

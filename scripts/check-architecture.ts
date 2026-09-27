import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { inspectArchitecture } from './architecture-rules.js';

export async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const name = path.posix.join(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(name) : /\.tsx?$/.test(name) ? [name] : [];
    }),
  );
  return nested.flat();
}

const files = (await Promise.all(['server', 'client', 'shared'].map(sourceFiles))).flat();
const sources = new Map(
  await Promise.all(files.map(async (file) => [file, await readFile(file, 'utf8')] as const)),
);
const issues = inspectArchitecture(sources);
if (issues.length) {
  for (const issue of issues) {
    console.error(`${issue.file}:${issue.line} [${issue.rule}] ${issue.message}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `架构检查通过：${files.length} 个源码文件；模块入口、数据归属、只读查询与依赖方向符合约定。`,
  );
}

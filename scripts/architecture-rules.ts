import path from 'node:path';
import ts from 'typescript';
import { assertReadQuery, sqlTokens } from '../server/db/sql.js';

export const tableOwners: Record<string, string[]> = {
  auth: ['users', 'sessions'],
  factors: ['factor_types'],
  research: ['research_records'],
  files: ['file_mappings', 'file_share_recipients'],
  datasets: ['dataset_descriptions'],
  documents: ['pdf_jobs'],
  audit: ['upload_events'],
  ai: ['llm_settings'],
};
const features = new Set([
  'auth',
  'ai',
  'datasets',
  'documents',
  'factors',
  'members',
  'research',
  'space',
  'management',
  'showcase',
]);
// 读模型可以复用这些无写入行为的模块能力；新增项必须复审其实现。
const readCapabilities: Record<string, string[]> = {
  auth: ['assertAdministrator', 'resolveSession'],
  ai: ['aiStatus', 'getAiSettings'],
  documents: ['cleanDocument'],
  files: ['storedFilePath'],
};

function valueImports(node: ts.ImportDeclaration | ts.ExportDeclaration): string[] {
  if (isTypeOnly(node)) {
    return [];
  }
  const bindings = ts.isImportDeclaration(node)
    ? node.importClause?.namedBindings
    : node.exportClause;
  const names =
    bindings && (ts.isNamedImports(bindings) || ts.isNamedExports(bindings))
      ? bindings.elements
          .filter((item) => !item.isTypeOnly)
          .map((item) => (item.propertyName || item.name).text)
      : ['*'];
  if (ts.isImportDeclaration(node) && node.importClause?.name) {
    names.push('default');
  }
  return names;
}

export type ArchitectureIssue = { file: string; line: number; rule: string; message: string };

function sqlText(node: ts.Expression): string | undefined {
  if (ts.isStringLiteralLike(node)) {
    return node.text;
  }
  if (ts.isTemplateExpression(node)) {
    return (
      node.head.text +
      node.templateSpans.map((span) => '__expression__' + span.literal.text).join('')
    );
  }
  return undefined;
}

function isTypeOnly(node: ts.ImportDeclaration | ts.ExportDeclaration) {
  if (ts.isExportDeclaration(node)) {
    return node.isTypeOnly;
  }
  if (node.importClause?.isTypeOnly) {
    return true;
  }
  const names = node.importClause?.namedBindings;
  return (
    !node.importClause?.name &&
    names &&
    ts.isNamedImports(names) &&
    names.elements.every((name) => name.isTypeOnly)
  );
}

/** 检查源码依赖和 SQL 归属，不需要连接数据库。测试可传入虚拟文件验证规则。 */
export function inspectArchitecture(sources: Map<string, string>): ArchitectureIssue[] {
  const issues: ArchitectureIssue[] = [];
  const graph = new Map<string, string[]>();
  const modules = new Set(Object.keys(tableOwners));

  for (const [file, source] of sources) {
    const ast = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const [root, scope] = file.split('/');
    const business = root === 'server' && modules.has(scope);
    const projection = file.startsWith('server/application/read-models/');
    const repository = business && /(?:^|\/)\w*(?:-)?repository\.ts$/.test(file);
    const infrastructure = file.startsWith('server/db/');
    const dependencies: string[] = [];
    const guardedReaders = new Set<string>();
    const issue = (node: ts.Node, rule: string, message: string) =>
      issues.push({
        file,
        line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
        rule,
        message,
      });
    function resolve(specifier: string) {
      const base = path.posix
        .normalize(path.posix.join(path.posix.dirname(file), specifier))
        .replace(/\.js$/, '');
      return [base, base + '.ts', base + '.tsx', base + '/index.ts'].find((candidate) =>
        sources.has(candidate),
      );
    }
    function visit(node: ts.Node) {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isCallExpression(node.initializer) &&
        node.initializer.expression.getText(ast) === 'readDatabase'
      ) {
        guardedReaders.add(node.name.text);
      }
      const declaration =
        ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node : undefined;
      const specifier =
        declaration?.moduleSpecifier ||
        (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
          ? node.arguments[0]
          : undefined);
      if (specifier && ts.isStringLiteral(specifier)) {
        const name = specifier.text;
        if (business && ['express', 'multer'].includes(name)) {
          issue(node, 'transport-import', '业务模块不能依赖 HTTP 或 multipart 类型');
        }
        if (name === 'pg' && !infrastructure && !repository) {
          issue(node, 'database-import', '数据库驱动只允许在基础设施和模块仓储中使用');
        }
        if (name.startsWith('.')) {
          const target = resolve(name);
          if (target) {
            if (!declaration || !isTypeOnly(declaration)) {
              dependencies.push(target);
            }
            const [targetRoot, targetScope] = target.split('/');
            if (
              (root === 'client' && targetRoot === 'server') ||
              (root === 'server' && targetRoot === 'client')
            ) {
              issue(node, 'runtime-boundary', '客户端和服务端只能共享 shared 契约');
            }
            if (root === 'shared' && targetRoot !== 'shared') {
              issue(node, 'layer-direction', '共享契约不能反向依赖客户端或服务端');
            }
            if (
              business &&
              targetRoot === 'server' &&
              ((modules.has(targetScope) && targetScope !== scope) ||
                ['application', 'http', 'workers'].includes(targetScope))
            ) {
              issue(node, 'module-dependency', '业务模块不能直接依赖其他业务模块或上层协调代码');
            }
            if (
              !business &&
              root === 'server' &&
              modules.has(targetScope) &&
              target !== 'server/' + targetScope + '/index.ts'
            ) {
              issue(node, 'private-import', '跨模块调用必须经过 index.ts 公开入口');
            }
            if (
              root === 'server' &&
              scope === 'http' &&
              targetRoot === 'server' &&
              (modules.has(targetScope) || targetScope === 'db')
            ) {
              issue(node, 'http-boundary', 'HTTP 层只能调用应用读写模型，不能访问业务实现或数据库');
            }
            if (
              file.startsWith('server/application/') &&
              targetRoot === 'server' &&
              ['http', 'workers'].includes(targetScope)
            ) {
              issue(node, 'layer-direction', '应用层不能依赖 HTTP 或工作进程入口');
            }
            if (projection && target.startsWith('server/application/write-models/')) {
              issue(node, 'read-model-write', '读模型不能调用写模型');
            }
            if (
              projection &&
              targetRoot === 'server' &&
              modules.has(targetScope) &&
              (!declaration ||
                valueImports(declaration).some(
                  (name) => !readCapabilities[targetScope]?.includes(name),
                ))
            ) {
              issue(node, 'read-model-capability', '读模型只能引用已明确登记的只读模块能力或类型');
            }
            if (
              business &&
              file.endsWith('/index.ts') &&
              declaration &&
              ts.isExportDeclaration(declaration) &&
              (target.includes('repository') || !declaration.exportClause)
            ) {
              issue(
                node,
                'public-contract',
                '公开入口须显式列出业务能力，不能暴露仓储或使用星号导出',
              );
            }
            if (file === 'client/data/read-models.ts' && target === 'client/data/write-models.ts') {
              issue(node, 'read-model-write', '前端查询不能调用命令');
            }
            if (
              root === 'client' &&
              targetRoot === 'client' &&
              features.has(targetScope) &&
              targetScope !== scope &&
              target !== 'client/' + targetScope + '/index.ts'
            ) {
              issue(node, 'private-import', '前端跨功能引用必须经过 index.ts 公开入口');
            }
            if (
              root === 'client' &&
              features.has(scope) &&
              target.startsWith('client/application/')
            ) {
              issue(node, 'layer-direction', '功能组件不能反向依赖应用组合层');
            }
            if (
              file.startsWith('client/data/') &&
              targetRoot === 'client' &&
              features.has(targetScope)
            ) {
              issue(node, 'layer-direction', '前端读写模型不能依赖界面组件');
            }
          } else if (!/\.(css|png|svg)$/.test(name)) {
            issue(node, 'unresolved-import', '找不到本地依赖：' + name);
          }
        }
        if (
          root === 'client' &&
          !file.startsWith('client/data/') &&
          declaration &&
          ts.isImportDeclaration(declaration)
        ) {
          const bindings = declaration.importClause?.namedBindings;
          if (
            bindings &&
            ts.isNamedImports(bindings) &&
            bindings.elements.some((item) => (item.propertyName || item.name).text === 'api')
          ) {
            issue(node, 'frontend-api', '功能组件须调用 client/data 中的命名读写模型');
          }
        }
      }

      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'query' &&
        root === 'server'
      ) {
        if (!infrastructure && !repository && !projection) {
          issue(node, 'sql-location', 'SQL 只能位于模块仓储或应用读模型');
        }
        if (repository || projection) {
          const sql = node.arguments[0] && sqlText(node.arguments[0]);
          if (sql === undefined) {
            issue(node, 'dynamic-sql', '查询必须使用可检查的 SQL 字面量或模板');
          } else {
            if (projection) {
              try {
                assertReadQuery(sql);
              } catch {
                issue(node, 'read-model-write', '读模型包含写入、加锁或多语句 SQL');
              }
              const receiver = node.expression.expression;
              const guarded =
                (ts.isCallExpression(receiver) &&
                  receiver.expression.getText(ast) === 'readDatabase') ||
                (ts.isIdentifier(receiver) && guardedReaders.has(receiver.text));
              if (!guarded) {
                issue(node, 'read-model-bypass', '读模型必须通过 readDatabase 执行查询');
              }
            } else {
              const tokens = sqlTokens(sql);
              for (let index = 0; index < tokens.length - 1; index++) {
                if (
                  tokens[index].quoted ||
                  !['FROM', 'JOIN', 'INTO', 'UPDATE'].includes(tokens[index].value)
                ) {
                  continue;
                }
                if (tokens[index - 1]?.value === 'FOR' || tokens[index + 1].value === 'SET') {
                  continue;
                }
                let table = tokens[index + 1].value.toLowerCase();
                if (tokens[index + 2]?.value === '.') {
                  table = tokens[index + 3]?.value.toLowerCase();
                }
                if (!tableOwners[scope].includes(table)) {
                  issue(node, 'table-ownership', scope + ' 仓储不能访问表 ' + table);
                }
              }
            }
          }
        }
      }
      if (
        root === 'client' &&
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'fetch' &&
        file !== 'client/api.ts'
      ) {
        issue(node, 'frontend-api', '网络请求只能由统一客户端发送');
      }
      if (
        file === 'client/data/read-models.ts' &&
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'api' &&
        node.arguments[1]
      ) {
        const options = node.arguments[1];
        if (
          !ts.isObjectLiteralExpression(options) ||
          options.properties.some(
            (property) =>
              (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) ||
              property.name?.getText(ast) !== 'signal',
          )
        ) {
          issue(node, 'read-model-write', '前端查询只允许 GET 和取消信号，不接受请求体或方法覆盖');
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    graph.set(file, dependencies);
  }

  const visited = new Set<string>();
  const active = new Set<string>();
  function checkCycles(file: string, chain: string[]) {
    if (active.has(file)) {
      issues.push({
        file,
        line: 1,
        rule: 'dependency-cycle',
        message: [...chain.slice(chain.indexOf(file)), file].join(' → '),
      });
      return;
    }
    if (visited.has(file)) {
      return;
    }
    visited.add(file);
    active.add(file);
    for (const dependency of graph.get(file) || []) {
      checkCycles(dependency, [...chain, file]);
    }
    active.delete(file);
  }
  for (const file of graph.keys()) {
    checkCycles(file, []);
  }
  return issues;
}

/** SQL 边界检查使用的轻量词法扫描器；忽略注释和字面量，不改写实际 SQL。 */
export type SqlToken = { value: string; quoted: boolean };

export function sqlTokens(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  let index = 0;
  while (index < sql.length) {
    const rest = sql.slice(index);
    if (/^\s/.test(rest)) {
      index++;
    } else if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', index);
      index = end === -1 ? sql.length : end + 1;
    } else if (rest.startsWith('/*')) {
      let depth = 1;
      index += 2;
      while (index < sql.length && depth > 0) {
        if (sql.startsWith('/*', index)) {
          depth++;
          index += 2;
        } else if (sql.startsWith('*/', index)) {
          depth--;
          index += 2;
        } else {
          index++;
        }
      }
      if (depth) {
        throw new Error('SQL 注释未闭合');
      }
    } else if (sql[index] === "'" || sql[index] === '"') {
      const quote = sql[index++];
      const escaped = quote === "'" && /(^|\W)[eE]$/.test(sql.slice(0, index - 1));
      let value = '';
      let closed = false;
      while (index < sql.length) {
        const character = sql[index++];
        if (character === quote) {
          if (sql[index] === quote) {
            value += quote;
            index++;
          } else {
            closed = true;
            break;
          }
        } else if (escaped && character === '\\') {
          index++;
        } else {
          value += character;
        }
      }
      if (!closed) {
        throw new Error('SQL 字面量未闭合');
      }
      if (quote === '"') {
        tokens.push({ value: value.toUpperCase(), quoted: true });
      }
    } else {
      const dollarQuote = /^(\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$)/.exec(rest)?.[0];
      if (dollarQuote) {
        const end = sql.indexOf(dollarQuote, index + dollarQuote.length);
        if (end === -1) {
          throw new Error('SQL 字面量未闭合');
        }
        index = end + dollarQuote.length;
        continue;
      }
      const word = /^[A-Za-z_][A-Za-z_0-9$]*/.exec(rest)?.[0];
      if (word) {
        tokens.push({ value: word.toUpperCase(), quoted: false });
        index += word.length;
      } else {
        if (';().,'.includes(sql[index])) {
          tokens.push({ value: sql[index], quoted: false });
        }
        index++;
      }
    }
  }
  return tokens;
}

export function assertReadQuery(sql: string) {
  const tokens = sqlTokens(sql);
  if (tokens.at(-1)?.value === ';') {
    tokens.pop();
  }
  const words = tokens.filter((token) => !token.quoted).map((token) => token.value);
  const forbidden = new Set([
    'INSERT',
    'UPDATE',
    'DELETE',
    'MERGE',
    'INTO',
    'ALTER',
    'DROP',
    'CREATE',
    'TRUNCATE',
    'COPY',
    'CALL',
    'DO',
    'GRANT',
    'REVOKE',
    'LOCK',
    'SET',
  ]);
  const functions = new Set(['SET_CONFIG', 'NEXTVAL', 'SETVAL']);
  if (
    !['SELECT', 'WITH'].includes(words[0]) ||
    words.some((word) => forbidden.has(word) || word === ';') ||
    words.some((word, i) => word === 'FOR' && ['SHARE', 'KEY', 'NO'].includes(words[i + 1])) ||
    tokens.some((token) => token.value.startsWith('PG_ADVISORY_') || functions.has(token.value))
  ) {
    throw new Error('读模型只能执行无副作用的 SELECT 查询');
  }
}

import { Parser } from 'htmlparser2';
import { cleanDocument } from './sanitize.js';
export function documentText(html: string): string {
  let text = '';
  const blocks = new Set([
    'p',
    'br',
    'h1',
    'h2',
    'h3',
    'h4',
    'li',
    'blockquote',
    'tr',
    'td',
    'th',
    'pre',
    'hr',
  ]);
  const parser = new Parser(
    {
      ontext: (value) => {
        text += value;
      },
      onopentag: (tag) => {
        if (blocks.has(tag)) {
          text += '\n';
        }
      },
      onclosetag: (tag) => {
        if (blocks.has(tag)) {
          text += '\n';
        }
      },
    },
    { decodeEntities: true },
  );
  parser.write(cleanDocument(html));
  parser.end();
  return text
    .replace(/[\t \u00a0]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

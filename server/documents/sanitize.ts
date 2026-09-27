import sanitize from 'sanitize-html';
export const imagePathPattern = /^\/api\/files\/([0-9a-f-]{36})\/content$/;
export function cleanDocument(html: string) {
  return sanitize(html, {
    allowedTags: [
      'p',
      'br',
      'strong',
      'em',
      'u',
      's',
      'h1',
      'h2',
      'h3',
      'h4',
      'ul',
      'ol',
      'li',
      'blockquote',
      'hr',
      'img',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'pre',
      'code',
      'a',
    ],
    allowedAttributes: {
      img: ['src', 'alt', 'title'],
      a: ['href', 'title', 'target', 'rel'],
      th: ['colspan', 'rowspan'],
      td: ['colspan', 'rowspan'],
      p: ['style'],
      h1: ['style'],
      h2: ['style'],
      h3: ['style'],
    },
    allowedStyles: { '*': { 'text-align': [/^(left|right|center|justify)$/] } },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowProtocolRelative: false,
    exclusiveFilter: (frame) =>
      frame.tag === 'img' && !imagePathPattern.test(frame.attribs.src || ''),
    transformTags: {
      a: sanitize.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
    },
  });
}
export function imageIds(html: string) {
  return [...html.matchAll(/<img[^>]+src="\/api\/files\/([0-9a-f-]{36})\/content"/g)].map(
    (m) => m[1],
  );
}
export function escapeHtml(text: string) {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

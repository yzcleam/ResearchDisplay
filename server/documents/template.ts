import { escapeHtml } from './sanitize.js';

const DOCUMENT_STYLES = `
  @page { size: A4; margin: 22mm 19mm; }
  body {
    font-family: "Noto Sans CJK SC", "Microsoft YaHei", "SimSun", sans-serif;
    color: #22312e;
    font-size: 11pt;
    line-height: 1.85;
    overflow-wrap: anywhere;
  }
  header { border-bottom: 2px solid #276457; margin-bottom: 25px; padding-bottom: 18px; }
  header p { color: #547168; font-size: 10pt; margin: 0; }
  h1 { font-size: 23pt; line-height: 1.45; }
  h2 { font-size: 17pt; }
  h3 { font-size: 13pt; }
  h1, h2, h3, h4 { break-after: avoid; }
  img { max-width: 100%; max-height: 230mm; object-fit: contain; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  td, th { border: 1px solid #b7c8c2; padding: 8px; overflow-wrap: anywhere; }
  thead { display: table-header-group; }
  tr, img { break-inside: avoid; }
  blockquote {
    border-left: 3px solid #87a99b;
    padding: 6px 18px;
    margin-left: 0;
    background: #f1f6f3;
  }
  pre { white-space: pre-wrap; background: #f1f6f3; padding: 12px; }
  a { color: #276457; }
`;

export const PDF_FOOTER = `
  <div style="font-size:9px;color:#789087;width:100%;text-align:center">
    <span class="pageNumber"></span> / <span class="totalPages"></span>
  </div>
`;

/** bodyHtml 必须经过 cleanDocument 清理，并将授权插图转换为内嵌数据。 */
export function buildPdfHtml(title: string, label: string, bodyHtml: string) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <style>${DOCUMENT_STYLES}</style>
  </head>
  <body>
    <header>
      <p>研究成果资料库 · ${escapeHtml(label)}</p>
      <h1>${escapeHtml(title)}</h1>
    </header>
    <main>${bodyHtml}</main>
  </body>
</html>`;
}

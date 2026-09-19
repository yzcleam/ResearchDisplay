import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { pool } from '../db/index.js';
import { cleanDocument, escapeHtml, imageIds } from './sanitize.js';
import { AppError } from '../shared/errors.js';
export async function renderPdf(researchId:string,title:string,label:string,input:string) {
  let html=cleanDocument(input);
  for(const id of new Set(imageIds(html))) {
    const file=(await pool.query("SELECT * FROM file_mappings WHERE id=$1 AND research_id=$2 AND role='editor_image'",[id,researchId])).rows[0];
    if(!file) throw new AppError(400,'文档插图不存在');
    const bytes=await readFile(path.join(config.storage,'objects',file.storage_key));
    html=html.replaceAll(`/api/files/${id}/content`,`data:${file.mime_type};base64,${bytes.toString('base64')}`);
  }
  const browser=await chromium.launch({executablePath:config.CHROMIUM_EXECUTABLE_PATH||undefined,headless:true});
  const timer=setTimeout(()=>void browser.close(),60000);
  try {
    const context=await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block'});
    await context.route('**/*',route=>route.abort());
    const page=await context.newPage();
    await page.setContent(`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><style>
      @page{size:A4;margin:22mm 19mm}body{font-family:"Noto Sans CJK SC","Microsoft YaHei","SimSun",sans-serif;color:#22312e;font-size:11pt;line-height:1.85;overflow-wrap:anywhere}
      header{border-bottom:2px solid #276457;margin-bottom:25px;padding-bottom:18px}header p{color:#547168;font-size:10pt;margin:0}h1{font-size:23pt;line-height:1.45}h2{font-size:17pt}h3{font-size:13pt}h1,h2,h3,h4{break-after:avoid}img{max-width:100%;max-height:230mm;object-fit:contain}table{border-collapse:collapse;width:100%;table-layout:fixed}td,th{border:1px solid #b7c8c2;padding:8px;overflow-wrap:anywhere}thead{display:table-header-group}tr,img{break-inside:avoid}blockquote{border-left:3px solid #87a99b;padding:6px 18px;margin-left:0;background:#f1f6f3}pre{white-space:pre-wrap;background:#f1f6f3;padding:12px}a{color:#276457}
      </style></head><body><header><p>研究成果资料库 · ${escapeHtml(label)}</p><h1>${escapeHtml(title)}</h1></header><main>${html}</main></body></html>`,{waitUntil:'load',timeout:45000});
    // Wait for decoding, so the exported PDF does not omit embedded figures.
    await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.decode()));});
    return await page.pdf({format:'A4',printBackground:true,preferCSSPageSize:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font-size:9px;color:#789087;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'});
  } finally { clearTimeout(timer); await browser.close(); }
}

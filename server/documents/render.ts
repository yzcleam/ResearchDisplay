import { chromium } from 'playwright';
import { config } from '../config.js';
import { AppError } from '../shared/errors.js';
import { cleanDocument, imageIds } from './sanitize.js';
import { buildPdfHtml, PDF_FOOTER } from './template.js';

const BROWSER_TIMEOUT_MS = 60_000;
const PAGE_LOAD_TIMEOUT_MS = 45_000;

export type EmbeddedImage = { id: string; mimeType: string; bytes: Buffer };

function embedImages(input: string, images: EmbeddedImage[]) {
  let html = cleanDocument(input);
  for (const id of new Set(imageIds(html))) {
    const image = images.find((item) => item.id === id);
    if (!image) {
      throw new AppError(400, '文档插图不存在');
    }
    html = html.replaceAll(
      `/api/files/${id}/content`,
      `data:${image.mimeType};base64,${image.bytes.toString('base64')}`,
    );
  }
  return html;
}

export async function renderDocumentPdf(
  title: string,
  label: string,
  input: string,
  images: EmbeddedImage[],
) {
  const bodyHtml = embedImages(input, images);
  const browser = await chromium.launch({
    executablePath: config.CHROMIUM_EXECUTABLE_PATH || undefined,
    headless: true,
  });
  const timer = setTimeout(() => void browser.close(), BROWSER_TIMEOUT_MS);

  try {
    // PDF 只使用内嵌素材，不执行正文脚本，也不访问正文中的外部资源。
    const context = await browser.newContext({
      javaScriptEnabled: false,
      serviceWorkers: 'block',
    });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(buildPdfHtml(title, label, bodyHtml), {
      waitUntil: 'load',
      timeout: PAGE_LOAD_TIMEOUT_MS,
    });

    // 图片完成解码后再打印，避免生成的 PDF 丢失插图。
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.decode()));
    });

    return await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: PDF_FOOTER,
    });
  } finally {
    clearTimeout(timer);
    await browser.close();
  }
}

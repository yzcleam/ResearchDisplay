import { test } from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { cleanDocument, imageIds } from '../server/documents/sanitize.js';
import { validateFile } from '../server/files/validation.js';
import { registerSchema, researchSchema } from '../shared/contracts.js';
test('图文清理阻止脚本、远程图片、事件属性和内网资源地址', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const html = cleanDocument(
    `<h2>正文</h2><script>alert(1)</script><iframe src="http://127.0.0.1/"></iframe><img src="http://169.254.169.254/secret"><img src="/api/files/${id}/content" onerror="fetch('evil')"><a href="javascript:alert(1)">链接</a><p style="position:fixed;text-align:center">测试</p>`,
  );
  assert(!/script|iframe|169\.254|onerror|position:|javascript:/.test(html));
  assert.deepEqual(imageIds(html), [id]);
  assert.match(html, /text-align:center/);
  assert.match(html, /<h2>正文<\/h2>/);
});
test('拒绝伪装为 PDF、XLSX 的文件和不支持的图片', () => {
  assert.throws(() => validateFile(Buffer.from('not a pdf'), 'paper.pdf', 'manuscript'));
  assert.throws(() => validateFile(Buffer.from('<svg></svg>'), 'figure.svg', 'editor_image'));
  const zip = new AdmZip();
  zip.addFile('payload.txt', Buffer.from('text'));
  assert.throws(() => validateFile(zip.toBuffer(), 'data.xlsx', 'dataset'));
  assert.throws(() => validateFile(zip.toBuffer(), 'images.zip', 'image_pack'));
});
test('XLSX 校验识别工作簿与工作表，拒绝宏', () => {
  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from('<Types/>'));
  zip.addFile('xl/workbook.xml', Buffer.from('<workbook/>'));
  zip.addFile('xl/worksheets/sheet1.xml', Buffer.from('<worksheet/>'));
  assert.equal(
    validateFile(zip.toBuffer(), 'data.xlsx', 'dataset'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  zip.addFile('xl/vbaProject.bin', Buffer.from('macro'));
  assert.throws(() => validateFile(zip.toBuffer(), 'data.xlsx', 'dataset'));
});
test('注册不接受权限字段，研究类型限制三选一', () => {
  const data = {
    email: 'NAME@example.org',
    real_name: '研究成员',
    institution: '课题组',
    password: 'LongPassword123',
  };
  assert.equal(registerSchema.parse(data).email, 'name@example.org');
  assert.throws(() => registerSchema.parse({ ...data, role: 'admin' }));
  assert.throws(() => registerSchema.parse({ ...data, real_name: '', password: '123' }));
  assert.throws(() => researchSchema.parse({ research_type: '非法类型' }));
});

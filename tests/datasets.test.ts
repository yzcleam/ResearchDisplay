import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseDataset } from '../server/datasets/parse.js';
import { validateUploadedFile } from '../server/files/rar.js';
import { datasetDescriptionSchema, suggestPanelRole } from '../shared/datasets.js';
import { workbookBytes, rarBytes } from './helpers/datasets.js';

test('解析所有工作表，保留文本编号，识别数值、日期与公式缓存，忽略尾部空格式', async () => {
  const bytes = await workbookBytes(
    [
      ['city_id', 'Year', 'GDP', 'date', 'ratio', 'mixed'],
      ['001', 2024, 120.5, new Date('2024-01-01'), { formula: 'C2/2', result: 60.25 }, 1],
      ['002', 2025, null, new Date('2025-01-01'), 62, '缺失'],
    ],
    (book) => {
      book.getWorksheet(1)!.getCell('Z100').font = { bold: true };
      book.addWorksheet('补充表').addRows([
        ['province', 'value'],
        ['北京', 0],
      ]);
      book.addWorksheet('空白');
    },
  );
  const parsed = await parseDataset(bytes);
  assert.equal(parsed.fields.length, 8);
  assert.equal(parsed.row_count, 3);
  assert.equal(parsed.sheets.length, 2);
  assert.deepEqual(
    parsed.fields.slice(0, 6).map((field) => field.data_type),
    ['文本型', '数值型', '数值型', '文本型', '数值型', '文本型'],
  );
  assert.deepEqual(
    parsed.fields.slice(0, 4).map((field) => field.suggested_panel_role),
    ['individual', 'time', 'general', 'time'],
  );
  assert(parsed.warnings.some((message) => /缺失值/.test(message)));
  assert(parsed.warnings.some((message) => /混有文本/.test(message)));
  assert(parsed.warnings.some((message) => /空白/.test(message)));
  assert.equal(new Set(parsed.fields.map((field) => field.key)).size, 8);
});

test('拒绝空行、缺失或重复表头、表外数据、合并单元格和孤立数据，并定位工作表/单元格', async () => {
  const cases: [unknown[][], RegExp][] = [
    [[['city', 'value'], ['北京', 1], [], ['上海', 2]], /第 3 行为空行/],
    [
      [
        ['city', null],
        ['北京', 1],
      ],
      /B1 缺少文本表头/,
    ],
    [
      [
        ['year', ' YEAR '],
        [2024, 2025],
      ],
      /表头「YEAR」重复/,
    ],
    [
      [
        ['city', 'value'],
        ['北京', 1, null, 99],
      ],
      /C1 缺少文本表头/,
    ],
    [
      [
        ['a', 'b', 'c'],
        [1, null, 1],
        [null, 9, null],
        [1, null, 1],
      ],
      /B3 是孤立单元格/,
    ],
    [[[], ['city', 'value'], ['北京', 1]], /第 1 行缺少表头/],
    [[['city', 'value']], /没有数据行/],
  ];
  for (const [rows, error] of cases) {
    await assert.rejects(
      parseDataset(await workbookBytes(rows as Parameters<typeof workbookBytes>[0])),
      error,
    );
  }
  await assert.rejects(
    parseDataset(
      await workbookBytes(
        [
          ['city', 'value'],
          ['北京', 1],
        ],
        (book) => book.getWorksheet(1)!.mergeCells('A1:B1'),
      ),
    ),
    /合并单元格/,
  );
  await assert.rejects(
    parseDataset(await workbookBytes([['x'], [{ formula: '1+1' }]])),
    /公式没有计算结果/,
  );
  await assert.rejects(
    parseDataset(await workbookBytes([['x'], [{ error: '#DIV/0!' }]])),
    /Excel 错误值/,
  );
  await assert.rejects(parseDataset(await workbookBytes([])), /没有可用的数据表/);
});

test('字段标识推荐与说明长度、唯一标识校验，包括英文缩写', () => {
  for (const name of ['ID', 'city_code', 'province', '城市', '省份']) {
    assert.equal(suggestPanelRole(name), 'individual');
  }
  for (const name of ['TIME', 'year', 'date', '年份']) {
    assert.equal(suggestPanelRole(name), 'time');
  }
  assert.equal(suggestPanelRole('GDP'), 'general');
  const field = {
    key: '1:1',
    panel_role: 'general',
    chinese_name: 'GDP',
    explanation: '国内生产总值，单位为亿元。',
    source: '中国城市统计年鉴',
  };
  assert(datasetDescriptionSchema.safeParse({ revision: 0, fields: [field] }).success);
  for (const [key, max] of [
    ['chinese_name', 10],
    ['source', 20],
    ['explanation', 100],
  ] as const) {
    assert(
      datasetDescriptionSchema.safeParse({
        revision: 0,
        fields: [{ ...field, [key]: '字'.repeat(max) }],
      }).success,
    );
    assert(
      !datasetDescriptionSchema.safeParse({
        revision: 0,
        fields: [{ ...field, [key]: '字'.repeat(max + 1) }],
      }).success,
    );
  }
  for (const panel_role of ['time', 'individual']) {
    assert(
      !datasetDescriptionSchema.safeParse({
        revision: 0,
        fields: [
          { ...field, panel_role },
          { ...field, key: '1:2', panel_role },
        ],
      }).success,
    );
  }
  assert(!datasetDescriptionSchema.safeParse({ revision: 0, fields: [field, field] }).success);
});

test('读取真实 RAR 图片内容，拒绝伪装、损坏、非图片与不安全路径', async () => {
  const png = await readFile('tests/fixtures/research-figure.png');
  const valid = rarBytes([{ name: 'figures/figure.png', bytes: png }]);
  assert.equal(
    await validateUploadedFile(valid, 'images.rar', 'image_pack'),
    'application/vnd.rar',
  );
  await assert.rejects(
    validateUploadedFile(Buffer.from('fake'), 'images.rar', 'image_pack'),
    /有效的 RAR/,
  );
  await assert.rejects(
    validateUploadedFile(valid.subarray(0, 20), 'images.rar', 'image_pack'),
    /损坏|文件数量/,
  );
  await assert.rejects(
    validateUploadedFile(
      rarBytes([{ name: 'figure.png', bytes: Buffer.from('not an image') }]),
      'images.rar',
      'image_pack',
    ),
    /无效的图片/,
  );
  await assert.rejects(
    validateUploadedFile(
      rarBytes([{ name: '../figure.png', bytes: png }]),
      'images.rar',
      'image_pack',
    ),
    /不安全的路径/,
  );
  await assert.rejects(
    validateUploadedFile(
      rarBytes([{ name: 'notes.txt', bytes: Buffer.from('text') }]),
      'images.rar',
      'image_pack',
    ),
    /只能包含/,
  );
});

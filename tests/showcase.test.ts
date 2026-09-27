import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  graphLayout,
  roundedPath,
  CORE_X,
  CORE_WIDTH,
  COLUMN_X,
  NODE_WIDTH,
} from '../client/showcase/layout.js';
import type { ShowcaseGroup, ShowcaseStudy } from '../shared/showcase.js';

const study = (id: string, length: number): ShowcaseStudy => ({
  id,
  title: '测试研究',
  factor_type_id: 'capital',
  research_type: '要素集聚',
  updated_at: '2026-09-20',
  mechanism_summary: '字'.repeat(length),
  impact_summary: '影响摘要',
  risk_summary: '风险摘要',
  policy_summary: '政策摘要',
});
test('图谱按同一研究串联影响、风险和政策，仅机制与影响连接要素，分组互不重叠', () => {
  const groups: ShowcaseGroup[] = [
    {
      id: 'capital',
      name: '资本',
      active: true,
      total: 2,
      items: [study('first', 200), study('second', 5000)],
    },
    { id: 'empty', name: '土地', active: true, total: 0, items: [] },
  ];
  const layout = graphLayout(groups);
  assert.equal(layout.edges.length, 8);
  assert.equal(layout.blocks.length, 2);
  const first = layout.blocks[0];
  assert(first.rows[0].y + first.rows[0].height < first.rows[1].y);
  assert.equal(
    first.coreY,
    graphLayout([{ ...groups[0], items: groups[0].items.slice(0, 1) }]).blocks[0].coreY,
    '展开研究时核心节点不应移出首屏',
  );
  assert(first.y + first.height <= layout.blocks[1].y);
  assert(layout.height > layout.blocks[1].y + layout.blocks[1].height);
  assert.equal(
    layout.edges.filter((edge) => edge.start.x === CORE_X + CORE_WIDTH || edge.end.x === CORE_X)
      .length,
    first.rows.length * 2,
  );
  for (const edge of layout.edges) {
    assert(!/NaN|Infinity/.test(edge.path));
    assert(edge.start.x < edge.end.x);
    const row = first.rows.find((row) => row.study.id === edge.studyId)!;
    assert(row);
    if (edge.section === 'mechanism') {
      assert.equal(edge.end.x, CORE_X);
    } else if (edge.section === 'impact') {
      assert.equal(edge.start.x, CORE_X + CORE_WIDTH);
    } else {
      assert.equal(
        edge.start.x,
        COLUMN_X[edge.section === 'risk' ? 'impact' : 'risk'] + NODE_WIDTH,
      );
      assert.equal(edge.start.y, row.y + row.height / 2);
      assert.equal(edge.end.y, edge.start.y, '链式连线不得跨行连接其他研究');
    }
    assert.equal(
      edge.section === 'mechanism' ? edge.start.x : edge.end.x,
      COLUMN_X[edge.section] + (edge.section === 'mechanism' ? NODE_WIDTH : 0),
    );
  }
});
test('圆角折线处理重复点及短折角，空图谱仍有可用画布', () => {
  assert.equal(
    roundedPath([
      { x: 1, y: 1 },
      { x: 1, y: 1 },
    ]),
    '',
  );
  const path = roundedPath([
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 4 },
    { x: 20, y: 4 },
  ]);
  assert.match(path, /^M 0 0/);
  assert.match(path, /Q/);
  assert.match(path, /L 20 4$/);
  assert(!path.includes('NaN'));
  assert(graphLayout([]).height >= 440);
});

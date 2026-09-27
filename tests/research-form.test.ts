import test from 'node:test';
import assert from 'node:assert/strict';
import { toResearchInput } from '../client/research/form.js';
import { researchSchema } from '../shared/contracts.js';

test('研究表单只提交可编辑字段，并清理经济数据名称的空行', () => {
  const loadedRecord = {
    id: 'server-generated-id',
    owner_id: 'server-owner',
    version: 7,
    files: [{ id: 'private-file-metadata' }],
    title: '城市资本配置',
    research_type: '要素集聚' as const,
    factor_type_id: 'ce563780-b4ad-4804-873b-46a8b1f51470',
    economic_data_names: ['旧名称'],
    mechanism_summary: '集聚机制',
    impact_summary: '经济影响',
    risk_summary: '潜在风险',
    policy_summary: '政策建议',
  };

  const input = toResearchInput(loadedRecord, ' 地区生产总值 \n\n就业人数\r\n  ');
  assert.deepEqual(input.economic_data_names, ['地区生产总值', '就业人数']);
  assert.deepEqual(researchSchema.parse(input), input);
  for (const serverOnlyField of ['id', 'owner_id', 'version', 'files']) {
    assert.equal(serverOnlyField in input, false);
  }
  assert.deepEqual(loadedRecord.economic_data_names, ['旧名称']);
});

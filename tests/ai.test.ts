import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AI_SUMMARY_MAX_LENGTH, aiGenerateSchema, aiSettingsSchema, type AiSettings } from '../shared/ai.js';
import { researchSchema, sections } from '../shared/contracts.js';
import { documentText, validateSuggestions } from '../server/ai/service.js';
import { callModel } from '../server/ai/provider.js';
import { mockLlm } from './helpers/llm.js';

const current = { title: '', research_type: '其他', factor_type_id: '', economic_data_names: [], mechanism_summary: '', impact_summary: '', risk_summary: '', policy_summary: '' };
const input = aiGenerateSchema.parse({ mode: 'research', current });
test('AI 原文提取保留段落和表格边界，排除脚本、图片地址与 HTML 属性', () => {
  const text = documentText('<h2>研究 &amp; 数据</h2><p>GDP &lt; 100</p><script>secret</script><style>secret</style><img src="https://secret.example/img"><table><tr><td>城市</td><td>年份</td></tr><tr><td>北京</td><td>2024</td></tr></table>');
  assert.equal(text, '研究 & 数据\n\nGDP < 100\n\n城市\n\n年份\n\n北京\n\n2024');
  assert(!/secret|https|<h2/.test(text));
});
test('LLM 建议校验拒绝虚构分类、超长字段和未知字段，单篇摘要隔离输出', () => {
  const factor = '11111111-1111-4111-8111-111111111111';
  assert.throws(() => validateSuggestions({ research_type: '虚构类别' }, input, [factor]));
  assert.throws(() => validateSuggestions({ factor_type_id: factor }, input, []));
  assert.throws(() => validateSuggestions({ impact_summary: '字'.repeat(1001) }, input, []));
  assert.throws(() => validateSuggestions({ html: '<script>evil</script>' }, input, []));
  assert.throws(() => validateSuggestions({ title: null, notes: ['原文不足'] }, input, []));
  const result = validateSuggestions({ title: '不应填入的题目', mechanism_summary: '对应摘要', impact_summary: '其他摘要', notes: ['核对原文'] }, { ...input, mode: 'section', section: 'mechanism', html: '<p>原文</p>' }, []);
  assert.deepEqual(result.suggestions, { mechanism_summary: '对应摘要' });
  assert.deepEqual(result.notes, ['核对原文']);
});
test('LLM 输入及设置边界拒绝缺少章节、超长原文、含凭据的地址', () => {
  assert(!aiGenerateSchema.safeParse({ ...input, summary_length: 400 }).success);
  assert(!aiGenerateSchema.safeParse({ ...input, mode: 'section' }).success);
  assert(!aiGenerateSchema.safeParse({ ...input, source_text: '字'.repeat(60001) }).success);
  for (const base_url of ['', 'not-a-url', 'file:///private', 'http://user:password@example.com', 'https://example.com?api_key=secret']) assert(!aiSettingsSchema.safeParse({ enabled: true, base_url, model: 'test', json_mode: true, timeout_seconds: 60, revision: 0 }).success);
});
test('四类摘要统一限制 200 字符，边界输出均满足对应字段保存规则', () => {
  assert.equal(AI_SUMMARY_MAX_LENGTH, 200);
  for (const section of sections) {
    const key = `${section}_summary` as const;
    const value = '字'.repeat(198) + '。 ';
    const result = validateSuggestions({ [key]: value }, input, []);
    assert(researchSchema.shape[key].safeParse(result.suggestions[key]).success);
    assert.equal(result.suggestions[key], value.trim());
    assert.equal(validateSuggestions({ [key]: '字'.repeat(200) }, input, []).suggestions[key]?.length, 200);
    assert.throws(() => validateSuggestions({ [key]: '字'.repeat(201) }, input, []), /最多 200 字/);
    // Emoji use two UTF-16 units, matching textarea maxlength and save validation.
    assert.throws(() => validateSuggestions({ [key]: '字'.repeat(199) + '😀' }, input, []), /最多 200 字/);
  }
});
test('真实 HTTP 模拟接口：JSON 模式、兼容响应、错误脱敏、截断和超时', async () => {
  const mock = await mockLlm();
  const settings: AiSettings & { api_key: string } = { enabled: true, base_url: mock.url, model: 'test-model', json_mode: true, timeout_seconds: 10, revision: 1, has_api_key: true, api_key: 'test-only-key' };
  try {
    assert.deepEqual(await callModel(settings, 'JSON test', 'hello'), { ok: true });
    assert.equal(mock.state.requests[0].url, '/v1/chat/completions');
    assert.equal(mock.state.requests[0].authorization, 'Bearer test-only-key');
    assert.equal(mock.state.requests[0].body.response_format?.type, 'json_object');
    mock.state.content = '```json\n{"ok":true}\n```';
    assert.deepEqual(await callModel({ ...settings, json_mode: false }, 'JSON test', 'hello'), { ok: true });
    assert.equal(mock.state.requests[1].body.response_format, undefined);
    mock.state.status = 401;
    await assert.rejects(callModel(settings, '', ''), error => { assert(error instanceof Error); assert.match(error.message, /认证/); assert(!error.message.includes('PRIVATE')); return true; });
    mock.state.status = 200; mock.state.content = 'not json';
    await assert.rejects(callModel(settings, '', ''), /约定格式/);
    mock.state.finish = 'length';
    await assert.rejects(callModel(settings, '', ''), /截断/);
    mock.state.finish = 'stop'; mock.state.content = 'x'.repeat(270000);
    await assert.rejects(callModel(settings, '', ''), /过大/);
    mock.state.content = '{"ok":true}'; mock.state.delay = 200;
    await assert.rejects(callModel({ ...settings, timeout_seconds: 0.05 }, '', ''), /超时/);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(callModel(settings, '', '', controller.signal), /取消/);
  } finally { await mock.close(); }
});

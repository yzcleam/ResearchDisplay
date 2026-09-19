import { AppError } from '../shared/errors.js';
import type { AiSettings } from '../../shared/ai.js';

export async function callModel(settings: AiSettings & { api_key: string }, system: string, user: string, signal?: AbortSignal): Promise<unknown> {
  const timeout = AbortSignal.timeout(settings.timeout_seconds * 1000);
  try {
    const response = await fetch(`${settings.base_url.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST', redirect: 'error', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.api_key}` },
      body: JSON.stringify({ model: settings.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], stream: false,
        ...(settings.json_mode ? { response_format: { type: 'json_object' } } : {}) }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      const message = response.status === 401 || response.status === 403 ? '模型服务拒绝认证，请检查 API Key 和模型权限' : response.status === 429 ? '模型服务额度不足或请求过于频繁，请稍后重试' : response.status === 404 ? '模型或接口不存在，请检查模型名称和接口基础地址' : response.status === 400 ? '模型不接受当前请求，请检查模型名称，或在 LLM 设置中关闭 JSON 模式后重试' : '模型服务暂时不可用，请稍后重试';
      throw new AppError(502, `${message}（HTTP ${response.status}）`);
    }
    const reader = response.body?.getReader(); if (!reader) throw new AppError(502, '模型返回了空响应');
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 262144) { await reader.cancel(); throw new AppError(502, '模型返回内容过大，请更换模型或缩短输入'); } chunks.push(value); }
    let envelope: { choices?: { finish_reason?: string; message?: { content?: string; refusal?: string } }[] };
    try { envelope = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new AppError(502, '模型接口返回的内容不是有效 JSON'); }
    if (!envelope || !Array.isArray(envelope.choices)) throw new AppError(502, '模型接口返回的响应格式不符合 Chat Completions 约定');
    const choice = envelope.choices[0];
    if (choice?.finish_reason === 'length') throw new AppError(502, '模型输出被截断，请缩短输入或更换模型后重试');
    if (choice?.message?.refusal || typeof choice?.message?.content !== 'string' || !choice.message.content.trim()) throw new AppError(502, '模型未生成可用内容，请调整原文后重试');
    const content = choice.message.content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { return JSON.parse(content); } catch { throw new AppError(502, '模型未返回约定格式，请重试或启用 JSON 模式'); }
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (signal?.aborted) throw new AppError(499, '已取消生成');
    if (timeout.aborted) throw new AppError(504, '模型生成超时，请缩短输入或调整 LLM 超时时间');
    throw new AppError(502, '无法连接模型服务，请检查接口地址和服务器网络');
  }
}

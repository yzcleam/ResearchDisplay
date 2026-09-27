import { FloppyDisk, PlugsConnected, Sparkle } from '@phosphor-icons/react';
import { useEffect, useState, type FormEvent } from 'react';
import { aiSettingsSchema, type AiSettings as Settings } from '../../shared/ai';
import { errorMessage } from '../api';
import { Alert, Field, Loading } from '../components';
import { queries } from '../data/read-models';
import { commands } from '../data/write-models';

export function AiSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [key, setKey] = useState('');
  const [clear, setClear] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function load() {
    setError('');
    try {
      setSettings(await queries.aiSettings());
      setKey('');
      setClear(false);
      setDirty(false);
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  useEffect(() => {
    void load();
  }, []);
  function edit<K extends keyof Settings>(field: K, value: Settings[K]) {
    setSettings((old) => old && { ...old, [field]: value });
    setDirty(true);
    setNotice('');
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) {
      return;
    }
    const { has_api_key, ...values } = settings;
    void has_api_key;
    const parsed = aiSettingsSchema.safeParse({ ...values, api_key: key, clear_api_key: clear });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join('；'));
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setSettings(await commands.saveAiSettings(parsed.data));
      setKey('');
      setClear(false);
      setDirty(false);
      setNotice('配置已保存。可点击“测试连接”检查接口和模型。');
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await commands.testAi();
      setNotice(result.message);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">RESEARCH ASSISTANT</span>
          <h1>LLM 设置</h1>
          <p>为课题组配置长文整理与摘要服务。</p>
        </div>
        <Sparkle size={32} weight="light" />
      </div>
      <Alert>{error}</Alert>
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      {!settings ? (
        <>
          <Loading />
          <button className="secondary" onClick={() => void load()}>
            重新加载
          </button>
        </>
      ) : (
        <form className="paper-panel ai-settings" onSubmit={save}>
          <fieldset disabled={busy}>
            <label className="ai-check">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(event) => edit('enabled', event.target.checked)}
              />
              启用课题组智能填充
            </label>
            <Field
              label="接口基础地址"
              hint="使用兼容 OpenAI Chat Completions 的服务。填写到 /v1 等基础路径，系统会追加 /chat/completions。"
            >
              <input
                type="url"
                required
                value={settings.base_url}
                onChange={(event) => edit('base_url', event.target.value)}
                placeholder="https://api.openai.com/v1"
              />
            </Field>
            <div className="form-grid">
              <Field label="模型名称" hint="填写服务商提供、当前账号有权限使用的模型 ID。">
                <input
                  required
                  maxLength={200}
                  value={settings.model}
                  onChange={(event) => edit('model', event.target.value)}
                  placeholder="填写模型 ID"
                />
              </Field>
              <Field label="请求超时（秒）" hint="允许 10–180 秒。较长原文可适当增加。">
                <input
                  type="number"
                  min={10}
                  max={180}
                  required
                  value={settings.timeout_seconds}
                  onChange={(event) => edit('timeout_seconds', Number(event.target.value))}
                />
              </Field>
            </div>
            <Field
              label="API Key"
              hint={
                settings.has_api_key
                  ? '已保存密钥，留空表示保留。更换服务地址时需要重新填写。'
                  : '填写模型服务的 API Key；仅保存在服务器端，保存后不再显示。'
              }
            >
              <input
                type="password"
                autoComplete="new-password"
                maxLength={4096}
                value={key}
                onChange={(event) => {
                  setKey(event.target.value);
                  setClear(false);
                  setDirty(true);
                  setNotice('');
                }}
                placeholder={settings.has_api_key ? '已保存 · 输入新密钥可替换' : '输入 API Key'}
              />
            </Field>
            {settings.has_api_key && (
              <label className="ai-check">
                <input
                  type="checkbox"
                  checked={clear}
                  onChange={(event) => {
                    setClear(event.target.checked);
                    setKey('');
                    setDirty(true);
                    if (event.target.checked) {
                      edit('enabled', false);
                    }
                  }}
                />
                清除已保存的密钥并停用
              </label>
            )}
            <label className="ai-check">
              <input
                type="checkbox"
                checked={settings.json_mode}
                onChange={(event) => edit('json_mode', event.target.checked)}
              />
              请求 JSON 模式（如服务商不支持，可关闭）
            </label>
            <p className="ai-help">
              成员点击生成时，所选研究文本会发送给此服务。测试连接只发送一条固定测试消息。
            </p>
          </fieldset>
          <div className="panel-footer">
            <span className="small muted">
              {dirty ? '有未保存的配置，请先保存再测试' : settings.enabled ? '已启用' : '已停用'}
            </span>
            <div className="actions">
              <button
                type="button"
                className="ghost"
                disabled={busy}
                onClick={() => {
                  if (!dirty || confirm('重新加载将放弃未保存的配置，继续吗？')) {
                    void load();
                  }
                }}
              >
                重新加载
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy || dirty || !settings.has_api_key}
                onClick={() => void test()}
              >
                <PlugsConnected size={17} />
                测试连接
              </button>
              <button className="primary" disabled={busy}>
                <FloppyDisk size={17} />
                {busy ? '正在处理…' : '保存配置'}
              </button>
            </div>
          </div>
        </form>
      )}
    </>
  );
}

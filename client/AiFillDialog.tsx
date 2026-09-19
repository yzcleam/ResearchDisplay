import { useEffect, useRef, useState } from 'react';
import { Sparkle, X, Check, CircleNotch } from '@phosphor-icons/react';
import { AI_SUMMARY_MAX_LENGTH, aiFieldLabels, type AiResult, type AiStatus } from '../shared/ai';
import { sectionLabels, type Factor, type ResearchInput, type Section } from '../shared/contracts';
import { api, errorMessage } from './api';
import { Alert, Field } from './components';

type Props = { researchId?: string; current: ResearchInput; factors: Factor[]; section?: Section; html?: string; onClose: () => void; onApply: (values: Partial<ResearchInput>) => void };
export function AiFillDialog({ researchId, current, factors, section, html, onClose, onApply }: Props) {
  const dialog = useRef<HTMLDialogElement>(null), request = useRef<AbortController | null>(null), results = useRef<HTMLElement>(null);
  const [status, setStatus] = useState<AiStatus | null>(null), [source, setSource] = useState('');
  const [result, setResult] = useState<AiResult | null>(null), [selected, setSelected] = useState<(keyof ResearchInput)[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => { const element = dialog.current!; element.showModal(); const controller = new AbortController(); api<AiStatus>('/ai/status', { signal: controller.signal }).then(setStatus).catch(error => { if (!controller.signal.aborted) setError(errorMessage(error)); }); return () => { controller.abort(); request.current?.abort(); element.close(); }; }, []);
  useEffect(() => { if (result) results.current?.scrollIntoView({ block: 'start' }); }, [result]);
  function showValue(key: keyof ResearchInput, value: ResearchInput[keyof ResearchInput] | undefined) { return key === 'factor_type_id' ? factors.find(factor => factor.id === value)?.name || String(value || '') : Array.isArray(value) ? value.join('、') : value || ''; }
  async function generate() {
    const controller = new AbortController(); request.current = controller; setBusy(true); setError(''); setResult(null); setSelected([]);
    try {
      const response = await api<AiResult>('/ai/generate', { method: 'POST', signal: controller.signal, body: JSON.stringify({ research_id: researchId, mode: section ? 'section' : 'research', section, html, current, source_text: source }) });
      if (!controller.signal.aborted) { setResult(response); setSelected((Object.keys(response.suggestions) as (keyof ResearchInput)[]).filter(key => !current[key]?.length)); }
    } catch (error) { if (!controller.signal.aborted) setError(errorMessage(error)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  function cancel() { request.current?.abort(); setBusy(false); }
  function apply() { if (!result) return; const values = Object.fromEntries(selected.map(key => [key, result.suggestions[key]])); onApply(values); onClose(); }
  return <dialog ref={dialog} className="dataset-dialog ai-dialog" aria-labelledby="ai-dialog-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div className="ai-dialog-layout"><header className="dataset-dialog-header"><div><span className="eyebrow">AI RESEARCH ASSISTANT</span><h2 id="ai-dialog-title"><Sparkle size={23} />{section ? `${sectionLabels[section]}智能摘要` : '智能填充与摘要'}</h2><p>依据已有原文整理建议，选择需要的内容后填入表单。</p></div><button type="button" className="icon-button" aria-label="关闭智能填充" onClick={onClose}><X size={22} /></button></header>
      <div className="dataset-dialog-body">
        <div className="ai-source-info"><strong>{section ? '当前编辑器中的说明正文' : '当前基本信息与已保存的四类图文说明'}</strong><p>{section ? '包含尚未保存的文字。生成摘要后，说明原稿继续保留。' : '可直接使用已填写的摘要和图文长文，也可在下方补充原文。图文编辑器的改动请先保存。'}仅发送文字，不读取上传的 PDF、图片或数据文件。</p></div>
        <Alert>{error}</Alert>
        {status && !status.ready && <div className="alert" role="status">{status.message}</div>}
        {!section && <Field label="补充研究原文（可选）" hint="仅用于本次生成，不自动保存。总原文最多 60,000 字。"><textarea rows={5} maxLength={60000} disabled={busy} value={source} onChange={event => setSource(event.target.value)} placeholder="可粘贴论文摘要、研究结论或其他已写好的研究长文…" /></Field>}
        <div className="ai-generate-row"><span className="small muted">四类摘要统一为每项 {AI_SUMMARY_MAX_LENGTH} 字以内</span><button type="button" className="primary" disabled={busy || !status?.ready} onClick={() => void generate()}>{busy ? <CircleNotch size={18} className="spin" /> : <Sparkle size={18} />}{busy ? '正在生成建议…' : result ? '重新生成' : '一键生成建议'}</button>{busy && <button type="button" className="ghost" onClick={cancel}>取消生成</button>}</div>
        <p className="ai-help">{status?.ready ? `使用 ${status.model} · 文本发送至 ${status.provider_host}。` : '模型由管理员统一配置。'}生成内容请结合原文核对。</p>
        {result && <section ref={results} className="ai-results" aria-label="智能填充建议"><div className="ai-results-heading"><h3>选择要填入的内容</h3><span>已有值默认不勾选 · 本次读取 {result.input_chars.toLocaleString()} 字</span></div>
          {(Object.keys(result.suggestions) as (keyof ResearchInput)[]).map(key => <div className={`ai-suggestion ${selected.includes(key) ? 'selected' : ''}`} key={key}><label className="ai-check"><input type="checkbox" checked={selected.includes(key)} onChange={event => setSelected(old => event.target.checked ? [...old, key] : old.filter(item => item !== key))} /><strong>{aiFieldLabels[key]}</strong><span>{current[key]?.length ? '将替换已有内容' : '填充空白'}</span></label><p>{showValue(key, result.suggestions[key])}</p>{!!current[key]?.length && <details><summary>查看当前内容</summary><p>{showValue(key, current[key])}</p></details>}</div>)}
          {!!result.notes.length && <div className="ai-notes"><strong>原文与生成提示</strong><ul>{result.notes.map((note, index) => <li key={index}>{note}</li>)}</ul></div>}
        </section>}
      </div><footer className="dataset-dialog-footer"><span className="small muted">填入后仍可编辑，请在基本信息页保存研究资料。</span><div className="actions"><button type="button" className="secondary" onClick={onClose}>关闭</button><button type="button" className="primary" disabled={busy || !selected.length} onClick={apply}><Check size={17} />填入所选{selected.length ? `（${selected.length}）` : ''}</button></div></footer>
    </div>
  </dialog>;
}

import { useEffect, useRef, useState } from 'react';
import { ArrowSquareOut, DownloadSimple, FilePdf, X } from '@phosphor-icons/react';
import { sections, type Section } from '../../shared/contracts';
import { showcaseLabels, type ShowcaseDetail } from '../../shared/showcase';
import { api, errorMessage, fileUrl } from '../api';
import { date, size } from '../components';

export function ResearchReader({ id, section, onClose }: { id: string; section: Section; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), body = useRef<HTMLDivElement>(null), closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readerInteracted = useRef(false);
  const [data, setData] = useState<ShowcaseDetail | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0), [closing, setClosing] = useState(false), [active, setActive] = useState(section);
  useEffect(() => { const element = dialog.current!; element.showModal(); return () => { element.close(); if (closeTimer.current) clearTimeout(closeTimer.current); }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError('');
    api<ShowcaseDetail>(`/showcase/research/${id}`, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setData(value); }).catch(error => { if (!controller.signal.aborted) setError(errorMessage(error)); });
    return () => controller.abort();
  }, [id, retry]);
  function goTo(target: Section, smooth = true) {
    setActive(target); const element = body.current?.querySelector<HTMLElement>(`[data-section="${target}"]`);
    if (element && body.current) body.current.scrollTo({ top: body.current.scrollTop + element.getBoundingClientRect().top - body.current.getBoundingClientRect().top - 24, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' });
  }
  useEffect(() => {
    if (!data) return;
    let cancelled = false; readerInteracted.current = false;
    const frame = requestAnimationFrame(() => goTo(section, false));
    // Earlier chapters can grow as their images load; keep the selected chapter aligned.
    const images = Array.from(body.current?.querySelectorAll('img') || []);
    void Promise.all(images.map(image => image.decode().catch(() => {}))).then(() => { if (!cancelled && !readerInteracted.current) goTo(section, false); });
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [data, section]);
  function close() { if (closing) return; setClosing(true); closeTimer.current = setTimeout(onClose, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220); }
  return <dialog ref={dialog} className={`research-reader${closing ? ' is-closing' : ''}`} aria-labelledby="reader-title" onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === dialog.current) { const bounds = dialog.current.getBoundingClientRect(); if (event.clientX > bounds.right || event.clientX < bounds.left) close(); } }}>
    <div className="reader-layout"><header className="reader-heading"><div><span className="reader-eyebrow">RESEARCH INSIGHT</span><span className="reader-kicker">{data?.factor_name || '研究全文'}{data && ` / ${data.research_type}`}</span><h2 id="reader-title">{data?.title || '正在打开研究资料…'}</h2>{data && <p>{data.owner_name}<span>更新于 {date(data.updated_at)}</span></p>}</div><button className="reader-close" aria-label="关闭研究全文" onClick={close}><X size={20} /></button></header>
      <nav className="reader-nav" aria-label="全文章节">{sections.map(key => <button key={key} className={active === key ? 'active' : ''} aria-current={active === key ? 'location' : undefined} onClick={() => { readerInteracted.current = true; goTo(key); }} disabled={!data}>{showcaseLabels[key]}</button>)}</nav>
      <div className="reader-body" ref={body} aria-live="polite" onWheel={() => { readerInteracted.current = true; }} onTouchStart={() => { readerInteracted.current = true; }} onKeyDown={() => { readerInteracted.current = true; }}>
        {error ? <div className="reader-error" role="alert"><p>{error}</p><button className="secondary" onClick={() => setRetry(value => value + 1)}>重新加载全文</button></div> : !data ? <div className="reader-skeleton" role="status" aria-label="正在读取研究全文"><i /><i /><i /><i /><i /></div> : <>
          {sections.map((key, index) => {
            const content = data.sections[key], hasHtml = !!content.html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').trim() || /<(img|table)\b/.test(content.html);
            return <section key={key} data-section={key} className={`reader-section reader-${key}`}><div className="reader-section-title"><span>0{index + 1}</span><h3>{showcaseLabels[key]}</h3></div>
              {hasHtml ? <div className="research-prose" dangerouslySetInnerHTML={{ __html: content.html }} /> : <div className="reader-missing">{content.summary && <><span>研究摘要</span><p>{content.summary}</p></>}<p className="reader-muted">尚未保存可在线阅读的图文全文。{content.pdf ? '可打开已归档的说明 PDF。' : '可在后台的“图文说明”中补充。'}</p></div>}
              {content.pdf && <a className="reader-document-link" href={fileUrl(content.pdf.id)} target="_blank" rel="noopener noreferrer"><FilePdf size={17} />查看{showcaseLabels[key]} PDF<ArrowSquareOut size={14} /></a>}
            </section>;
          })}
          <section className="reader-paper"><FilePdf size={29} weight="light" /><h3>进一步了解这一研究工作？</h3>{data.manuscript ? <><p>{data.manuscript.original_name}<small>PDF · {size(data.manuscript.size_bytes)}</small></p><div><a href={fileUrl(data.manuscript.id)} target="_blank" rel="noopener noreferrer" className="paper-preview"><ArrowSquareOut size={17} />预览</a><a href={fileUrl(data.manuscript.id, true)} download={data.manuscript.original_name} className="paper-download"><DownloadSimple size={17} />下载</a></div></> : <p>论文原稿尚未上传。</p>}</section>
          <footer className="reader-end">研序 · 课题组研究成果</footer>
        </>}
      </div>
    </div>
  </dialog>;
}

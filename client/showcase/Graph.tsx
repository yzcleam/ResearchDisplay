import { memo, useMemo, useRef, useState, useEffect, type PointerEvent } from 'react';
import { ArrowUpRight, ArrowsOutSimple, Minus, Plus, Pause, Play } from '@phosphor-icons/react';
import { sections, type Section } from '../../shared/contracts';
import { showcaseLabels, type ShowcaseGroup } from '../../shared/showcase';
import { COLUMN_X, CORE_WIDTH, CORE_X, GRAPH_WIDTH, NODE_WIDTH, graphLayout, type GraphEdge } from './layout';

const Edge = memo(function Edge({ edge, enabled, selected, onOpen }: { edge: GraphEdge; enabled: boolean; selected: boolean; onOpen: () => void }) {
  const [hovered, setHovered] = useState(false);
  return <g className={`showcase-edge${hovered ? ' is-hovered' : ''}${selected ? ' is-selected' : ''}`} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocus={() => setHovered(true)} onBlur={() => setHovered(false)}>
    <path d={edge.path} className="edge-line" /><path d={edge.path} className="edge-hit" role="button" tabIndex={0} aria-label={`查看${showcaseLabels[edge.section]}关联研究`} onClick={onOpen} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(); } }} />
    <circle cx={edge.end.x} cy={edge.end.y} r="3" className="edge-port" />
    {hovered && enabled && [0, 0.75, 1.5].map(delay => <circle key={delay} r="3.2" className="edge-particle"><animateMotion dur="2.25s" begin={`${delay}s`} repeatCount="indefinite" path={edge.path} /></circle>)}
  </g>;
});

export function ResearchGraph({ groups, loadingMore, moreErrors, onMore, onOpen }: { groups: ShowcaseGroup[]; loadingMore: Set<string>; moreErrors: Record<string, string>; onMore: (id: string) => void; onOpen: (id: string, section: Section) => void }) {
  const layout = useMemo(() => graphLayout(groups), [groups]), viewport = useRef<HTMLDivElement>(null), manualZoom = useRef(false);
  const [zoom, setZoom] = useState(1), [motion, setMotion] = useState(true), [reduced, setReduced] = useState(false), [highlighted, setHighlighted] = useState<string | null>(null);
  const drag = useRef<{ pointer: number; x: number; y: number; left: number; top: number } | null>(null);
  useEffect(() => { const query = matchMedia('(prefers-reduced-motion: reduce)'); const update = () => setReduced(query.matches); update(); query.addEventListener('change', update); return () => query.removeEventListener('change', update); }, []);
  useEffect(() => { const element = viewport.current!; const observer = new ResizeObserver(() => { if (!manualZoom.current) setZoom(element.clientWidth < 760 ? 1 : Math.max(0.5, Math.min(1, (element.clientWidth - 32) / GRAPH_WIDTH))); }); observer.observe(element); return () => observer.disconnect(); }, []);
  function zoomTo(value: number) {
    const element = viewport.current!, next = Math.max(0.5, Math.min(1.5, value));
    const center = { x: (element.scrollLeft + element.clientWidth / 2) / zoom, y: (element.scrollTop + element.clientHeight / 2) / zoom };
    manualZoom.current = true; setZoom(next);
    requestAnimationFrame(() => { element.scrollLeft = center.x * next - element.clientWidth / 2; element.scrollTop = center.y * next - element.clientHeight / 2; });
  }
  function fit() { manualZoom.current = false; const element = viewport.current!; setZoom(Math.max(0.5, Math.min(1, (element.clientWidth - 32) / GRAPH_WIDTH))); element.scrollTo({ top: 0, left: 0 }); }
  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || event.button !== 0 || (event.target as Element).closest('button,a,.showcase-edge')) return;
    const element = event.currentTarget; drag.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop }; element.setPointerCapture(event.pointerId); element.classList.add('is-dragging');
  }
  function endDrag(event: PointerEvent<HTMLDivElement>) { if (drag.current?.pointer === event.pointerId) { drag.current = null; event.currentTarget.classList.remove('is-dragging'); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); } }
  return <div className="graph-shell">
    <div className="graph-viewport" ref={viewport} tabIndex={0} aria-label="研究成果关系画布，可拖动画布或使用方向键滚动" onPointerDown={startDrag} onPointerMove={event => { const value = drag.current; if (!value) return; event.currentTarget.scrollLeft = value.left - event.clientX + value.x; event.currentTarget.scrollTop = value.top - event.clientY + value.y; }} onPointerUp={endDrag} onPointerCancel={endDrag}>
      <div className="graph-space" style={{ width: GRAPH_WIDTH * zoom, height: layout.height * zoom }}><div className="graph-canvas" style={{ width: GRAPH_WIDTH, height: layout.height, transform: `scale(${zoom})` }}>
        <div className="graph-column-title mechanism-column" style={{ left: COLUMN_X.mechanism, width: NODE_WIDTH }}><i /><span>产生机制</span><small>MECHANISM</small></div>
        <div className="graph-column-title core-column" style={{ left: CORE_X, width: CORE_WIDTH }}><span>要素</span><small>FACTOR</small></div>
        {(['impact', 'risk', 'policy'] as const).map(section => <div className={`graph-column-title ${section}-column`} key={section} style={{ left: COLUMN_X[section], width: NODE_WIDTH }}><i /><span>{showcaseLabels[section]}</span><small>{({ impact: 'ECONOMIC IMPACT', risk: 'POTENTIAL RISK', policy: 'POLICY' })[section]}</small></div>)}
        <svg className="graph-connections" width={GRAPH_WIDTH} height={layout.height} aria-label="研究节点之间的关联线">{layout.edges.map(edge => <Edge key={edge.id} edge={edge} enabled={motion && !reduced} selected={highlighted === edge.studyId} onOpen={() => onOpen(edge.studyId, edge.section)} />)}</svg>
        {layout.blocks.map((block, index) => <div key={block.group.id} className="factor-group" data-factor={block.group.id}>
          <div className="factor-group-caption" style={{ top: block.y, left: 32 }}><span>{String(index + 1).padStart(2, '0')}</span><span>{block.group.total} 项研究{!block.group.active ? ' · 已停用分类的历史成果' : ''}</span></div>
          <div className="factor-core" style={{ top: block.coreY - 40, left: CORE_X, width: CORE_WIDTH }} title={block.group.name}>{block.group.name}</div>
          {!block.rows.length && <p className="factor-empty" style={{ top: block.coreY - 14, left: COLUMN_X.impact }}>该要素的研究成果尚待归档</p>}
          {block.rows.flatMap(row => sections.map(section => <button type="button" key={`${row.study.id}-${section}`} className={`research-node node-${section}${highlighted === row.study.id ? ' is-related' : ''}`} data-study={row.study.id} data-section={section} style={{ left: COLUMN_X[section], top: row.y, width: NODE_WIDTH, height: row.height }} onMouseEnter={() => setHighlighted(row.study.id)} onMouseLeave={() => setHighlighted(null)} onFocus={() => setHighlighted(row.study.id)} onBlur={() => setHighlighted(null)} onClick={() => onOpen(row.study.id, section)} aria-label={`${showcaseLabels[section]}：${row.study.title}`}>
            <h3>{row.study.title}</h3><p style={{ flexShrink: 0, WebkitLineClamp: Math.max(4, Math.floor((row.height - 128) / 22)) }}>{row.study[`${section}_summary`] || '摘要尚待补充，点击查看研究全文。'}</p><span className="node-footer"><span>阅读研究全文</span><ArrowUpRight size={16} /></span>
          </button>))}
          {block.group.items.length < block.group.total && <div className="factor-more" style={{ top: block.y + block.height - 44, left: COLUMN_X.impact, width: 680 }}><button type="button" onClick={() => onMore(block.group.id)} disabled={loadingMore.has(block.group.id)}>{loadingMore.has(block.group.id) ? '正在展开…' : `展开更多${block.group.name}研究（已显示 ${block.group.items.length} / ${block.group.total}）`}</button>{moreErrors[block.group.id] && <span role="alert">{moreErrors[block.group.id]}</span>}</div>}
          <div className="factor-divider" style={{ top: block.y + block.height - 4 }} />
        </div>)}
      </div></div>
    </div>
    <div className="graph-tools" aria-label="画布工具"><button aria-label="缩小画布" onClick={() => zoomTo(zoom - 0.1)} disabled={zoom <= 0.5}><Minus size={17} /></button><output aria-label="画布缩放比例">{Math.round(zoom * 100)}%</output><button aria-label="放大画布" onClick={() => zoomTo(zoom + 0.1)} disabled={zoom >= 1.5}><Plus size={17} /></button><span /><button aria-label="适应画布宽度" title="适应宽度" onClick={fit}><ArrowsOutSimple size={18} /></button><span /><button aria-label={motion ? '关闭连线动画' : '开启连线动画'} aria-pressed={motion && !reduced} disabled={reduced} title={reduced ? '已遵循系统减少动态效果设置' : '悬停连线时播放动画'} onClick={() => setMotion(value => !value)}>{motion && !reduced ? <Pause size={17} /> : <Play size={17} />}</button></div>
    <div className="graph-hint">拖动画布 · 点击节点阅读 · 悬停连线查看流向</div>
  </div>;
}

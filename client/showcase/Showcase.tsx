import {
  ArrowClockwise,
  ArrowRight,
  Books,
  MagnifyingGlass,
  SignOut,
  SquaresFour,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { researchTypes, type Factor, type Section, type User } from '../../shared/contracts';
import type { ShowcaseOverview } from '../../shared/showcase';
import { appHome, errorMessage } from '../api';
import { queries } from '../data/read-models';
import { ResearchGraph } from './Graph';
import { ResearchReader } from './Reader';
import './showcase.css';

export function Showcase({
  user,
  factors,
  onManage,
  onLogout,
}: {
  user: User;
  factors: Factor[];
  onManage: () => void;
  onLogout: () => Promise<void>;
}) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [factor, setFactor] = useState('');
  const [type, setType] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<ShowcaseOverview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState<Set<string>>(new Set());
  const [moreErrors, setMoreErrors] = useState<Record<string, string>>({});
  const [reader, setReader] = useState<{ id: string; section: Section } | null>(null);
  const pages = useRef<Record<string, number>>({});
  const pending = useRef(new Map<string, AbortController>());
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 280);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    pending.current.forEach((value) => value.abort());
    pending.current.clear();
    pages.current = {};
    setLoadingMore(new Set());
    setMoreErrors({});
    setLoading(true);
    setError('');
    const parameters = new URLSearchParams({ q: query });
    if (factor) {
      parameters.set('factor', factor);
    }
    if (type) {
      parameters.set('type', type);
    }
    queries
      .showcase(parameters, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setData(value);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(error));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => {
      controller.abort();
      pending.current.forEach((value) => value.abort());
      pending.current.clear();
    };
  }, [query, factor, type, refresh]);
  async function more(id: string) {
    if (pending.current.has(id)) {
      return;
    }
    const controller = new AbortController();
    pending.current.set(id, controller);
    setLoadingMore((old) => new Set(old).add(id));
    setMoreErrors((old) => ({ ...old, [id]: '' }));
    const page = (pages.current[id] || 1) + 1;
    const parameters = new URLSearchParams({ q: query, page: String(page) });
    if (type) {
      parameters.set('type', type);
    }
    try {
      const value = await queries.showcasePage(id, parameters, controller.signal);
      if (controller.signal.aborted) {
        return;
      }
      pages.current[id] = page;
      setData(
        (old) =>
          old && {
            ...old,
            groups: old.groups.map((group) =>
              group.id === id
                ? {
                    ...group,
                    total: value.total,
                    items: [
                      ...new Map(
                        [...group.items, ...value.items].map((item) => [item.id, item]),
                      ).values(),
                    ],
                  }
                : group,
            ),
          },
      );
    } catch (error) {
      if (!controller.signal.aborted) {
        setMoreErrors((old) => ({ ...old, [id]: errorMessage(error) }));
      }
    } finally {
      if (!controller.signal.aborted) {
        pending.current.delete(id);
        setLoadingMore((old) => {
          const next = new Set(old);
          next.delete(id);
          return next;
        });
      }
    }
  }
  return (
    <div className="showcase-app">
      <header className="showcase-header">
        <a
          className="showcase-brand"
          href={appHome}
          onClick={(event) => {
            event.preventDefault();
            setSearch('');
            setQuery('');
            setFactor('');
            setType('');
            setRefresh((value) => value + 1);
          }}
        >
          <span>
            <Books size={25} weight="light" />
          </span>
          <strong>
            研序<small>RESEARCH ATLAS</small>
          </strong>
        </a>
        <span className="showcase-header-caption">课题组研究成果</span>
        <div className="showcase-header-actions">
          <span className="showcase-user">{user.real_name}</span>
          <button className="showcase-manage" onClick={onManage}>
            <SquaresFour size={17} />
            进入后台管理系统
            <ArrowRight size={15} />
          </button>
          <button
            className="showcase-signout"
            aria-label="退出登录"
            title="退出登录"
            onClick={() => void onLogout()}
          >
            <SignOut size={19} />
          </button>
        </div>
      </header>
      <main className="showcase-main">
        <div className="showcase-intro">
          <div>
            <span className="showcase-eyebrow">FACTORS · EVIDENCE · INSIGHTS</span>
            <h1>研究成果图谱</h1>
            <p>围绕要素，呈现研究的机制、影响、风险与政策建议。</p>
          </div>
          <div className="showcase-counts" aria-label="展示概览">
            <span>
              <strong>{loading ? '—' : data?.groups.length || 0}</strong>类要素
            </span>
            <i />
            <span>
              <strong>{loading ? '—' : data?.total || 0}</strong>项研究
            </span>
          </div>
        </div>
        <div className="showcase-filters">
          <label className="showcase-search">
            <MagnifyingGlass size={18} />
            <input
              aria-label="搜索研究成果"
              maxLength={200}
              placeholder="搜索研究题目…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <select
            aria-label="展示要素类型"
            value={factor}
            onChange={(event) => setFactor(event.target.value)}
          >
            <option value="">全部要素</option>
            {factors
              .filter((item) => item.active || item.research_count > 0)
              .map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                  {item.active ? '' : '（历史）'}
                </option>
              ))}
          </select>
          <select
            aria-label="展示研究类型"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">全部研究类型</option>
            {researchTypes.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
          <button
            className="showcase-refresh"
            aria-label="刷新研究图谱"
            title="刷新研究图谱"
            onClick={() => setRefresh((value) => value + 1)}
            disabled={loading}
          >
            <ArrowClockwise size={19} />
          </button>
          <span className="showcase-filter-note">
            <i />
            与研究资料库同步
          </span>
        </div>
        {loading ? (
          <div className="graph-loading" role="status" aria-label="正在加载研究图谱">
            <div />
            <div />
            <div />
            <div />
            <div />
            <p>正在汇集研究成果…</p>
          </div>
        ) : error ? (
          <div className="showcase-empty" role="alert">
            <h2>暂时无法读取研究成果</h2>
            <p>{error}</p>
            <button onClick={() => setRefresh((value) => value + 1)}>重新加载</button>
          </div>
        ) : data?.groups.length ? (
          <ResearchGraph
            groups={data.groups}
            loadingMore={loadingMore}
            moreErrors={moreErrors}
            onMore={(id) => void more(id)}
            onOpen={(id, section) => setReader({ id, section })}
          />
        ) : (
          <div className="showcase-empty">
            <Books size={40} weight="light" />
            <h2>{query || factor || type ? '没有找到匹配的研究' : '从第一项研究，开始连接发现'}</h2>
            <p>
              {query || factor || type
                ? '尝试更换题目关键词，或调整要素和研究类型。'
                : '在后台设置要素类型、归档研究资料后，这里将自动生成成果图谱。'}
            </p>
            {query || factor || type ? (
              <button
                onClick={() => {
                  setSearch('');
                  setQuery('');
                  setFactor('');
                  setType('');
                }}
              >
                清除筛选
              </button>
            ) : (
              <button onClick={onManage}>
                进入后台管理系统
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        )}
      </main>
      {reader && (
        <ResearchReader
          key={reader.id}
          id={reader.id}
          section={reader.section}
          onClose={() => setReader(null)}
        />
      )}
    </div>
  );
}

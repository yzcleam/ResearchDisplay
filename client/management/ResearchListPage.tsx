import {
  ArrowUpRight,
  Books,
  Database,
  Files,
  FolderOpen,
  MagnifyingGlass,
  Plus,
} from '@phosphor-icons/react';
import { researchTypes, type Factor } from '../../shared/contracts';
import { Empty, Loading, date } from '../components';

import type { DashboardStats, ResearchListing } from '../../shared/views';
export type { DashboardStats, ResearchListing } from '../../shared/views';
export type ResearchFilters = {
  q: string;
  query: string;
  type: string;
  factor: string;
  mine: boolean;
  page: number;
};
type Props = {
  stats: DashboardStats;
  listing: ResearchListing;
  filters: ResearchFilters;
  factors: Factor[];
  loading: boolean;
  onCreate: () => void;
  onOpen: (researchId: string) => Promise<void>;
  onSearchChange: (value: string) => void;
  onResearchTypeChange: (value: string) => void;
  onFactorChange: (value: string) => void;
  onOnlyMineChange: (value: boolean) => void;
  onPageChange: (page: number) => void;
};

export function ResearchListPage({
  stats,
  listing,
  filters,
  factors,
  loading,
  onCreate,
  onOpen,
  onSearchChange,
  onResearchTypeChange,
  onFactorChange,
  onOnlyMineChange,
  onPageChange,
}: Props) {
  const {
    q: searchText,
    query: debouncedSearch,
    type: researchTypeFilter,
    factor: factorFilter,
    mine: onlyMyResearch,
    page,
  } = filters;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">RESEARCH WORKSPACE</span>
          <h1>研究资料</h1>
          <p>汇集研究成果，连接数据与发现。</p>
        </div>
        <button className="primary" onClick={() => onCreate()}>
          <Plus size={19} />
          新建研究成果
        </button>
      </div>
      <section className="overview-strip" aria-label="资料概览">
        {[
          { label: '研究成果', value: stats.research, unit: '项', icon: Books },
          { label: '归档文件', value: stats.files, unit: '份', icon: Files },
          { label: '要素类型', value: stats.factors, unit: '类', icon: Database },
          { label: '我的研究', value: stats.mine, unit: '项', icon: FolderOpen },
        ].map((s, i) => (
          <div className="stat" key={s.label}>
            <div className="stat-label">
              {s.label}
              <s.icon size={19} weight="light" />
            </div>
            <div>
              <strong>{String(s.value).padStart(2, '0')}</strong>
              <span>{s.unit}</span>
            </div>
            <small>
              {
                ['课题组的共同积累', '当前版本的研究材料', '启用的研究分类', '由您创建的研究成果'][
                  i
                ]
              }
            </small>
          </div>
        ))}
      </section>
      <section className="research-section">
        <div className="section-top">
          <div className="listing-tabs">
            <button
              className={!onlyMyResearch ? 'active' : ''}
              onClick={() => {
                onOnlyMineChange(false);
              }}
            >
              全部成果 <span>{stats.research}</span>
            </button>
            <button
              className={onlyMyResearch ? 'active' : ''}
              onClick={() => {
                onOnlyMineChange(true);
              }}
            >
              我的研究 <span>{stats.mine}</span>
            </button>
          </div>
          <span className="small muted">最近更新优先</span>
        </div>
        <div className="filters">
          <div className="search-input">
            <MagnifyingGlass size={19} />
            <input
              aria-label="搜索研究题目"
              value={searchText}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="搜索研究题目…"
            />
          </div>
          <select
            aria-label="筛选研究类型"
            value={researchTypeFilter}
            onChange={(e) => {
              onResearchTypeChange(e.target.value);
            }}
          >
            <option value="">全部研究类型</option>
            {researchTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select
            aria-label="筛选要素类型"
            value={factorFilter}
            onChange={(e) => {
              onFactorChange(e.target.value);
            }}
          >
            <option value="">全部要素类型</option>
            {factors.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>
        {loading ? (
          <Loading />
        ) : listing.items.length ? (
          <div className="table-scroll">
            <table className="research-table">
              <thead>
                <tr>
                  <th>研究题目</th>
                  <th>研究分类</th>
                  <th>创建人</th>
                  <th>归档文件</th>
                  <th>更新时间</th>
                  <th>
                    <span className="sr-only">操作</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {listing.items.map((r, i) => (
                  <tr key={r.id}>
                    <td>
                      <button className="title-link" onClick={() => void onOpen(r.id)}>
                        <span className="row-index">
                          {String((page - 1) * 20 + i + 1).padStart(2, '0')}
                        </span>
                        <span>
                          {r.title}
                          <small>{r.factor_name}</small>
                        </span>
                      </button>
                    </td>
                    <td>
                      <span className="badge">{r.research_type}</span>
                    </td>
                    <td>{r.owner_name}</td>
                    <td>
                      <span className="file-count">
                        <Files size={16} />
                        {r.file_count || 0} 份
                      </span>
                    </td>
                    <td className="date-cell">{date(r.updated_at)}</td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`打开${r.title}`}
                        onClick={() => void onOpen(r.id)}
                      >
                        <ArrowUpRight size={20} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={
              debouncedSearch || researchTypeFilter || factorFilter
                ? '没有找到匹配的研究'
                : '研究，从第一份资料开始'
            }
            action={
              !debouncedSearch && !researchTypeFilter && !factorFilter ? (
                <button className="secondary" onClick={() => onCreate()}>
                  <Plus size={17} />
                  新建研究成果
                </button>
              ) : undefined
            }
          >
            {debouncedSearch || researchTypeFilter || factorFilter
              ? '尝试更换关键词，或调整研究类型和要素筛选。'
              : '创建研究档案，上传数据与论文，再用图文说明呈现研究发现。'}
          </Empty>
        )}
        <div className="pagination">
          <span>
            共 {listing.total} 项研究 · 第 {page} 页
          </span>
          <button disabled={page === 1 || loading} onClick={() => onPageChange(page - 1)}>
            上一页
          </button>
          <button
            disabled={page * 20 >= listing.total || loading}
            onClick={() => onPageChange(page + 1)}
          >
            下一页
          </button>
        </div>
      </section>
      <div className="workspace-footer">
        <span>每一份资料，都是下一次发现的起点。</span>
        <span>研序 · 研究成果管理</span>
      </div>
    </>
  );
}

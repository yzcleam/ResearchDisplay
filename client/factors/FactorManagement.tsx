import { ArrowLeft, Files, Plus } from '@phosphor-icons/react';
import { useEffect, useState, type FormEvent } from 'react';
import { roleLabels, type Factor, type FileRecord } from '../../shared/contracts';
import { errorMessage, fileUrl } from '../api';
import { Alert, Empty, FileLink, Loading, date, size } from '../components';
import { queries } from '../data/read-models';
import { commands } from '../data/write-models';
export function FactorManagement({
  factors,
  admin,
  onChanged,
}: {
  factors: Factor[];
  admin: boolean;
  onChanged: () => Promise<void>;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Factor | null>(null);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [history, setHistory] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  useEffect(() => {
    if (!selected) {
      return;
    }
    let active = true;
    setBusy(true);
    queries
      .factorFiles(selected.id, page, history)
      .then((r) => {
        if (active) {
          setFiles(r.items);
          setTotal(r.total);
        }
      })
      .catch((e) => {
        if (active) {
          setError(errorMessage(e));
        }
      })
      .finally(() => {
        if (active) {
          setBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, [selected?.id, history, page]);
  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await commands.addFactor(name);
      setName('');
      await onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function update(factor: Factor, newName: string, active: boolean) {
    setBusy(true);
    setError('');
    try {
      await commands.updateFactor(factor.id, { name: newName, active });
      await onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">FACTOR DIRECTORY</span>
          <h1>{selected ? selected.name : '要素与文件'}</h1>
          <p>统一维护要素类型，并查看每种要素关联的研究文件。</p>
        </div>
        {selected && (
          <button
            className="secondary"
            onClick={() => {
              setSelected(null);
              setHistory(false);
              setPage(1);
            }}
          >
            <ArrowLeft size={17} />
            返回目录
          </button>
        )}
      </div>
      <Alert>{error}</Alert>
      {selected ? (
        <section className="paper-panel">
          <div className="table-toolbar">
            <h2>
              关联文件 <span className="count">{total}</span>
            </h2>
            <label className="check">
              <input
                type="checkbox"
                checked={history}
                onChange={(e) => {
                  setHistory(e.target.checked);
                  setPage(1);
                }}
              />
              包含历史版本
            </label>
          </div>
          {busy ? (
            <Loading />
          ) : !files.length ? (
            <Empty title="暂无关联文件">上传该要素类型的研究材料后，文件将自动汇集于此。</Empty>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>文件名称</th>
                    <th>材料类别</th>
                    <th>大小</th>
                    <th>状态</th>
                    <th>归档时间</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <FileLink href={fileUrl(f.id)}>{f.original_name}</FileLink>
                      </td>
                      <td>{roleLabels[f.role]}</td>
                      <td>{size(f.size_bytes)}</td>
                      <td>
                        <span className={f.is_current ? 'badge' : 'badge muted-badge'}>
                          {f.is_current ? '当前' : '历史'}
                        </span>
                      </td>
                      <td>{date(f.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pagination">
            <span>
              第 {page} 页 · 共 {total} 个文件
            </span>
            <button disabled={page === 1 || busy} onClick={() => setPage((p) => p - 1)}>
              上一页
            </button>
            <button disabled={page * 50 >= total || busy} onClick={() => setPage((p) => p + 1)}>
              下一页
            </button>
          </div>
        </section>
      ) : (
        <>
          {admin && (
            <form className="add-factor paper-panel" onSubmit={add}>
              <div>
                <h2>添加要素类型</h2>
                <p className="muted small">
                  例如劳动力、资本、技术、土地、数据；由课题组自行定义。
                </p>
              </div>
              <input
                required
                aria-label="新要素类型名称"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                placeholder="输入要素类型名称"
              />
              <button className="primary" disabled={busy}>
                <Plus size={18} />
                添加类型
              </button>
            </form>
          )}
          <div className="factor-list">
            {!factors.length ? (
              <Empty title="尚未设置要素类型">请由管理员添加类型，研究成员即可在上传时选择。</Empty>
            ) : (
              factors.map((f) => (
                <FactorRow
                  key={`${f.id}-${f.name}-${f.active}`}
                  factor={f}
                  admin={admin}
                  busy={busy}
                  onUpdate={(n, a) => void update(f, n, a)}
                  onOpen={() => setSelected(f)}
                />
              ))
            )}
          </div>
        </>
      )}
    </>
  );
}
function FactorRow({
  factor: f,
  admin,
  busy,
  onUpdate,
  onOpen,
}: {
  factor: Factor;
  admin: boolean;
  busy: boolean;
  onUpdate: (name: string, active: boolean) => void;
  onOpen: () => void;
}) {
  const [name, setName] = useState(f.name);
  return (
    <div className="factor-row">
      <div className="factor-symbol">
        <Files size={25} />
      </div>
      <div className="factor-name">
        {admin ? (
          <input
            aria-label={`类型名称 ${f.name}`}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
          />
        ) : (
          <strong>{f.name}</strong>
        )}
        <span className={f.active ? 'status-label' : 'muted small'}>
          {f.active ? '可用于新研究' : '已停用 · 历史资料保留'}
        </span>
      </div>
      <div className="factor-count">
        <strong>{f.research_count}</strong>
        <span>项研究</span>
      </div>
      <div className="factor-count">
        <strong>{f.file_count}</strong>
        <span>份文件</span>
      </div>
      <div className="actions">
        {admin && (
          <>
            <button
              className="ghost"
              disabled={busy || name === f.name || !name.trim()}
              onClick={() => onUpdate(name, f.active)}
            >
              保存名称
            </button>
            <button className="ghost" disabled={busy} onClick={() => onUpdate(f.name, !f.active)}>
              {f.active ? '停用' : '启用'}
            </button>
          </>
        )}
        <button className="secondary" onClick={onOpen}>
          查看文件
        </button>
      </div>
    </div>
  );
}

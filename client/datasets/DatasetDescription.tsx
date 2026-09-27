import { FloppyDisk, Table, X } from '@phosphor-icons/react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { FileRecord } from '../../shared/contracts';
import {
  datasetDescriptionSchema,
  panelRoleLabels,
  panelRoles,
  type DatasetDescriptionField,
  type DatasetDescription as Description,
} from '../../shared/datasets';
import { errorMessage } from '../api';
import { Alert, Loading, date } from '../components';
import { queries } from '../data/read-models';
import { commands } from '../data/write-models';

export function DatasetDescriptionDialog({
  files,
  readOnly,
  onClose,
  onSaved,
}: {
  files: FileRecord[];
  readOnly: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [fileId, setFileId] = useState(
    files.find((file) => file.is_current)?.id || files[0]?.id || '',
  );
  const [data, setData] = useState<Description | null>(null);
  const [fields, setFields] = useState<DatasetDescriptionField[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setNotice('');
    setData(null);
    setFields([]);
    (readOnly
      ? queries.dataset(fileId, controller.signal)
      : commands.parseDataset(fileId, controller.signal)
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setFields(result.descriptions);
          setDirty(false);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(err));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [fileId, readOnly]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function close() {
    if (!saving && (!dirty || confirm('数据说明尚未保存，确定关闭吗？'))) {
      onClose();
    }
  }
  function edit<K extends keyof DatasetDescriptionField>(
    index: number,
    key: K,
    value: DatasetDescriptionField[K],
  ) {
    setFields((old) => old.map((field, i) => (i === index ? { ...field, [key]: value } : field)));
    setDirty(true);
    setNotice('');
  }
  const conflicts = (['time', 'individual'] as const).flatMap((role) => {
    const matches = fields.flatMap((field, index) =>
      field.panel_role === role ? [data?.fields[index]?.data_id || ''] : [],
    );
    return matches.length > 1
      ? [
          `${panelRoleLabels[role]}有 ${matches.length} 个（${matches.join('、')}）。每个数据集最多保留一个，请将其余字段改为一般数据。`,
        ]
      : [];
  });
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!data) {
      return;
    }
    setError('');
    setNotice('');
    const parsed = datasetDescriptionSchema.safeParse({ revision: data.revision, fields });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join('；'));
      return;
    }
    setSaving(true);
    try {
      const next = await commands.saveDataset(fileId, parsed.data);
      setData(next);
      setFields(next.descriptions);
      setDirty(false);
      setNotice('数据说明已保存，并关联到当前选择的数据集版本。');
      body.current?.scrollTo({ top: 0 });
      await onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="dataset-dialog"
      aria-labelledby="dataset-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <form onSubmit={save}>
        <header className="dataset-dialog-header">
          <div>
            <span className="eyebrow">DATA DICTIONARY</span>
            <h2 id="dataset-dialog-title">
              <Table size={22} />
              {readOnly ? '数据说明' : '在线填写数据说明'}
            </h2>
            <p>数据 ID 和类型来自工作簿解析，其余信息按字段填写。</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="关闭数据说明"
            onClick={close}
            disabled={saving}
          >
            <X size={22} />
          </button>
        </header>
        <div ref={body} className="dataset-dialog-body">
          <label className="dataset-version">
            数据集版本
            <select
              value={fileId}
              disabled={saving}
              onChange={(event) => {
                if (!dirty || confirm('当前数据说明尚未保存，确定切换数据集吗？')) {
                  setDirty(false);
                  setFileId(event.target.value);
                }
              }}
            >
              {files.map((file) => (
                <option key={file.id} value={file.id}>
                  {file.original_name} · {date(file.created_at)}
                  {file.is_current ? '（当前版本）' : '（历史版本）'}
                </option>
              ))}
            </select>
          </label>
          <Alert>{error}</Alert>
          {notice && (
            <div className="notice" role="status">
              {notice}
            </div>
          )}
          {!!conflicts.length && (
            <div className="alert dataset-conflicts" role="alert">
              <strong>请调整面板数据标识</strong>
              {conflicts.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}
          {loading ? (
            <Loading />
          ) : (
            data && (
              <>
                <div className="dataset-overview">
                  <span>
                    已解析 <strong>{data.fields.length}</strong> 个字段 ·{' '}
                    <strong>{data.row_count.toLocaleString()}</strong> 行数据 · {data.sheets.length}{' '}
                    张工作表
                  </span>
                  <span>{data.saved_at ? `保存于 ${date(data.saved_at)}` : '数据说明待填写'}</span>
                </div>
                {!!data.warnings.length && (
                  <details className="dataset-warnings">
                    <summary>预检查提示（{data.warnings.length}）</summary>
                    <ul>
                      {data.warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  </details>
                )}
                <p className="dataset-help">
                  每个数据集允许 0–1 个时间标识和 0–1 个个体标识。中文名称最多 10 字、数据来源最多
                  20 字、数据解释最多 100 字，均允许英文与缩写。
                </p>
                <fieldset disabled={readOnly || saving}>
                  <div className="dataset-table-wrap">
                    <table className="dataset-table">
                      <thead>
                        <tr>
                          <th>数据 ID</th>
                          <th>数据类型</th>
                          <th>面板数据标识</th>
                          <th>数据中文名称 *</th>
                          <th>数据解释 *</th>
                          <th>数据来源 *</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.fields.map((field, index) => (
                          <tr key={field.key}>
                            <td data-label="数据 ID">
                              <strong>{field.data_id}</strong>
                              <small>
                                {field.sheet} · 第 {field.column} 列
                              </small>
                            </td>
                            <td data-label="数据类型">
                              <span className="dataset-type">{field.data_type}</span>
                            </td>
                            <td data-label="面板数据标识">
                              <select
                                aria-label={`${field.data_id} 面板数据标识`}
                                value={fields[index].panel_role}
                                onChange={(event) =>
                                  edit(
                                    index,
                                    'panel_role',
                                    event.target.value as DatasetDescriptionField['panel_role'],
                                  )
                                }
                              >
                                {panelRoles.map((role) => (
                                  <option key={role} value={role}>
                                    {panelRoleLabels[role]}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td data-label="数据中文名称 *">
                              <input
                                aria-label={`${field.data_id} 数据中文名称`}
                                required
                                maxLength={10}
                                value={fields[index].chinese_name}
                                onChange={(event) =>
                                  edit(index, 'chinese_name', event.target.value)
                                }
                                placeholder="如：GDP"
                              />
                              <small className="character-count">
                                {Array.from(fields[index].chinese_name).length}/10
                              </small>
                            </td>
                            <td data-label="数据解释 *">
                              <textarea
                                aria-label={`${field.data_id} 数据解释`}
                                required
                                maxLength={100}
                                rows={2}
                                value={fields[index].explanation}
                                onChange={(event) => edit(index, 'explanation', event.target.value)}
                                placeholder="说明指标含义、单位或计算口径"
                              />
                              <small className="character-count">
                                {Array.from(fields[index].explanation).length}/100
                              </small>
                            </td>
                            <td data-label="数据来源 *">
                              <input
                                aria-label={`${field.data_id} 数据来源`}
                                required
                                maxLength={20}
                                value={fields[index].source}
                                onChange={(event) => edit(index, 'source', event.target.value)}
                                placeholder="如：中国城市统计年鉴"
                              />
                              <small className="character-count">
                                {Array.from(fields[index].source).length}/20
                              </small>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </fieldset>
              </>
            )
          )}
        </div>
        <footer className="dataset-dialog-footer">
          <span className="small muted">
            {dirty ? '有尚未保存的修改' : '说明按数据集版本保存，可随时再次编辑。'}
          </span>
          <div className="actions">
            <button type="button" className="secondary" onClick={close} disabled={saving}>
              关闭
            </button>
            {!readOnly && (
              <button
                className="primary"
                disabled={loading || saving || !data || conflicts.length > 0}
              >
                <FloppyDisk size={17} />
                {saving ? '正在保存…' : '保存数据说明'}
              </button>
            )}
          </div>
        </footer>
      </form>
    </dialog>
  );
}

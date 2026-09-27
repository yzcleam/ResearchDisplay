import {
  ArrowDown,
  CaretRight,
  File,
  Folder,
  Globe,
  Lock,
  MagnifyingGlass,
  Trash,
  UploadSimple,
  UsersThree,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import type {
  ShareScope,
  SharingInput,
  SpaceFile,
  SpaceFolder,
  SpaceProject,
  User,
} from '../../shared/contracts';
import { errorMessage, fileUrl } from '../api';
import { Alert, Loading, date } from '../components';
import { queries } from '../data/read-models';
import { commands } from '../data/write-models';
import './space.css';

const folders: { id: SpaceFolder; label: string; description: string }[] = [
  { id: 'manuscript', label: '原始论文', description: '论文原稿' },
  { id: 'dataset', label: '原始数据', description: '表单上传的数据集' },
  { id: 'documents', label: '说明文档', description: '指标表与研究说明' },
  { id: 'other', label: '其他文件', description: '自主上传的资料' },
];
const scopeLabel: Record<ShareScope, string> = {
  global: '全域共享',
  specific: '指定用户',
  private: '私有数据',
};
const scopeIcon = { global: Globe, specific: UsersThree, private: Lock };
type Person = Pick<User, 'id' | 'real_name'>;

function SharingFields({
  value,
  onChange,
  people,
  selfId,
}: {
  value: SharingInput;
  onChange: (value: SharingInput) => void;
  people: Person[];
  selfId: string;
}) {
  return (
    <div className="space-sharing-fields">
      <label>
        共享权限
        <select
          value={value.scope}
          onChange={(event) => onChange({ scope: event.target.value as ShareScope, user_ids: [] })}
        >
          <option value="global">全域共享</option>
          <option value="specific">分享给特定用户</option>
          <option value="private">私有数据</option>
        </select>
      </label>
      {value.scope === 'specific' && (
        <div className="space-people" role="group" aria-label="选择共享用户">
          {people
            .filter((person) => person.id !== selfId)
            .map((person) => (
              <label key={person.id}>
                <input
                  type="checkbox"
                  checked={value.user_ids.includes(person.id)}
                  onChange={() =>
                    onChange({
                      ...value,
                      user_ids: value.user_ids.includes(person.id)
                        ? value.user_ids.filter((id) => id !== person.id)
                        : [...value.user_ids, person.id],
                    })
                  }
                />
                {person.real_name}
              </label>
            ))}
        </div>
      )}
    </div>
  );
}

export function FileSpace({ user }: { user: User }) {
  const [projects, setProjects] = useState<SpaceProject[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [folder, setFolder] = useState<SpaceFolder | null>(null);
  const [files, setFiles] = useState<SpaceFile[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadSharing, setUploadSharing] = useState<SharingInput>({
    scope: 'global',
    user_ids: [],
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [editSharing, setEditSharing] = useState<SharingInput>({ scope: 'global', user_ids: [] });
  const picker = useRef<HTMLInputElement>(null);
  const project = projects.find((item) => item.id === projectId);
  const managed = !!project && (user.role === 'admin' || project.owner_id === user.id);

  async function refreshProjects() {
    const result = await queries.spaceProjects();
    setProjects(result);
    setProjectId((current) =>
      current && result.some((item) => item.id === current) ? current : result[0]?.id || null,
    );
  }
  async function refreshFiles(id: string) {
    setFiles(await queries.spaceFiles(id));
  }
  useEffect(() => {
    Promise.all([refreshProjects(), queries.userDirectory().then(setPeople)])
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!projectId) {
      setFiles([]);
      return;
    }
    let active = true;
    setFiles([]);
    setLoading(true);
    queries
      .spaceFiles(projectId)
      .then((result) => {
        if (active) setFiles(result);
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId]);

  async function upload() {
    if (!projectId || !uploadFiles.length) return;
    setBusy(true);
    setError('');
    try {
      await commands.uploadSpaceFiles(projectId, uploadFiles, uploadSharing);
      setUploadFiles([]);
      setUploadSharing({ scope: 'global', user_ids: [] });
      if (picker.current) picker.current.value = '';
      await Promise.all([refreshFiles(projectId), refreshProjects()]);
      setFolder('other');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function saveSharing(file: SpaceFile) {
    setBusy(true);
    setError('');
    try {
      await commands.changeFileSharing(file.id, editSharing);
      await refreshFiles(file.research_id);
      setEditing(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  async function remove(file: SpaceFile) {
    if (!confirm(`确认删除“${file.original_name}”？`)) return;
    setBusy(true);
    setError('');
    try {
      await commands.deleteSpaceFile(file.id);
      await Promise.all([refreshFiles(file.research_id), refreshProjects()]);
      setEditing(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    if (!managed) return;
    const selected = Array.from(event.dataTransfer.files);
    if (selected.length) {
      setUploadFiles(selected);
      setFolder('other');
    }
  }
  const visibleProjects = projects.filter((item) =>
    `${item.title} ${item.owner_name}`.toLowerCase().includes(query.toLowerCase()),
  );
  const visibleFiles = files.filter((item) => item.folder === folder);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">SHARED FILE SPACE</span>
          <h1>文件共享空间</h1>
          <p>按科研项目浏览资料。每份文件单独设置共享权限。</p>
        </div>
        <span className="badge">{projects.length} 个项目</span>
      </div>
      <Alert>{error}</Alert>
      <div className="space-explorer">
        <aside className="space-projects paper-panel" aria-label="科研项目">
          <h2>科研项目</h2>
          <label className="space-search">
            <MagnifyingGlass size={17} />
            <input
              aria-label="搜索科研项目"
              placeholder="搜索项目"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="space-project-list">
            {visibleProjects.map((item) => (
              <button
                type="button"
                key={item.id}
                className={projectId === item.id ? 'active' : ''}
                onClick={() => {
                  setProjectId(item.id);
                  setFolder(null);
                  setEditing(null);
                  setUploadFiles([]);
                  setUploadSharing({ scope: 'global', user_ids: [] });
                  if (picker.current) picker.current.value = '';
                }}
              >
                <Folder size={20} weight={projectId === item.id ? 'fill' : 'regular'} />
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.owner_name} · {item.file_count} 份文件
                  </small>
                </span>
              </button>
            ))}
            {!loading && !visibleProjects.length && <p className="space-muted">没有匹配的项目</p>}
          </div>
        </aside>
        <section
          className={`space-content paper-panel ${dragging ? 'dragging' : ''}`}
          onDragOver={(event) => {
            if (managed) {
              event.preventDefault();
              setDragging(true);
            }
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
          }}
          onDrop={onDrop}
        >
          {loading && !project ? (
            <Loading />
          ) : project ? (
            <>
              <div className="space-breadcrumb">
                <button type="button" onClick={() => setFolder(null)}>
                  {project.title}
                </button>
                {folder && (
                  <>
                    <CaretRight size={15} />
                    <strong>{folders.find((item) => item.id === folder)?.label}</strong>
                  </>
                )}
              </div>
              {!folder ? (
                <div className="space-folders">
                  {folders.map((item) => (
                    <button type="button" key={item.id} onClick={() => setFolder(item.id)}>
                      <Folder size={30} weight="duotone" />
                      <span>
                        <strong>{item.label}</strong>
                        <small>
                          {item.description} ·{' '}
                          {files.filter((file) => file.folder === item.id).length} 份
                        </small>
                      </span>
                      <CaretRight size={16} />
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <div className="space-folder-heading">
                    <div>
                      <h2>{folders.find((item) => item.id === folder)?.label}</h2>
                      <p>{visibleFiles.length} 份文件</p>
                    </div>
                  </div>
                  {loading ? (
                    <Loading />
                  ) : visibleFiles.length ? (
                    <div className="space-file-list">
                      {visibleFiles.map((file) => {
                        const ScopeIcon = scopeIcon[file.share_scope];
                        return (
                          <div className="space-file" key={file.id}>
                            <File size={25} weight="duotone" />
                            <div className="space-file-info">
                              <strong title={file.original_name}>{file.original_name}</strong>
                              <small>
                                {file.uploader_name} · {date(file.created_at)} ·{' '}
                                {(file.size_bytes / 1024).toFixed(1)} KB
                              </small>
                            </div>
                            <span className="space-scope" title={scopeLabel[file.share_scope]}>
                              <ScopeIcon size={16} />
                              {scopeLabel[file.share_scope]}
                            </span>
                            <div className="space-file-actions">
                              {file.can_download ? (
                                <a
                                  className="ghost"
                                  href={fileUrl(file.id, true)}
                                  download={file.original_name}
                                  title="下载"
                                >
                                  <ArrowDown size={17} />
                                  下载
                                </a>
                              ) : (
                                <span className="space-muted">无下载权限</span>
                              )}
                              {file.can_share && (
                                <button
                                  className="ghost"
                                  type="button"
                                  disabled={busy}
                                  onClick={() => {
                                    setEditing(editing === file.id ? null : file.id);
                                    setEditSharing({
                                      scope: file.share_scope,
                                      user_ids: file.shared_with,
                                    });
                                  }}
                                >
                                  权限
                                </button>
                              )}
                              {file.can_delete && (
                                <button
                                  className="ghost danger"
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void remove(file)}
                                  title="删除"
                                >
                                  <Trash size={17} />
                                </button>
                              )}
                            </div>
                            {editing === file.id && (
                              <div className="space-edit">
                                <SharingFields
                                  value={editSharing}
                                  onChange={setEditSharing}
                                  people={people}
                                  selfId={user.id}
                                />
                                <div className="space-edit-actions">
                                  <button
                                    type="button"
                                    className="ghost"
                                    onClick={() => setEditing(null)}
                                  >
                                    取消
                                  </button>
                                  <button
                                    type="button"
                                    disabled={
                                      busy ||
                                      (editSharing.scope === 'specific' &&
                                        !editSharing.user_ids.length)
                                    }
                                    onClick={() => void saveSharing(file)}
                                  >
                                    保存权限
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-empty">此目录暂无文件。</div>
                  )}
                </>
              )}
              {managed && (
                <div className="space-upload">
                  <div>
                    <h3>
                      <UploadSimple size={19} />
                      上传到其他文件
                    </h3>
                    <p>拖入文件或使用选择器。自主上传的资料统一归入“其他文件”。</p>
                  </div>
                  <input
                    ref={picker}
                    type="file"
                    multiple
                    aria-label="选择共享文件"
                    onChange={(event) => setUploadFiles(Array.from(event.target.files || []))}
                  />
                  {uploadFiles.length > 0 && (
                    <>
                      <p className="space-selected">
                        已选择 {uploadFiles.length} 个文件：
                        {uploadFiles.map((file) => file.name).join('、')}
                      </p>
                      <SharingFields
                        value={uploadSharing}
                        onChange={setUploadSharing}
                        people={people}
                        selfId={user.id}
                      />
                      <button
                        type="button"
                        disabled={
                          busy ||
                          (uploadSharing.scope === 'specific' && !uploadSharing.user_ids.length)
                        }
                        onClick={() => void upload()}
                      >
                        {busy ? '上传中…' : '上传文件'}
                      </button>
                    </>
                  )}
                </div>
              )}
              {dragging && managed && <div className="space-drop-hint">松开以选择文件</div>}
            </>
          ) : (
            <div className="space-empty">暂无科研项目。请先创建研究资料。</div>
          )}
        </section>
      </div>
    </>
  );
}

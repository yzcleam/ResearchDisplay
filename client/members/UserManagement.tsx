import { useEffect, useState } from 'react';
import { type User } from '../../shared/contracts';
import { errorMessage } from '../api';
import { Alert, Loading, date } from '../components';
import { queries } from '../data/read-models';
import { commands } from '../data/write-models';
export function UserManagement({ current }: { current: User }) {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [teacher, setTeacher] = useState({
    email: '',
    password: '',
    real_name: '',
    institution: '',
  });
  async function refresh() {
    setUsers(await queries.users());
  }
  useEffect(() => {
    refresh()
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setBusy(false));
  }, []);
  async function update(user: User, change: Partial<User>) {
    if (!confirm(`确认修改 ${user.real_name} 的权限或账号状态？该用户需要重新登录。`)) {
      return;
    }
    setBusy(true);
    setError('');
    try {
      await commands.updateUser(user.id, { role: user.role, active: user.active, ...change });
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function addTeacher(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await commands.createTeacher(teacher);
      setTeacher({ email: '', password: '', real_name: '', institution: '' });
      await refresh();
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
          <span className="eyebrow">GROUP MEMBERS</span>
          <h1>成员管理</h1>
          <p>实名识别成果归属，按职责分配管理权限。</p>
        </div>
        <span className="badge">管理员专属</span>
      </div>
      <Alert>{error}</Alert>
      <section className="paper-panel teacher-create">
        <h2>创建导师账号</h2>
        <p>导师可查看和下载所有文件，只能删除自己上传的文件。</p>
        <form onSubmit={(event) => void addTeacher(event)}>
          <input
            aria-label="导师姓名"
            placeholder="真实姓名"
            required
            minLength={2}
            value={teacher.real_name}
            onChange={(e) => setTeacher({ ...teacher, real_name: e.target.value })}
          />
          <input
            aria-label="导师邮箱"
            placeholder="邮箱"
            type="email"
            required
            value={teacher.email}
            onChange={(e) => setTeacher({ ...teacher, email: e.target.value })}
          />
          <input
            aria-label="导师单位"
            placeholder="单位或课题组"
            required
            minLength={2}
            value={teacher.institution}
            onChange={(e) => setTeacher({ ...teacher, institution: e.target.value })}
          />
          <input
            aria-label="导师初始密码"
            placeholder="初始密码（至少 10 位）"
            type="password"
            required
            minLength={10}
            value={teacher.password}
            onChange={(e) => setTeacher({ ...teacher, password: e.target.value })}
          />
          <button disabled={busy} type="submit">
            创建导师
          </button>
        </form>
      </section>
      <section className="paper-panel">
        {busy && !users.length ? (
          <Loading />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>成员 / 单位</th>
                  <th>邮箱</th>
                  <th>角色</th>
                  <th>状态</th>
                  <th>注册时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>
                        {u.real_name}
                        {u.id === current.id ? '（我）' : ''}
                      </strong>
                      <small className="cell-subtitle">{u.institution}</small>
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <select
                        aria-label={`${u.real_name}的角色`}
                        disabled={busy || u.id === current.id}
                        value={u.role}
                        onChange={(e) => void update(u, { role: e.target.value as User['role'] })}
                      >
                        <option value="member">研究成员</option>
                        <option value="teacher">导师</option>
                        <option value="admin">管理员</option>
                      </select>
                    </td>
                    <td>
                      <span className={u.active ? 'badge' : 'badge muted-badge'}>
                        {u.active ? '已启用' : '已停用'}
                      </span>
                    </td>
                    <td>{date(u.created_at)}</td>
                    <td>
                      <button
                        className="ghost"
                        disabled={busy || u.id === current.id}
                        onClick={() => void update(u, { active: !u.active })}
                      >
                        {u.active ? '停用账号' : '启用账号'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="detail-footnote">
        研究成员可查看组内文件目录并管理自己的成果；导师可下载全部文件；管理员可管理全部成果、文件和成员。实名为本人填写，系统暂不核验身份。
      </p>
    </>
  );
}

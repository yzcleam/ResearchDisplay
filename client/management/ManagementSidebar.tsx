import { Books, CaretRight, Database, SignOut, type Icon } from '@phosphor-icons/react';
import type { User } from '../../shared/contracts';

export type ManagementView = 'research' | 'space' | 'factors' | 'history' | 'users' | 'ai';
export type NavigationItem = { key: ManagementView; label: string; icon: Icon };
type Props = {
  user: User;
  nav: NavigationItem[];
  view: ManagementView;
  mobile: boolean;
  onNavigate: (view: ManagementView) => void;
  onLogout: () => Promise<void>;
};

export function ManagementSidebar({ user, nav, view, mobile, onNavigate, onLogout }: Props) {
  return (
    <aside className={`sidebar ${mobile ? 'open' : ''}`}>
      <a
        className="brand"
        href="/"
        onClick={(e) => {
          e.preventDefault();
          onNavigate('research');
        }}
      >
        <span className="brand-mark">
          <Books size={25} />
        </span>
        <span>
          研序<small>RESEARCH ARCHIVE</small>
        </span>
      </a>
      <div className="workspace-label">
        <span className="workspace-dot" />
        课题组工作空间
      </div>
      <div className="nav-caption">资料管理</div>
      <nav>
        {nav.map((n) => (
          <button
            key={n.key}
            className={view === n.key ? 'active' : ''}
            onClick={() => onNavigate(n.key)}
          >
            <n.icon size={21} weight={view === n.key ? 'fill' : 'regular'} />
            {n.label}
            {view === n.key && <CaretRight className="nav-arrow" size={14} />}
          </button>
        ))}
      </nav>
      <div className="sidebar-note">
        <Database size={23} weight="light" />
        <strong>将研究积累为知识</strong>
        <p>
          资料、图文与发现，
          <br />
          在同一个空间有序连接。
        </p>
      </div>
      <div className="sidebar-user">
        <div className="avatar">{user.real_name.slice(-2)}</div>
        <div>
          <strong>{user.real_name}</strong>
          <small>
            {user.role === 'admin' ? '管理员' : user.role === 'teacher' ? '导师' : '研究成员'}
          </small>
        </div>
        <button title="退出登录" aria-label="退出登录" onClick={() => void onLogout()}>
          <SignOut size={20} />
        </button>
      </div>
    </aside>
  );
}

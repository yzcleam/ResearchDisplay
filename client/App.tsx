import { Workspace } from './application/Workspace';
import { Auth, useSession } from './auth/index';
import { Loading } from './components';

/** 应用入口只负责会话门禁；工作空间和研究草稿各自管理状态。 */
export function App() {
  const session = useSession();
  if (session.initializing) {
    return <Loading />;
  }
  if (!session.user) {
    return <Auth onLogin={session.onLogin} />;
  }
  return <Workspace key={session.user.id} user={session.user} onLogout={session.logout} />;
}

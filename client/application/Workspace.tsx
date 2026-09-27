import {
  ArrowUpRight,
  CaretRight,
  ClockCounterClockwise,
  FolderOpen,
  List,
  Sparkle,
  SquaresFour,
  Users,
  X,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { type User } from '../../shared/contracts';
import { AiSettings } from '../ai/index';
import { errorMessage } from '../api';
import { Alert, Empty, Loading } from '../components';
import { FactorManagement } from '../factors/index';
import { FileSpace } from '../space/index';
import {
  ManagementSidebar,
  ResearchListPage,
  useWorkspaceModel,
  type ManagementView,
} from '../management/index';
import { UserManagement } from '../members/index';
import { Showcase } from '../showcase/index';
import { History } from '../research/index';
import { ResearchDetail } from './ResearchEditor';
type View = ManagementView;

export function Workspace({ user, onLogout }: { user: User; onLogout: () => Promise<void> }) {
  const [surface, setSurface] = useState<'showcase' | 'management'>('showcase');
  const [managementVisited, setManagementVisited] = useState(false);
  function enterManagement() {
    setManagementVisited(true);
    setSurface('management');
  }
  const {
    view,
    mobileMenuOpen,
    setMobileMenuOpen,
    factors,
    stats,
    listing,
    events,
    loading,
    error,
    setError,
    searchText,
    setSearchText,
    debouncedSearch,
    researchTypeFilter,
    setResearchTypeFilter,
    factorFilter,
    setFactorFilter,
    onlyMyResearch,
    setOnlyMyResearch,
    page,
    setPage,
    refresh,
    selectedResearch,
    setSelectedResearch,
    refreshBasics,
    openResearch,
    navigate,
  } = useWorkspaceModel(user, surface);
  async function logout() {
    try {
      await onLogout();
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  const nav = [
    { key: 'research' as View, label: '研究资料', icon: SquaresFour },
    { key: 'space' as View, label: '文件共享空间', icon: FolderOpen },
    ...(user.role === 'member'
      ? []
      : [{ key: 'factors' as View, label: '要素与文件', icon: FolderOpen }]),
    { key: 'history' as View, label: '上传记录', icon: ClockCounterClockwise },
    ...(user.role === 'admin'
      ? [
          { key: 'users' as View, label: '成员管理', icon: Users },
          { key: 'ai' as View, label: 'LLM 设置', icon: Sparkle },
        ]
      : []),
  ];
  let managementContent;
  if (selectedResearch !== undefined) {
    managementContent = (
      <ResearchDetail
        key={selectedResearch?.id || 'new'}
        initial={selectedResearch}
        user={user}
        factors={factors}
        onBack={() => {
          setSelectedResearch(undefined);
          refresh();
        }}
        onChanged={refresh}
      />
    );
  } else if (view === 'factors' && user.role !== 'member') {
    managementContent = (
      <FactorManagement factors={factors} admin={user.role === 'admin'} onChanged={refreshBasics} />
    );
  } else if (view === 'space') {
    managementContent = <FileSpace user={user} />;
  } else if (view === 'ai' && user.role === 'admin') {
    managementContent = <AiSettings />;
  } else if (view === 'users') {
    managementContent = <UserManagement current={user} />;
  } else if (view === 'history') {
    managementContent = (
      <>
        <div className="page-heading">
          <div>
            <span className="eyebrow">ACTIVITY LOG</span>
            <h1>上传与变更记录</h1>
            <p>记录每一次研究积累。这里展示课题组最近 100 次操作。</p>
          </div>
        </div>
        <section className="paper-panel">
          {loading ? (
            <Loading />
          ) : events.length ? (
            <History events={events} />
          ) : (
            <Empty title="还没有上传记录">
              新建研究成果、上传文件和保存图文说明后，会自动留下记录。
            </Empty>
          )}
        </section>
      </>
    );
  } else {
    managementContent = (
      <ResearchListPage
        stats={stats}
        listing={listing}
        factors={factors}
        loading={loading}
        filters={{
          q: searchText,
          query: debouncedSearch,
          type: researchTypeFilter,
          factor: factorFilter,
          mine: onlyMyResearch,
          page,
        }}
        onCreate={() => setSelectedResearch(null)}
        onOpen={openResearch}
        onSearchChange={setSearchText}
        onPageChange={setPage}
        onResearchTypeChange={(value) => {
          setResearchTypeFilter(value);
          setPage(1);
        }}
        onFactorChange={(value) => {
          setFactorFilter(value);
          setPage(1);
        }}
        onOnlyMineChange={(value) => {
          setOnlyMyResearch(value);
          setPage(1);
        }}
      />
    );
  }
  return (
    <>
      {surface === 'showcase' && (
        <>
          <Alert>{error}</Alert>
          <Showcase user={user} factors={factors} onManage={enterManagement} onLogout={logout} />
        </>
      )}
      {managementVisited && (
        <div className="app-shell management-surface" hidden={surface !== 'management'}>
          <ManagementSidebar
            user={user}
            nav={nav}
            view={view}
            mobile={mobileMenuOpen}
            onNavigate={navigate}
            onLogout={logout}
          />
          {mobileMenuOpen && (
            <div className="sidebar-scrim" onClick={() => setMobileMenuOpen(false)} />
          )}
          <div className="workspace">
            <header className="topbar">
              <div className="breadcrumb">
                <button
                  className="mobile-menu"
                  aria-label="打开导航"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                >
                  {mobileMenuOpen ? <X size={23} /> : <List size={23} />}
                </button>
                <span>课题组资料库</span>
                <CaretRight size={13} />
                <strong>{nav.find((n) => n.key === view)?.label}</strong>
              </div>
              <div className="topbar-actions">
                <span className="internal-label">
                  <span />
                  内部协作空间
                </span>
                <button
                  type="button"
                  className="return-showcase"
                  onClick={() => setSurface('showcase')}
                >
                  回到前端
                  <ArrowUpRight size={15} />
                </button>
              </div>
            </header>
            <main className="main-content">
              <Alert>{error}</Alert>
              {managementContent}
            </main>
          </div>
        </div>
      )}
    </>
  );
}

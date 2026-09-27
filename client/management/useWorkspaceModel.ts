import { useEffect, useState } from 'react';
import type { Factor, Research, UploadEvent, User } from '../../shared/contracts';
import type { ResearchListing as Listing, DashboardStats as Stats } from '../../shared/views';
import { errorMessage } from '../api';
import { queries } from '../data/read-models';
import type { ManagementView as View } from './ManagementSidebar';

export function useWorkspaceModel(user: User, surface: 'showcase' | 'management') {
  const [view, setView] = useState<View>('research');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [stats, setStats] = useState<Stats>({ research: 0, files: 0, factors: 0, mine: 0 });
  const [listing, setListing] = useState<Listing>({ items: [], total: 0 });
  const [events, setEvents] = useState<UploadEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [researchTypeFilter, setResearchTypeFilter] = useState('');
  const [factorFilter, setFactorFilter] = useState('');
  const [onlyMyResearch, setOnlyMyResearch] = useState(false);
  const [page, setPage] = useState(1);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [selectedResearch, setSelectedResearch] = useState<Research | null | undefined>(undefined);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);
  async function refreshBasics() {
    const [availableFactors, dashboardStats] = await Promise.all([
      queries.factors(),
      queries.stats(),
    ]);
    setFactors(availableFactors);
    setStats(dashboardStats);
  }
  useEffect(() => {
    refreshBasics().catch((e) => setError(errorMessage(e)));
  }, [user.id, refreshVersion]);
  useEffect(() => {
    if (surface !== 'management' || !['research', 'history'].includes(view)) {
      return;
    }
    let active = true;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({
      q: debouncedSearch,
      page: String(page),
      mine: String(onlyMyResearch),
    });
    if (researchTypeFilter) {
      params.set('type', researchTypeFilter);
    }
    if (factorFilter) {
      params.set('factor', factorFilter);
    }
    const request =
      view === 'history'
        ? queries.activity().then((r) => {
            if (active) {
              setEvents(r);
            }
          })
        : queries.researchList(params).then((r) => {
            if (active) {
              setListing(r);
            }
          });
    request
      .catch((e) => {
        if (active) {
          setError(errorMessage(e));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [
    user?.id,
    surface,
    view,
    debouncedSearch,
    researchTypeFilter,
    factorFilter,
    onlyMyResearch,
    page,
    refreshVersion,
  ]);
  async function openResearch(id: string) {
    setLoading(true);
    setError('');
    try {
      setSelectedResearch(await queries.research(id));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }
  function navigate(next: View) {
    if (
      selectedResearch !== undefined &&
      !confirm('切换页面将关闭当前成果，请确认编辑内容已保存。')
    ) {
      return;
    }
    setSelectedResearch(undefined);
    setView(next);
    setMobileMenuOpen(false);
    setError('');
  }
  return {
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
    refresh: () => setRefreshVersion((value) => value + 1),
    selectedResearch,
    setSelectedResearch,
    refreshBasics,
    openResearch,
    navigate,
  };
}

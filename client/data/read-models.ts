import type { AiSettings, AiStatus } from '../../shared/ai';
import type {
  Factor,
  PdfJob,
  Research,
  SpaceFile,
  SpaceProject,
  UploadEvent,
  User,
} from '../../shared/contracts';
import type { DatasetDescription } from '../../shared/datasets';
import type { ShowcaseDetail, ShowcaseOverview, ShowcasePage } from '../../shared/showcase';
import type { DashboardStats, FactorFileListing, ResearchListing } from '../../shared/views';
import { api } from '../api';

/** 页面只调用命名查询，HTTP 路径、响应类型和取消信号统一在此适配。 */
export const queries = {
  session: () => api<{ user: User; csrf: string }>('/auth/me'),
  factors: () => api<Factor[]>('/factors'),
  stats: () => api<DashboardStats>('/stats'),
  activity: () => api<UploadEvent[]>('/uploads'),
  research: (id: string) => api<Research>(`/research/${id}`),
  researchList: (parameters: URLSearchParams) => api<ResearchListing>(`/research?${parameters}`),
  researchHistory: (id: string) => api<UploadEvent[]>(`/research/${id}/history`),
  factorFiles: (id: string, page: number, history: boolean) =>
    api<FactorFileListing>(`/factors/${id}/files?page=${page}&history=${history}`),
  users: () => api<User[]>('/users'),
  userDirectory: () => api<Pick<User, 'id' | 'real_name'>[]>('/auth/directory'),
  spaceProjects: () => api<SpaceProject[]>('/files/space'),
  spaceFiles: (researchId: string) => api<SpaceFile[]>(`/files/space/${researchId}`),
  pdfJob: (id: string) => api<PdfJob>(`/documents/jobs/${id}`),
  dataset: (id: string, signal?: AbortSignal) =>
    api<DatasetDescription>(`/datasets/${id}`, { signal }),
  aiStatus: (signal?: AbortSignal) => api<AiStatus>('/ai/status', { signal }),
  aiSettings: () => api<AiSettings>('/ai/settings'),
  showcase: (parameters: URLSearchParams, signal: AbortSignal) =>
    api<ShowcaseOverview>(`/showcase?${parameters}`, { signal }),
  showcasePage: (id: string, parameters: URLSearchParams, signal: AbortSignal) =>
    api<ShowcasePage>(`/showcase/factors/${id}/research?${parameters}`, { signal }),
  showcaseDetail: (id: string, signal: AbortSignal) =>
    api<ShowcaseDetail>(`/showcase/research/${id}`, { signal }),
};

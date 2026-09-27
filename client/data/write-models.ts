import type { AiGenerateInput, AiResult, AiSettings, AiSettingsInput } from '../../shared/ai';
import type {
  DocumentData,
  PdfJob,
  Research,
  ResearchInput,
  Section,
  User,
  SharingInput,
} from '../../shared/contracts';
import type { DatasetDescription, DatasetDescriptionInput } from '../../shared/datasets';
import { api } from '../api';

type Registration = {
  email: string;
  password: string;
  real_name: string;
  institution: string;
  invite_code?: string;
};
type UploadedFile = { id: string; role: string; name: string; url: string };

/** 写入接口统一组装请求；组件通过返回结果更新草稿，不直接修改其他模块的状态。 */
export const commands = {
  register: (input: Registration) =>
    api('/auth/register', { method: 'POST', body: JSON.stringify(input) }),
  login: (input: { email: string; password: string }) =>
    api<{ user: User; csrf: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  logout: () => api<void>('/auth/logout', { method: 'POST', body: '{}' }),
  saveResearch: (id: string | undefined, input: ResearchInput & { version?: number }) =>
    api<Research>(id ? `/research/${id}` : '/research', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(input),
    }),
  uploadFiles: (id: string, data: FormData) =>
    api<UploadedFile[]>(`/files/research/${id}`, { method: 'POST', body: data }),
  addFactor: (name: string) => api('/factors', { method: 'POST', body: JSON.stringify({ name }) }),
  updateFactor: (id: string, input: { name: string; active: boolean }) =>
    api(`/factors/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  updateUser: (id: string, input: Pick<User, 'role' | 'active'>) =>
    api<void>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  createTeacher: (input: Registration) =>
    api<User>('/users', { method: 'POST', body: JSON.stringify(input) }),
  uploadSpaceFiles: (researchId: string, files: File[], sharing: SharingInput) => {
    const data = new FormData();
    for (const file of files) data.append('files', file);
    data.append('sharing', JSON.stringify(sharing));
    return api<{ id: string; name: string }[]>(`/files/space/${researchId}`, {
      method: 'POST',
      body: data,
    });
  },
  changeFileSharing: (id: string, sharing: SharingInput) =>
    api<void>(`/files/${id}/sharing`, { method: 'PATCH', body: JSON.stringify(sharing) }),
  deleteSpaceFile: (id: string) => api<void>(`/files/${id}`, { method: 'DELETE', body: '{}' }),
  saveDocument: (id: string, section: Section, input: { html: string; revision: number }) =>
    api<DocumentData>(`/documents/research/${id}/${section}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  generatePdf: (id: string, section: Section) =>
    api<PdfJob>(`/documents/research/${id}/${section}/pdf`, { method: 'POST', body: '{}' }),
  parseDataset: (id: string, signal?: AbortSignal) =>
    api<DatasetDescription>(`/datasets/${id}/parse`, { method: 'POST', signal }),
  saveDataset: (id: string, input: DatasetDescriptionInput) =>
    api<DatasetDescription>(`/datasets/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  saveAiSettings: (input: AiSettingsInput) =>
    api<AiSettings>('/ai/settings', { method: 'PUT', body: JSON.stringify(input) }),
  testAi: () => api<{ message: string }>('/ai/test', { method: 'POST', body: '{}' }),
  generateAi: (input: AiGenerateInput, signal?: AbortSignal) =>
    api<AiResult>('/ai/generate', { method: 'POST', body: JSON.stringify(input), signal }),
};

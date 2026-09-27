let csrf = '';
const base = import.meta.env.VITE_API_BASE || '';
export function setCsrf(value: string) {
  csrf = value;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: { path: string; message: string }[],
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}/api${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        'X-CSRF-Token': csrf,
        ...options.headers,
      },
    });
  } catch {
    throw new ApiError(0, '无法连接服务，请检查网络或确认服务已启动');
  }
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: '请求失败，请稍后重试' }));
    if (response.status === 401 && path !== '/auth/login' && path !== '/auth/me') {
      window.dispatchEvent(new Event('session-expired'));
    }
    throw new ApiError(response.status, error.message, error.fields);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json();
}
export function errorMessage(error: unknown) {
  return error instanceof ApiError && error.fields?.length
    ? error.fields.map((f) => f.message).join('；')
    : error instanceof Error
      ? error.message
      : '操作失败，请重试';
}
export const fileUrl = (id: string, download = false) =>
  `${base}/api/files/${id}/content${download ? '?download=1' : ''}`;

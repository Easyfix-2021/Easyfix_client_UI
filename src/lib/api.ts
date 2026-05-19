/*
 * Thin wrapper around fetch for the Client SPOC portal.
 * Token: stored in `localStorage.client_auth_token` and sent as Bearer.
 * Backend mounts under /api/client/*; we use /api proxy via next rewrites.
 */
export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const TOKEN_KEY = 'client_auth_token';

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}
export function setToken(t: string | null) {
  if (typeof window === 'undefined') return;
  if (t) window.localStorage.setItem(TOKEN_KEY, t);
  else window.localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`/api/client${path}`, { ...init, headers, credentials: 'include' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.success === false) {
    throw new ApiError(body?.error || `HTTP ${res.status}`, res.status, body?.details);
  }
  return body?.data as T;
}

// All verbs accept an optional `init` (RequestInit) so callers can pass
// e.g. an AbortSignal — `useFetch` in @/lib/hooks relies on this to
// cancel in-flight requests when component deps change or unmount.
export const api = {
  get:    <T>(p: string,            init?: RequestInit) => request<T>(p, init),
  post:   <T>(p: string, body: any, init?: RequestInit) => request<T>(p, { ...init, method: 'POST',   body: JSON.stringify(body) }),
  put:    <T>(p: string, body: any, init?: RequestInit) => request<T>(p, { ...init, method: 'PUT',    body: JSON.stringify(body) }),
  patch:  <T>(p: string, body: any, init?: RequestInit) => request<T>(p, { ...init, method: 'PATCH',  body: JSON.stringify(body) }),
  delete: <T>(p: string,            init?: RequestInit) => request<T>(p, { ...init, method: 'DELETE' }),
};

// Download blob (used by /export/jobs to trigger Excel download).
export async function downloadBlob(path: string, filename: string) {
  const token = getToken();
  const res = await fetch(`/api/client${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    credentials: 'include',
  });
  if (!res.ok) throw new ApiError(`download failed (${res.status})`, res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Same-origin fetch wrapper. Every request carries credentials and X-Requested-With; JSON errors become ApiError.
 * 401 redirects to /login (except on /login and /invite). When VITE_MOCK_API=1 (dev only) requests are served
 * by the in-memory mock in ./mock.ts so every screen can be built before the server exists.
 */
export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export const MOCK_MODE = import.meta.env.VITE_MOCK_API === '1';

function onUnauthorized(): void {
  const p = window.location.pathname;
  if (p.startsWith('/login') || p.startsWith('/invite')) return;
  const next = encodeURIComponent(p + window.location.search);
  window.location.assign(`/login?next=${next}`);
}

export async function api<T>(method: Method, path: string, body?: unknown, opts: { noRedirect?: boolean } = {}): Promise<T> {
  if (MOCK_MODE) {
    const { mockRequest } = await import('./mock');
    try {
      return (await mockRequest(method, path, body)) as T;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && !opts.noRedirect) onUnauthorized();
      throw e;
    }
  }
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'include',
      headers: {
        'X-Requested-With': 'base-case',
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw new ApiError(0, 'Network error: the server could not be reached.');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const err = (data ?? {}) as { error?: string; code?: string; message?: string };
    if (res.status === 401 && !opts.noRedirect) onUnauthorized();
    throw new ApiError(res.status, err.error ?? err.message ?? `Request failed (${res.status})`, err.code);
  }
  return data as T;
}

/** Accept either a bare array or an envelope { key: [...] } / { items: [...] }. */
export function unwrapList<T>(data: unknown, key?: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>;
    if (key && Array.isArray(o[key])) return o[key] as T[];
    for (const k of ['items', 'data', 'results', 'rows']) if (Array.isArray(o[k])) return o[k] as T[];
    for (const v of Object.values(o)) if (Array.isArray(v)) return v as T[];
  }
  return [];
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

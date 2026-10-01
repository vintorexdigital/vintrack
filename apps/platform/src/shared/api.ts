export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public errors: { path: string; message: string }[] = []) {
    super(message);
  }
}

let token: string | null = null;
let lost: (() => void) | null = null;
let refreshing: Promise<string | null> | null = null;
export const platformToken = { set: (t: string | null) => { token = t; }, onLost: (f: () => void) => { lost = f; } };

async function problem(res: Response): Promise<ApiError> {
  const b = (await res.json().catch(() => null)) as { code?: string; detail?: string; errors?: { path: string; message: string }[] } | null;
  return new ApiError(res.status, b?.code ?? 'http_error', b?.detail ?? res.statusText, b?.errors ?? []);
}

export function refreshPlatform(): Promise<string | null> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/platform/v1/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (!res.ok) return null;
      token = ((await res.json()) as { accessToken: string }).accessToken;
      return token;
    } catch { return null; } finally { setTimeout(() => { refreshing = null; }, 0); }
  })();
  return refreshing;
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; query?: Record<string, string | number | undefined>; bearer?: string } = {}): Promise<T> {
  const url = new URL(`${API_URL}${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  const go = () => fetch(url, {
    method: opts.method ?? 'GET', credentials: 'include',
    headers: { ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}), ...((opts.bearer ?? token) ? { authorization: `Bearer ${opts.bearer ?? token}` } : {}) },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  let res = await go();
  if (res.status === 401 && !path.includes('/auth/') && !opts.bearer) {
    if (await refreshPlatform()) res = await go(); else { lost?.(); throw await problem(res); }
  }
  if (!res.ok) throw await problem(res);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

import type { Problem } from '@trackrex/schemas';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public errors: { path: string; message: string }[] = [], public requestId?: string) {
    super(message);
  }
}

let accessToken: string | null = null;
let onSessionLost: (() => void) | null = null;
let refreshing: Promise<string | null> | null = null;

export const tokenStore = {
  set: (t: string | null) => { accessToken = t; },
  get: () => accessToken,
  onLost: (fn: () => void) => { onSessionLost = fn; },
};

async function parseProblem(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as Problem | null;
  return new ApiError(res.status, body?.code ?? 'http_error', body?.detail ?? res.statusText, body?.errors ?? [], body?.requestId);
}

/** One refresh at a time: the httpOnly cookie rotates on use, so parallel refreshes would trip reuse detection. */
export function refreshSession(): Promise<string | null> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/v1/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: '{}' });
      if (!res.ok) return null;
      const body = (await res.json()) as { accessToken: string };
      accessToken = body.accessToken;
      return accessToken;
    } catch {
      return null;
    } finally {
      setTimeout(() => { refreshing = null; }, 0);
    }
  })();
  return refreshing;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined | null> | URLSearchParams;
  body?: unknown;
  signal?: AbortSignal;
  /** Return the Response itself (downloads). */
  raw?: boolean;
  idempotencyKey?: string;
  /** Send raw bytes (an image) instead of JSON. */
  blob?: Blob;
}

function url(path: string, query?: RequestOptions['query']): string {
  const u = new URL(path.startsWith('http') ? path : `${API_URL}${path}`);
  if (query instanceof URLSearchParams) query.forEach((v, k) => u.searchParams.set(k, v));
  else for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, String(v));
  return u.toString();
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const doFetch = () =>
    fetch(url(path, opts.query), {
      method: opts.method ?? 'GET',
      credentials: 'include',
      signal: opts.signal ?? null,
      headers: {
        ...(opts.blob ? { 'content-type': opts.blob.type || 'image/jpeg' } : opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...(opts.idempotencyKey ? { 'idempotency-key': opts.idempotencyKey } : {}),
        'x-client': 'web',
      },
      ...(opts.blob ? { body: opts.blob } : opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
  let res = await doFetch();
  if (res.status === 401 && !path.includes('/auth/')) {
    const t = await refreshSession();
    if (t) res = await doFetch();
    else {
      onSessionLost?.();
      throw await parseProblem(res);
    }
  }
  if (!res.ok) throw await parseProblem(res);
  if (opts.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Download a file endpoint with the bearer token (an <a href> cannot send it). */
export async function download(path: string, query: RequestOptions['query'], fallbackName: string): Promise<void> {
  const res = await api<Response>(path, { query, raw: true });
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? fallbackName;
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Any picture the browser can decode, re-encoded as a JPEG no wider than `maxEdge` (the server accepts JPEG only). */
export async function toJpeg(file: Blob, maxEdge = 1600): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read that picture.'))), 'image/jpeg', 0.82));
}

/** Fetch a protected image and return a short-lived object URL for an <img>. */
export async function imageUrl(path: string): Promise<string> {
  const res = await api<Response>(path, { raw: true });
  return URL.createObjectURL(await res.blob());
}

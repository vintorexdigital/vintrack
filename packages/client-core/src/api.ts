import type { KeyValueStore } from './storage';

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly fieldErrors: { path: string; message: string }[] = [], public readonly requestId?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The request never produced an HTTP response: offline, DNS, TLS, timeout. Safe to retry with the same idempotency key. */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super('Could not reach the server.');
    this.name = 'NetworkError';
    this.cause = cause;
  }
}

export const isNetworkError = (e: unknown): e is NetworkError => e instanceof NetworkError;

export interface ApiOptions {
  baseUrl: string;
  store: KeyValueStore;
  fetch?: typeof fetch;
  newId: () => string;
  onSessionLost?: () => void;
  timeoutMs?: number;
  /** Which kind of app is calling; the server enforces idempotency keys and per-source rules by this. */
  client?: 'mobile' | 'desktop';
}

export interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Mutations always carry one. Pass a stored id to make a retry replay the original instead of repeating it. */
  idempotencyKey?: string;
  auth?: boolean;
  /** Send raw bytes instead of JSON (uploads). */
  bytes?: { data: Uint8Array; contentType: string };
}

export interface Tokens { accessToken: string; refreshToken: string }
const REFRESH_KEY = 'trk.refresh';
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * HTTP client for the Trackrex API. Keeps the access token in memory and the rotating refresh token in
 * secure storage, refreshes once on a 401 (one refresh at a time, because rotation makes reuse fatal), and
 * tells apart "the server said no" (ApiError) from "the server was not reached" (NetworkError).
 */
export class ApiClient {
  private accessToken: string | null = null;
  private refreshing: Promise<boolean> | null = null;
  private readonly doFetch: typeof fetch;

  constructor(private readonly opts: ApiOptions) {
    // Browsers throw "Illegal invocation" if fetch is called as a method of another object, so never store it bare.
    const f = opts.fetch ?? fetch;
    this.doFetch = (input, init) => f(input, init);
  }

  get signedIn(): boolean { return this.accessToken !== null; }

  async setSession(t: Tokens): Promise<void> {
    this.accessToken = t.accessToken;
    await this.opts.store.set(REFRESH_KEY, t.refreshToken);
  }

  async clearSession(): Promise<void> {
    this.accessToken = null;
    await this.opts.store.remove(REFRESH_KEY);
  }

  /** On app start: turn the stored refresh token into an access token. False means nobody is signed in. */
  async restore(): Promise<boolean> {
    if (!(await this.opts.store.get(REFRESH_KEY))) return false;
    return this.refresh();
  }

  private refresh(): Promise<boolean> {
    this.refreshing ??= (async () => {
      const token = await this.opts.store.get(REFRESH_KEY);
      if (!token) return false;
      const res = await this.send('POST', '/v1/auth/refresh', { body: { refreshToken: token }, auth: false });
      if (res.status >= 500) throw new ApiError(res.status, 'server_error', 'The server had a problem.');
      if (!res.ok) {
        await this.clearSession();
        this.opts.onSessionLost?.();
        return false;
      }
      const body = (await res.json()) as Tokens;
      await this.setSession(body);
      return true;
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  private async send(method: string, path: string, o: RequestOptions): Promise<Response> {
    const url = new URL(path, this.opts.baseUrl);
    for (const [k, v] of Object.entries(o.query ?? {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    const headers: Record<string, string> = { 'x-client': this.opts.client ?? 'mobile', accept: 'application/json' };
    if (o.bytes) headers['content-type'] = o.bytes.contentType;
    else if (o.body !== undefined) headers['content-type'] = 'application/json';
    if (o.auth !== false && this.accessToken) headers.authorization = `Bearer ${this.accessToken}`;
    if (MUTATING.has(method)) headers['idempotency-key'] = o.idempotencyKey ?? this.opts.newId();
    const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), this.opts.timeoutMs ?? 20_000) : null;
    try {
      return await this.doFetch(url.toString(), { method, headers, ...(o.bytes ? { body: o.bytes.data as unknown as BodyInit } : o.body !== undefined ? { body: JSON.stringify(o.body) } : {}), ...(ctl ? { signal: ctl.signal } : {}) });
    } catch (e) {
      throw new NetworkError(e);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async request<T = unknown>(method: string, path: string, o: RequestOptions = {}): Promise<T> {
    // Reuse one key across the refresh retry so a retried mutation is never applied twice.
    const opts = MUTATING.has(method) && !o.idempotencyKey ? { ...o, idempotencyKey: this.opts.newId() } : o;
    let res = await this.send(method, path, opts);
    if (res.status === 401 && opts.auth !== false && !path.startsWith('/v1/auth/')) {
      if (await this.refresh()) res = await this.send(method, path, opts);
    }
    if (!res.ok) {
      const p = (await res.json().catch(() => null)) as { code?: string; detail?: string; errors?: { path: string; message: string }[]; requestId?: string } | null;
      throw new ApiError(res.status, p?.code ?? 'http_error', p?.detail ?? res.statusText, p?.errors ?? [], p?.requestId);
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  putBytes<T>(path: string, data: Uint8Array, contentType: string, o: RequestOptions = {}) { return this.request<T>('PUT', path, { ...o, bytes: { data, contentType } }); }
  get<T>(path: string, query?: RequestOptions['query']) { return this.request<T>('GET', path, query ? { query } : {}); }
  post<T>(path: string, body?: unknown, o: RequestOptions = {}) { return this.request<T>('POST', path, { ...o, ...(body !== undefined ? { body } : {}) }); }
}

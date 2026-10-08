import { toSearchParams, type EntityKit, type ListQuery, type Page, type Problem } from '@trackrex/schemas';

export class TrackrexError extends Error {
  constructor(public readonly status: number, public readonly problem: Problem) {
    super(problem.detail ?? problem.title);
  }
  get code(): string {
    return this.problem.code;
  }
}

export interface ClientOptions {
  baseUrl: string;
  /** Called before each request. Return the current access token (or an API key). */
  getToken: () => string | null | Promise<string | null>;
  /** One of 'web' | 'mobile' | 'desktop' | 'api'. Mobile and desktop mutations send Idempotency-Key automatically. */
  client?: 'web' | 'mobile' | 'desktop' | 'api';
  fetch?: typeof fetch;
  /** Called once when a request returns 401, so the app can refresh the token and retry. Return true to retry. */
  onUnauthorized?: () => Promise<boolean>;
  newKey?: () => string;
}

type Row = Record<string, unknown> & { id: string; version: number };
export type QueryInput = Partial<Pick<ListQuery, 'q' | 'sort' | 'filters' | 'limit' | 'deleted' | 'directOnly'>> & { cursor?: string; includeTotal?: boolean };

/**
 * Typed client over the entity definitions in `packages/schemas`: the same schemas that validate on the
 * server describe the resources here, so there is no second list of fields to keep in step.
 */
export function createClient(opts: ClientOptions) {
  const f = opts.fetch ?? fetch;
  const key = opts.newKey ?? (() => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`));

  async function request<T>(method: string, path: string, init: { query?: URLSearchParams; body?: unknown; idempotent?: boolean } = {}): Promise<T> {
    const mutating = method !== 'GET';
    const send = async (): Promise<Response> => {
      const token = await opts.getToken();
      const url = `${opts.baseUrl}${path}${init.query && [...init.query].length ? `?${init.query}` : ''}`;
      return f(url, {
        method,
        credentials: 'include',
        headers: {
          ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          'x-client': opts.client ?? 'api',
          ...(mutating && (init.idempotent ?? (opts.client === 'mobile' || opts.client === 'desktop')) ? { 'idempotency-key': key() } : {}),
        },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      });
    };
    let res = await send();
    if (res.status === 401 && opts.onUnauthorized && (await opts.onUnauthorized())) res = await send();
    if (!res.ok) throw new TrackrexError(res.status, (await res.json().catch(() => ({ title: res.statusText, status: res.status, code: 'http_error', type: 'about:blank' }))) as Problem);
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  const resource = <R extends Row = Row>(kit: EntityKit) => {
    const base = `/v1${kit.def.path}`;
    return {
      kit,
      list: (q: QueryInput = {}): Promise<Page<R>> => request('GET', base, { query: toSearchParams(q as never) }),
      /** Walk every page. Use for exports and syncs, not for screens. */
      async *all(q: QueryInput = {}): AsyncGenerator<R> {
        let cursor: string | undefined;
        do {
          const page: Page<R> = await request('GET', base, { query: toSearchParams({ ...q, limit: 100, ...(cursor ? { cursor } : {}) } as never) });
          yield* page.data;
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
      },
      get: (id: string): Promise<R> => request('GET', `${base}/${id}`),
      create: (body: unknown): Promise<R> => request('POST', base, { body: kit.createSchema.parse(body) }),
      update: (id: string, body: unknown, version?: number): Promise<R> => request('PATCH', `${base}/${id}`, { body: { ...(kit.updateSchema.parse(body) as object), ...(version ? { version } : {}) } }),
      remove: (id: string, reason?: string): Promise<R> => request('DELETE', `${base}/${id}`, { query: new URLSearchParams(reason ? { reason } : {}) }),
      restore: (id: string): Promise<R> => request('POST', `${base}/${id}/restore`, { body: {} }),
      bulk: (action: 'delete' | 'restore' | 'update', ids: string[], extra: { reason?: string; patch?: Record<string, unknown> } = {}) => request<{ results: { id: string; ok: boolean }[] }>('POST', `${base}/bulk`, { body: { action, ids, ...extra } }),
    };
  };

  return {
    resource,
    request,
    auth: {
      login: (identifier: string, password: string, tenant?: string) => request<{ status: string; accessToken?: string; refreshToken?: string; selectionToken?: string }>('POST', '/v1/auth/login', { body: { identifier, password, ...(tenant ? { tenant } : {}) } }),
      refresh: (refreshToken?: string) => request<{ accessToken: string; refreshToken?: string }>('POST', '/v1/auth/refresh', { body: refreshToken ? { refreshToken } : {} }),
      me: () => request<Record<string, unknown>>('GET', '/v1/auth/me'),
    },
    attendance: {
      punch: (body: Record<string, unknown> = {}) => request<{ id: string; type: 'in' | 'out'; at: string }>('POST', '/v1/attendance/punches', { body }),
      status: () => request<Record<string, unknown>>('GET', '/v1/attendance/status'),
      day: (employeeId: string, date: string) => request<Record<string, unknown>>('GET', `/v1/attendance/days/${employeeId}/${date}`),
    },
    leave: {
      balances: (employeeId?: string) => request<Record<string, unknown>[]>('GET', '/v1/leave/balances', { query: new URLSearchParams(employeeId ? { employeeId } : {}) }),
    },
  };
}
export type TrackrexClient = ReturnType<typeof createClient>;

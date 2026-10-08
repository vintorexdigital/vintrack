import { ApiClient } from './api';
import { MemoryStore } from './storage';

export interface Call { method: string; url: URL; headers: Record<string, string>; body: unknown }
export type Handler = (call: Call) => { status?: number; body?: unknown } | 'network-error' | Promise<{ status?: number; body?: unknown } | 'network-error'>;

/** A scripted server: routes by "METHOD /path" and records every call. */
export function fakeServer(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const call: Call = { method: init.method ?? 'GET', url: u, headers: (init.headers ?? {}) as Record<string, string>, body: init.body ? (typeof init.body === 'string' ? JSON.parse(init.body) : init.body) : undefined };
    calls.push(call);
    const h = routes[`${call.method} ${u.pathname}`];
    if (!h) return new Response(JSON.stringify({ code: 'route_not_found', detail: 'nope' }), { status: 404 });
    const r = await h(call);
    if (r === 'network-error') throw new TypeError('Network request failed');
    return new Response(r.status === 204 ? null : JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

let n = 0;
export const seqId = () => `id-${++n}`;

export function makeApi(routes: Record<string, Handler>, over: { lost?: () => void } = {}) {
  const store = new MemoryStore();
  const server = fakeServer(routes);
  const api = new ApiClient({ baseUrl: 'http://api.test', store, fetch: server.fetchFn, newId: seqId, ...(over.lost ? { onSessionLost: over.lost } : {}) });
  return { api, store, ...server };
}

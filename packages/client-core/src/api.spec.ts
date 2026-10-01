import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError, NetworkError } from './api';
import { MemoryStore } from './storage';
import { makeApi } from './test-utils';

describe('ApiClient', () => {
  it('calls fetch without binding it to the client (browsers refuse that)', async () => {
    const strict = function (this: unknown) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      return Promise.resolve(new Response('{"ok":true}', { status: 200 }));
    } as unknown as typeof fetch;
    const api = new ApiClient({ baseUrl: 'http://api.test', store: new MemoryStore(), fetch: strict, newId: () => 'k' });
    expect(await api.get('/v1/x')).toEqual({ ok: true });
  });

  it('sends the bearer token, the client header and an idempotency key on writes only', async () => {
    const { api, calls } = makeApi({ 'GET /v1/x': () => ({ body: { ok: 1 } }), 'POST /v1/x': () => ({ body: { ok: 2 } }) });
    await api.setSession({ accessToken: 'A1', refreshToken: 'R1' });
    await api.get('/v1/x');
    await api.post('/v1/x', { a: 1 });
    expect(calls[0]!.headers).toMatchObject({ authorization: 'Bearer A1', 'x-client': 'mobile' });
    expect(calls[0]!.headers['idempotency-key']).toBeUndefined();
    expect(calls[1]!.headers['idempotency-key']).toBeTruthy();
    expect(calls[1]!.body).toEqual({ a: 1 });
  });

  it('refreshes once on 401, rotates the stored refresh token and replays the same idempotency key', async () => {
    let first = true;
    const { api, calls, store } = makeApi({
      'POST /v1/auth/refresh': () => ({ body: { accessToken: 'A2', refreshToken: 'R2' } }),
      'POST /v1/things': (c) => (c.headers.authorization === 'Bearer A2' ? { body: { done: true } } : (first = false, { status: 401, body: { code: 'unauthorized' } })),
    });
    await api.setSession({ accessToken: 'A1', refreshToken: 'R1' });
    expect(await api.post('/v1/things', {})).toEqual({ done: true });
    expect(first).toBe(false);
    expect(await store.get('trk.refresh')).toBe('R2');
    const writes = calls.filter((c) => c.url.pathname === '/v1/things');
    expect(writes).toHaveLength(2);
    expect(writes[0]!.headers['idempotency-key']).toBe(writes[1]!.headers['idempotency-key']);
  });

  it('shares one refresh between simultaneous 401s (rotation makes a second use fatal)', async () => {
    let refreshes = 0;
    const { api } = makeApi({
      'POST /v1/auth/refresh': async () => { refreshes++; await new Promise((r) => setTimeout(r, 10)); return { body: { accessToken: 'A2', refreshToken: 'R2' } }; },
      'GET /v1/a': (c) => (c.headers.authorization === 'Bearer A2' ? { body: 1 } : { status: 401, body: {} }),
      'GET /v1/b': (c) => (c.headers.authorization === 'Bearer A2' ? { body: 2 } : { status: 401, body: {} }),
    });
    await api.setSession({ accessToken: 'old', refreshToken: 'R1' });
    expect(await Promise.all([api.get('/v1/a'), api.get('/v1/b')])).toEqual([1, 2]);
    expect(refreshes).toBe(1);
  });

  it('signs the person out when the refresh token is refused, but not when the network is down', async () => {
    const lost = vi.fn();
    const refused = makeApi({ 'POST /v1/auth/refresh': () => ({ status: 401, body: { code: 'invalid_refresh' } }), 'GET /v1/a': () => ({ status: 401, body: {} }) }, { lost });
    await refused.api.setSession({ accessToken: 'A', refreshToken: 'R' });
    await expect(refused.api.get('/v1/a')).rejects.toBeInstanceOf(ApiError);
    expect(lost).toHaveBeenCalledTimes(1);
    expect(await refused.store.get('trk.refresh')).toBeNull();

    const lost2 = vi.fn();
    const offline = makeApi({ 'POST /v1/auth/refresh': () => 'network-error', 'GET /v1/a': () => ({ status: 401, body: {} }) }, { lost: lost2 });
    await offline.api.setSession({ accessToken: 'A', refreshToken: 'R' });
    await expect(offline.api.get('/v1/a')).rejects.toBeInstanceOf(NetworkError);
    expect(lost2).not.toHaveBeenCalled();
    expect(await offline.store.get('trk.refresh')).toBe('R');
  });

  it('turns problem+json into ApiError with code and field errors', async () => {
    const { api } = makeApi({ 'POST /v1/p': () => ({ status: 422, body: { code: 'punch_too_late', detail: 'Too late.', errors: [{ path: 'at', message: 'Late' }], requestId: 'rq1' } }) });
    const e = (await api.post('/v1/p', {}).catch((x: unknown) => x)) as ApiError;
    expect(e).toMatchObject({ status: 422, code: 'punch_too_late', message: 'Too late.', requestId: 'rq1' });
    expect(e.fieldErrors).toEqual([{ path: 'at', message: 'Late' }]);
  });

  it('restores a session from the stored refresh token on start', async () => {
    const { api, store } = makeApi({ 'POST /v1/auth/refresh': (c) => ((c.body as { refreshToken: string }).refreshToken === 'R9' ? { body: { accessToken: 'A9', refreshToken: 'R10' } } : { status: 401, body: {} }) });
    expect(await api.restore()).toBe(false);
    await store.set('trk.refresh', 'R9');
    expect(await api.restore()).toBe(true);
    expect(api.signedIn).toBe(true);
    expect(await store.get('trk.refresh')).toBe('R10');
  });
});

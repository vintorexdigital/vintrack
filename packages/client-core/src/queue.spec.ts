import { describe, expect, it } from 'vitest';
import { OfflineQueue } from './queue';
import { makeApi, seqId } from './test-utils';

describe('OfflineQueue', () => {
  it('sends in order, using each item id as its idempotency key', async () => {
    const seen: string[] = [];
    const { api, store, calls } = makeApi({ 'POST /v1/w': (c) => { seen.push(String((c.body as { n: number }).n)); return { body: {} }; } });
    await api.setSession({ accessToken: 'A', refreshToken: 'R' });
    const q = new OfflineQueue(store, seqId);
    const a = await q.enqueue({ method: 'POST', path: '/v1/w', body: { n: 1 }, label: 'one' });
    await q.enqueue({ method: 'POST', path: '/v1/w', body: { n: 2 }, label: 'two' });
    expect(await q.flush(api)).toMatchObject({ sent: 2, failed: 0, remaining: 0, stoppedBy: null });
    expect(seen).toEqual(['1', '2']);
    expect(calls[0]!.headers['idempotency-key']).toBe(a.id);
    expect(q.size).toBe(0);
  });

  it('survives a restart: a new queue on the same storage still has the items', async () => {
    const { store } = makeApi({});
    const q1 = new OfflineQueue(store, seqId);
    await q1.enqueue({ method: 'POST', path: '/v1/w', body: { n: 1 }, label: 'kept' });
    const q2 = new OfflineQueue(store, seqId);
    await q2.load();
    expect(q2.pending().map((p) => p.label)).toEqual(['kept']);
  });

  it('stops on a network error and keeps everything, then resumes later without duplicates', async () => {
    let online = false;
    const got: number[] = [];
    const { api, store } = makeApi({ 'POST /v1/w': (c) => { if (!online) return 'network-error'; got.push((c.body as { n: number }).n); return { body: {} }; } });
    await api.setSession({ accessToken: 'A', refreshToken: 'R' });
    const q = new OfflineQueue(store, seqId);
    await q.enqueue({ method: 'POST', path: '/v1/w', body: { n: 1 }, label: '1' });
    await q.enqueue({ method: 'POST', path: '/v1/w', body: { n: 2 }, label: '2' });
    expect(await q.flush(api)).toMatchObject({ sent: 0, remaining: 2, stoppedBy: 'network' });
    online = true;
    expect(await q.flush(api)).toMatchObject({ sent: 2, remaining: 0 });
    expect(got).toEqual([1, 2]);
  });

  it('moves a refused item to needs-attention without blocking the ones behind it', async () => {
    const { api, store } = makeApi({ 'POST /v1/w': (c) => ((c.body as { n: number }).n === 1 ? { status: 422, body: { code: 'punch_too_late', detail: 'Too late.' } } : { body: {} }) });
    await api.setSession({ accessToken: 'A', refreshToken: 'R' });
    const q = new OfflineQueue(store, seqId);
    await q.enqueue({ method: 'POST', path: '/v1/w', body: { n: 1 }, label: 'Punch in' });
    await q.enqueue({ method: 'POST', path: '/v1/w', body: { n: 2 }, label: 'next' });
    const r = await q.flush(api);
    expect(r).toMatchObject({ sent: 1, failed: 1, remaining: 0 });
    expect(q.failed()[0]).toMatchObject({ label: 'Punch in', code: 'punch_too_late', error: 'Too late.' });
    await q.dismissFailed(q.failed()[0]!.id);
    expect(q.failed()).toHaveLength(0);
  });

  it('retries on server errors and drops quiet items silently when refused', async () => {
    let fail = true;
    const { api, store } = makeApi({ 'POST /v1/w': () => (fail ? { status: 503, body: {} } : { body: {} }), 'POST /v1/q': () => ({ status: 403, body: { code: 'forbidden' } }) });
    await api.setSession({ accessToken: 'A', refreshToken: 'R' });
    const q = new OfflineQueue(store, seqId);
    await q.enqueue({ method: 'POST', path: '/v1/w', body: {}, label: 'w' });
    expect(await q.flush(api)).toMatchObject({ stoppedBy: 'server', remaining: 1 });
    expect(q.pending()[0]!.attempts).toBe(1);
    fail = false;
    expect(await q.flush(api)).toMatchObject({ sent: 1, remaining: 0 });
    await q.enqueue({ method: 'POST', path: '/v1/q', body: {}, label: 'pings', quiet: true });
    expect(await q.flush(api)).toMatchObject({ failed: 1 });
    expect(q.failed()).toHaveLength(0);
  });

  it('shares a flush that is already running', async () => {
    let calls = 0;
    const { api, store } = makeApi({ 'POST /v1/w': async () => { calls++; await new Promise((r) => setTimeout(r, 15)); return { body: {} }; } });
    await api.setSession({ accessToken: 'A', refreshToken: 'R' });
    const q = new OfflineQueue(store, seqId);
    await q.enqueue({ method: 'POST', path: '/v1/w', body: {}, label: 'w' });
    const [a, b] = await Promise.all([q.flush(api), q.flush(api)]);
    expect(a).toBe(b);
    expect(calls).toBe(1);
  });
});

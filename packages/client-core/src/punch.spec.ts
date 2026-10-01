import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { MemoryBlobs } from './blobs';
import { punch } from './punch';
import { OfflineQueue } from './queue';
import { makeApi, seqId } from './test-utils';

const at = new Date('2026-03-09T04:05:00Z');
const setup = async (routes: Parameters<typeof makeApi>[0]) => {
  const m = makeApi(routes);
  await m.api.setSession({ accessToken: 'A', refreshToken: 'R' });
  const queue = new OfflineQueue(m.store, seqId);
  return { ...m, queue, deps: { api: m.api, queue, now: () => at, newId: seqId } };
};

describe('punch', () => {
  it('sends straight away when online and lets the server stamp the time', async () => {
    const s = await setup({ 'POST /v1/attendance/punches': () => ({ status: 201, body: { id: 'p1', type: 'in', at: at.toISOString(), warnings: [] } }) });
    const out = await punch(s.deps, { type: 'in', position: { latitude: 13.1, longitude: 80.2, accuracy: 12 } });
    expect(out).toMatchObject({ status: 'sent', result: { id: 'p1' } });
    const body = s.calls[0]!.body as Record<string, unknown>;
    expect(body).toMatchObject({ type: 'in', latitude: 13.1, longitude: 80.2, accuracy: 12 });
    expect(body.at).toBeUndefined();
    expect(body.offline).toBeUndefined();
    expect(s.queue.size).toBe(0);
  });

  it('keeps the tap time when offline, marks it offline, and sends later with the same key', async () => {
    let online = false;
    const s = await setup({ 'POST /v1/attendance/punches': () => (online ? { status: 201, body: { id: 'p1' } } : 'network-error') });
    const out = await punch(s.deps, { type: 'in' });
    expect(out).toEqual({ status: 'queued', at: at.toISOString() });
    const first = s.calls[0]!.headers['idempotency-key'];
    expect(s.queue.pending()[0]).toMatchObject({ id: first, body: { type: 'in', at: at.toISOString(), offline: true } });
    online = true;
    await s.queue.flush(s.api);
    expect(s.calls[1]!.headers['idempotency-key']).toBe(first);
    expect(s.calls[1]!.body).toMatchObject({ at: at.toISOString(), offline: true });
    expect(s.queue.size).toBe(0);
  });

  it('queues behind an existing backlog so punches reach the server in order', async () => {
    const order: string[] = [];
    let online = false;
    const s = await setup({ 'POST /v1/attendance/punches': (c) => { if (!online) return 'network-error'; order.push((c.body as { type: string }).type); return { status: 201, body: {} }; } });
    await punch(s.deps, { type: 'in' });
    online = true;
    await punch(s.deps, { type: 'out' }); // arrives while the in is still waiting
    await s.queue.flush(s.api);
    expect(order).toEqual(['in', 'out']);
  });

  it('surfaces a refusal from the server instead of queueing it', async () => {
    const s = await setup({ 'POST /v1/attendance/punches': () => ({ status: 422, body: { code: 'punch_too_early', detail: 'You can punch in from 15 minutes before your shift starts.' } }) });
    const e = await punch(s.deps, { type: 'in' }).catch((x: unknown) => x as ApiError);
    expect(e).toMatchObject({ code: 'punch_too_early' });
    expect(s.queue.size).toBe(0);
  });

  it('flags mock locations so the server can see them', async () => {
    const s = await setup({ 'POST /v1/attendance/punches': () => ({ status: 201, body: {} }) });
    await punch(s.deps, { type: 'in', position: { latitude: 1, longitude: 2, mock: true } });
    expect((s.calls[0]!.body as { mockLocation: boolean }).mockLocation).toBe(true);
  });
});

describe('punch with a selfie', () => {
  const JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]).toString('base64');
  const ids = { tenantId: 'T', userId: 'U' };

  it('uploads the photo first, then names it in the punch', async () => {
    const s = await setup({ 'PUT /v1/files/selfies/T/U/sel.jpg': () => ({ body: { key: 'k' } }), 'POST /v1/attendance/punches': () => ({ status: 201, body: { id: 'p', warnings: [] } }) });
    const blobs = new MemoryBlobs();
    let n = 0;
    const out = await punch({ ...s.deps, blobs, ids, newId: () => (n++ === 0 ? 'punch-id' : 'sel') }, { type: 'in', selfie: JPEG_B64 });
    expect(out.status).toBe('sent');
    const put = s.calls.find((c) => c.method === 'PUT')!;
    expect(put.url.pathname).toBe('/v1/files/selfies/T/U/sel.jpg');
    expect(put.headers['content-type']).toBe('image/jpeg');
    expect((s.calls.find((c) => c.method === 'POST')!.body as { selfieKey: string }).selfieKey).toBe('selfies/T/U/sel.jpg');
  });

  it('offline: keeps the photo on the phone, uploads it before the punch, and sends both on reconnect', async () => {
    let online = false;
    const order: string[] = [];
    const s = await setup({
      'PUT /v1/files/selfies/T/U/sel.jpg': (c) => { if (!online) return 'network-error'; order.push(`put:${c.body instanceof Uint8Array ? 'bytes' : 'json'}`); return { body: {} }; },
      'POST /v1/attendance/punches': () => { if (!online) return 'network-error'; order.push('punch'); return { status: 201, body: {} }; },
    });
    const blobs = new MemoryBlobs();
    const queue = new OfflineQueue(s.store, seqId, () => at, blobs);
    let n = 0;
    const deps = { api: s.api, queue, now: () => at, newId: () => (n++ === 0 ? 'punch-id' : n === 2 ? 'sel' : `x${n}`), blobs, ids };
    const out = await punch(deps, { type: 'in', selfie: JPEG_B64 });
    expect(out.status).toBe('queued');
    expect(queue.pending().map((p) => p.label)).toEqual(['Selfie upload', 'Punch in at ' + at.toTimeString().slice(0, 5)]);
    expect(blobs.data.size).toBe(1);
    await new Promise((r) => setTimeout(r, 10)); // let the background attempt made at tap time finish
    online = true;
    expect(await queue.flush(s.api)).toMatchObject({ sent: 2, remaining: 0 });
    expect(order).toEqual(['put:bytes', 'punch']);
    expect(blobs.data.size).toBe(0);
    expect((s.calls.filter((c) => c.method === 'POST').pop()!.body as { selfieKey: string; offline: boolean })).toMatchObject({ selfieKey: 'selfies/T/U/sel.jpg', offline: true });
  });

  it('a lost photo fails that upload visibly instead of blocking the queue', async () => {
    const s = await setup({ 'POST /v1/attendance/punches': () => ({ status: 201, body: {} }) });
    const queue = new OfflineQueue(s.store, seqId, () => at, new MemoryBlobs());
    await queue.enqueue({ method: 'PUT', path: '/v1/files/selfies/T/U/x.jpg', blob: { id: 'gone', contentType: 'image/jpeg' }, label: 'Selfie upload' });
    await queue.enqueue({ method: 'POST', path: '/v1/attendance/punches', body: {}, label: 'Punch in' });
    expect(await queue.flush(s.api)).toMatchObject({ sent: 1, failed: 1 });
    expect(queue.failed()[0]).toMatchObject({ label: 'Selfie upload', code: 'file_missing' });
  });
});

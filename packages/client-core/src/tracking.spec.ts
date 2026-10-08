import { describe, expect, it } from 'vitest';
import { OfflineQueue } from './queue';
import { MemoryStore } from './storage';
import { PingBuffer, type TrackPoint, type TrackingPolicy } from './tracking';
import { makeApi, seqId } from './test-utils';

const policy: TrackingPolicy = { enabled: true, intervalSeconds: 120 };
const pt = (min: number, extra: Partial<TrackPoint> = {}): TrackPoint => ({ at: new Date(Date.UTC(2026, 2, 9, 4, min)).toISOString(), latitude: 13 + min / 1000, longitude: 80.2, accuracy: 9.6, ...extra });

describe('PingBuffer', () => {
  it('honours the company interval and the tracking switch', async () => {
    const b = new PingBuffer(new MemoryStore());
    expect(await b.add(pt(0), policy)).toBe(true);
    expect(await b.add(pt(1), policy)).toBe(false); // 60 s later, interval is 120 s
    expect(await b.add(pt(2), policy)).toBe(true);
    expect(await b.add(pt(10), { enabled: false, intervalSeconds: 120 })).toBe(false);
    expect(b.size).toBe(2);
  });

  it('keeps its points across a restart', async () => {
    const store = new MemoryStore();
    const a = new PingBuffer(store);
    await a.add(pt(0), policy);
    const b = new PingBuffer(store);
    await b.load();
    expect(b.size).toBe(1);
  });

  it('moves points into the queue in batches of 100, oldest first, as quiet requests', async () => {
    const store = new MemoryStore();
    const b = new PingBuffer(store);
    for (let i = 0; i < 230; i++) await b.add(pt(0, { at: new Date(Date.UTC(2026, 2, 9, 4, 0, i * 200)).toISOString() }), policy);
    const q = new OfflineQueue(new MemoryStore(), seqId);
    expect(await b.drainTo(q, 'dev1')).toBe(230);
    expect(q.pending().map((p) => (p.body as { pings: unknown[] }).pings.length)).toEqual([100, 100, 30]);
    expect(q.pending().every((p) => p.quiet && p.path === '/v1/location/pings')).toBe(true);
    const first = (q.pending()[0]!.body as { deviceId: string; pings: { accuracy: number; at: string }[] });
    expect(first.deviceId).toBe('dev1');
    expect(first.pings[0]!.accuracy).toBe(10); // rounded: the API takes metres
    expect(b.size).toBe(0);
  });

  it('delivers through the queue and tolerates the server saying the point was outside working time', async () => {
    const { api, store } = makeApi({ 'POST /v1/location/pings': () => ({ body: { accepted: 0, outsideWorkingTime: 1, trackingEnabled: true } }) });
    await api.setSession({ accessToken: 'A', refreshToken: 'R' });
    const q = new OfflineQueue(store, seqId);
    const b = new PingBuffer(new MemoryStore());
    await b.add(pt(0), policy);
    await b.drainTo(q);
    expect(await q.flush(api)).toMatchObject({ sent: 1, failed: 0 });
  });
});

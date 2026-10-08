import { ApiClient, MemoryStore, OfflineQueue } from '@trackrex/client-core';
import { describe, expect, it } from 'vitest';
import { Agent } from './agent';
import { Bucketizer } from './bucketizer';
import { applyPolicy } from './privacy';
import type { ActivityPolicy } from './types';

const policy = (o: Partial<ActivityPolicy> = {}): ActivityPolicy => ({ enabled: true, windowTitles: 'drop', fullUrls: false, screenshots: false, ...o });
const T0 = Date.UTC(2026, 2, 9, 4, 30, 0);

describe('applyPolicy', () => {
  it('drops, hashes or keeps titles and reduces URLs to the domain unless allowed', () => {
    const s = { app: 'Chrome.exe', title: 'Salary sheet', url: 'https://www.Bank.com/accounts?id=7' };
    expect(applyPolicy(s, policy())).toEqual({ app: 'chrome', url: 'https://bank.com' });
    const hashed = applyPolicy(s, policy({ windowTitles: 'hash' }));
    expect(hashed.title).toMatch(/^[0-9a-f]{16}$/);
    expect(hashed.title).not.toContain('Salary');
    expect(applyPolicy(s, policy({ windowTitles: 'keep', fullUrls: true }))).toMatchObject({ title: 'Salary sheet', url: 'https://www.bank.com/accounts?id=7' });
    expect(applyPolicy({ app: 'excel' }, policy())).toEqual({ app: 'excel' });
    expect(applyPolicy({ app: 'x', url: 'not a url %%' }, policy()).url).toBeUndefined();
  });
});

describe('Bucketizer', () => {
  it('makes one bucket per minute and application, and counts idle samples', () => {
    const b = new Bucketizer(5);
    const out = [];
    for (let i = 0; i < 12; i++) out.push(...b.add({ at: T0 + i * 5000, app: 'excel', idle: i >= 9 })); // minute 1: 9 active, 3 idle
    for (let i = 0; i < 3; i++) out.push(...b.add({ at: T0 + 60_000 + i * 5000, app: 'chrome', url: 'https://github.com', idle: false }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ app: 'excel', seconds: 60, activeSeconds: 45, idleSeconds: 15, start: new Date(T0).toISOString() });
    const rest = b.flush();
    expect(rest).toEqual([{ start: new Date(T0 + 60_000).toISOString(), seconds: 15, activeSeconds: 15, idleSeconds: 0, app: 'chrome', url: 'https://github.com' }]);
  });

  it('splits a minute between applications when focus changes', () => {
    const b = new Bucketizer(5);
    for (let i = 0; i < 6; i++) b.add({ at: T0 + i * 5000, app: 'word', idle: false });
    for (let i = 6; i < 12; i++) b.add({ at: T0 + i * 5000, app: 'outlook', idle: false });
    expect(b.flush().map((x) => [x.app, x.seconds])).toEqual([['word', 30], ['outlook', 30]]);
  });
});

function setup(routes: { state: 'in' | 'out'; pol?: ActivityPolicy; offline?: boolean }) {
  const posted: { buckets: { app: string; seconds: number }[] }[] = [];
  const state = { ...routes };
  const store = new MemoryStore();
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    const path = new URL(url).pathname;
    if (state.offline) throw new TypeError('offline');
    if (path === '/v1/activity/policy') return new Response(JSON.stringify(state.pol ?? policy()), { status: 200 });
    if (path === '/v1/attendance/status') return new Response(JSON.stringify({ state: state.state }), { status: 200 });
    if (path === '/v1/activity/buckets') { posted.push(JSON.parse(String(init.body))); return new Response('{}', { status: 200 }); }
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
  let n = 0;
  const api = new ApiClient({ baseUrl: 'http://api.test', store, fetch: fetchFn, newId: () => `id-${++n}` });
  const queue = new OfflineQueue(store, () => `q-${++n}`);
  let clock = T0;
  let idle = 0;
  const agent = new Agent({ api, queue, windows: { sample: async () => ({ app: 'Excel.exe', title: 'Budget' }) }, idle: { idleSeconds: () => idle }, now: () => clock });
  const run = async (seconds: number) => { for (let i = 0; i < seconds / 5; i++) { await agent.tick(); clock += 5000; } };
  return { agent, api, state, posted, run, setIdle: (v: number) => { idle = v; }, queue };
}

describe('Agent', () => {
  it('records only while punched in, and says why when it is not', async () => {
    const s = setup({ state: 'out' });
    await s.api.setSession({ accessToken: 'A', refreshToken: 'R' });
    await s.agent.refresh();
    expect(s.agent.getState()).toMatchObject({ status: 'waiting', reason: expect.stringContaining('not punched in') });
    await s.run(120);
    await s.agent.send();
    expect(s.posted).toHaveLength(0);
    s.state.state = 'in';
    await s.agent.refresh();
    expect(s.agent.getState().status).toBe('recording');
    await s.run(180);
    await s.agent.stop();
    const sent = s.posted.flatMap((p) => p.buckets);
    expect(sent.length).toBeGreaterThanOrEqual(3);
    expect(sent.every((b) => b.app === 'excel')).toBe(true);
    expect(JSON.stringify(s.posted)).not.toContain('Budget'); // the title was dropped by policy
  });

  it('stays off when the company has switched it off', async () => {
    const s = setup({ state: 'in', pol: policy({ enabled: false }) });
    await s.api.setSession({ accessToken: 'A', refreshToken: 'R' });
    await s.agent.refresh();
    expect(s.agent.getState()).toMatchObject({ status: 'off' });
    await s.run(120);
    await s.agent.stop();
    expect(s.posted).toHaveLength(0);
  });

  it('counts idle time and keeps data when the network is down, sending it later', async () => {
    const s = setup({ state: 'in' });
    await s.api.setSession({ accessToken: 'A', refreshToken: 'R' });
    await s.agent.refresh();
    s.setIdle(300);
    await s.run(120);
    s.state.offline = true;
    await s.agent.stop();
    expect(s.posted).toHaveLength(0);
    expect(s.queue.size).toBeGreaterThan(0);
    s.state.offline = false;
    await s.queue.flush(s.api);
    const sent = s.posted.flatMap((p) => p.buckets) as { idleSeconds?: number; activeSeconds?: number }[];
    expect(sent.reduce((a, b) => a + (b.idleSeconds ?? 0), 0)).toBeGreaterThan(0);
    expect(sent.reduce((a, b) => a + (b.activeSeconds ?? 0), 0)).toBe(0);
  });

  it('uses the last known settings when offline at start', async () => {
    const s = setup({ state: 'in' });
    await s.api.setSession({ accessToken: 'A', refreshToken: 'R' });
    await s.agent.refresh();
    s.state.offline = true;
    await s.agent.refresh();
    expect(s.agent.getState().status).toBe('recording');
  });
});

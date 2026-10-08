import { ApiClient, MemoryStore, OfflineQueue } from '@trackrex/client-core';
import { describe, expect, it } from 'vitest';
import { Sampler, siteFor, type ActivityPolicy } from './sampler';

describe('siteFor', () => {
  it('keeps only the site, ignores internal pages, and keeps full URLs only when allowed', () => {
    expect(siteFor('https://www.Bank.com/accounts?id=7', false)).toBe('https://bank.com');
    expect(siteFor('https://www.bank.com/accounts?id=7', true)).toBe('https://www.bank.com/accounts?id=7');
    expect(siteFor('chrome://settings', false)).toBeNull();
    expect(siteFor('chrome-extension://abc/popup.html', false)).toBeNull();
    expect(siteFor('file:///home/me/secret.pdf', false)).toBeNull();
    expect(siteFor('nonsense', false)).toBeNull();
    expect(siteFor(null, false)).toBeNull();
  });
});

function setup(o: { state: 'in' | 'out'; policy?: Partial<ActivityPolicy>; url?: string | null; idle?: 'active' | 'idle' | 'locked' }) {
  const posted: { buckets: { url: string; activeSeconds: number; idleSeconds: number; start: string }[] }[] = [];
  const store = new MemoryStore();
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    const p = new URL(url).pathname;
    if (p === '/v1/activity/policy') return new Response(JSON.stringify({ enabled: true, windowTitles: 'drop', fullUrls: false, screenshots: false, ...o.policy }), { status: 200 });
    if (p === '/v1/attendance/status') return new Response(JSON.stringify({ state: o.state }), { status: 200 });
    if (p === '/v1/activity/buckets') { posted.push(JSON.parse(String(init.body))); return new Response('{}', { status: 200 }); }
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;
  let n = 0;
  const api = new ApiClient({ baseUrl: 'http://api.test', store, fetch: fetchFn, newId: () => `i${++n}`, client: 'desktop' });
  const queue = new OfflineQueue(store, () => `q${++n}`);
  const now = Date.UTC(2026, 2, 9, 4, 30, 20);
  const sampler = new Sampler({ api, queue, now: () => now, browser: { focusedUrl: async () => (o.url === undefined ? 'https://github.com/x/y' : o.url), idleState: async () => o.idle ?? 'active' } });
  return { sampler, api, posted, now };
}

describe('Sampler', () => {
  it('records the site for the minute that just ended, only while punched in', async () => {
    const s = setup({ state: 'out' });
    await s.api.setSession({ accessToken: 'A', refreshToken: 'R' });
    await s.sampler.refresh();
    expect(s.sampler.getState().status).toBe('waiting');
    expect(await s.sampler.sample()).toBe(false);
    const t = setup({ state: 'in' });
    await t.api.setSession({ accessToken: 'A', refreshToken: 'R' });
    await t.sampler.refresh();
    expect(await t.sampler.sample()).toBe(true);
    expect(t.posted[0]!.buckets[0]).toMatchObject({ url: 'https://github.com', activeSeconds: 60, idleSeconds: 0, start: new Date(Date.UTC(2026, 2, 9, 4, 29, 0)).toISOString() });
    expect(t.sampler.getState().lastSite).toBe('github.com');
  });

  it('counts a minute as idle when the computer is idle or locked', async () => {
    const s = setup({ state: 'in', idle: 'locked' });
    await s.api.setSession({ accessToken: 'A', refreshToken: 'R' });
    await s.sampler.refresh();
    await s.sampler.sample();
    expect(s.posted[0]!.buckets[0]).toMatchObject({ activeSeconds: 0, idleSeconds: 60 });
  });

  it('skips when the browser is not in front, when off, and for internal pages', async () => {
    for (const o of [{ state: 'in' as const, url: null }, { state: 'in' as const, url: 'chrome://extensions' }, { state: 'in' as const, policy: { enabled: false } }]) {
      const s = setup(o);
      await s.api.setSession({ accessToken: 'A', refreshToken: 'R' });
      await s.sampler.refresh();
      expect(await s.sampler.sample()).toBe(false);
      expect(s.posted).toHaveLength(0);
    }
  });
});

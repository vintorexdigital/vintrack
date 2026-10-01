import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, signIn } from './harness.js';
import { world, type World } from './fixtures.js';
import type { Harness } from './harness.js';

let h: Harness;
let w: World;
beforeAll(async () => { h = await boot(); w = await world(h); });
afterAll(async () => { await h.close(); });

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString().replace(/:\d\d\.\d+Z$/, ':00.000Z');
const bucket = (minAgo: number, app: string, extra: Record<string, unknown> = {}) => ({ start: ago(minAgo), seconds: 60, activeSeconds: 50, idleSeconds: 10, app, ...extra });
const desktop = async (email: string) => signIn(h, email, w.co.slug, undefined, 'desktop');
const send = (auth: Record<string, string>, buckets: unknown[]) => h.api.post('/v1/activity/buckets').set({ ...auth, 'Idempotency-Key': crypto.randomUUID() }).send({ deviceId: 'pc-1', buckets });
const punchAt = (employeeId: string, type: 'in' | 'out', minAgo: number) => h.api.post('/v1/attendance/punches').set(w.co.auth).send({ employeeId, type, at: new Date(Date.now() - minAgo * 60_000).toISOString() });
const today = () => new Date().toISOString().slice(0, 10);

describe('desktop activity', () => {
  it('seeds a starting classification list', async () => {
    const r = await h.api.get('/v1/admin/productivity/app-classes?limit=50').set(w.co.auth);
    expect(r.body.data.map((c: { name: string }) => c.name)).toEqual(expect.arrayContaining(['excel', 'youtube.com']));
  });

  it('keeps activity only inside working time, and strips what the company has not allowed', async () => {
    const emp = await w.employee('Desk Dana');
    const d = await desktop((await w.join(emp)).auth ? emp.workEmail : '');
    const before = await send(d.auth, [bucket(20, 'excel')]);
    expect(before.body).toMatchObject({ accepted: 0, outsideWorkingTime: 1 });

    await punchAt(emp.id, 'in', 90);
    const batch = [
      bucket(30, 'excel', { title: 'Q3 budget.xlsx' }),
      bucket(29, 'chrome', { url: 'https://www.YouTube.com/watch?v=1', title: 'Cat video' }),
      bucket(120, 'excel'), // before the punch-in
    ];
    const r = await send(d.auth, batch);
    expect(r.body).toMatchObject({ accepted: 2, outsideWorkingTime: 1, duplicate: 0 });
    expect((await send(d.auth, batch)).body).toMatchObject({ accepted: 0, duplicate: 2 });
    expect((await send(d.auth, [bucket(60 * 24 * 9, 'excel')])).body.stale).toBe(1);

    const day = await h.api.get(`/v1/productivity/day?employeeId=${emp.id}&date=${today()}`).set(w.co.auth);
    expect(day.status).toBe(200);
    const names = day.body.apps.map((a: { name: string }) => a.name);
    expect(names).toEqual(expect.arrayContaining(['excel', 'youtube.com'])); // the site, not the browser
    expect(day.body.apps.find((a: { name: string }) => a.name === 'youtube.com')).toMatchObject({ class: 'unproductive', site: true });
    expect(day.body.apps.find((a: { name: string }) => a.name === 'excel')).toMatchObject({ class: 'productive' });
  });

  it('applies window-title and URL settings on the server', async () => {
    const emp = await w.employee('Desk Privacy');
    const d = await desktop((await w.join(emp), emp.workEmail));
    await punchAt(emp.id, 'in', 60);
    await h.api.put('/v1/settings/desktop.window_titles').set(w.co.auth).send({ value: 'hash' });
    await send(d.auth, [bucket(10, 'notepad', { title: 'secret plans' })]);
    const policy = await h.api.get('/v1/activity/policy').set(d.auth);
    expect(policy.body).toMatchObject({ windowTitles: 'hash', fullUrls: false, screenshots: false });
    await h.api.put('/v1/settings/desktop.window_titles').set(w.co.auth).send({ value: 'drop' });
  });

  it('computes productivity against working time and keeps people inside their scope', async () => {
    const mgr = await w.employee('Desk Boss');
    const mine = await w.employee('Desk Mine', { reportingManagerId: mgr.id });
    const other = await w.employee('Desk Other');
    const m = await w.join(mgr, ['manager']);
    await w.join(mine); await w.join(other);
    const dm = await desktop(mine.workEmail);
    const dobs = await desktop(other.workEmail);
    await punchAt(mine.id, 'in', 120);
    await punchAt(other.id, 'in', 120);
    const sixty = (n: number, app: string) => Array.from({ length: n }, (_, i) => ({ start: ago(100 - i), seconds: 60, activeSeconds: 60, idleSeconds: 0, app }));
    await send(dm.auth, [...sixty(30, 'excel'), ...sixty(0, 'x')]);
    await send(dobs.auth, sixty(10, 'excel'));
    const s = await h.api.get(`/v1/productivity/summary?from=${today()}&to=${today()}`).set(m.auth);
    expect(s.status).toBe(200);
    const names = s.body.rows.map((r: { name: string }) => r.name);
    expect(names).toContain('Desk Mine');
    expect(names).not.toContain('Desk Other');
    const row = s.body.rows.find((r: { name: string }) => r.name === 'Desk Mine');
    expect(row).toMatchObject({ recordedMinutes: 30, productiveMinutes: 30, idleMinutes: 0 });
    // an employee sees only themselves; a stranger's day is refused
    const self = await h.api.get(`/v1/productivity/summary?from=${today()}&to=${today()}`).set(dm.auth);
    expect(self.body.rows.map((r: { name: string }) => r.name)).toEqual(['Desk Mine']);
    expect((await h.api.get(`/v1/productivity/day?employeeId=${other.id}&date=${today()}`).set(dm.auth)).status).toBe(403);
    expect((await h.api.get(`/v1/productivity/summary?from=2026-01-01&to=2026-06-30`).set(m.auth)).body.code).toBe('range_too_long');
  });

  it('is isolated between companies', async () => {
    const other = await world(h);
    const r = await h.api.get(`/v1/productivity/summary?from=${today()}&to=${today()}`).set(other.co.auth);
    expect(r.body.rows).toEqual([]);
  });
});

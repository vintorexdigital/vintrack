import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { boot, at, workday, world, type World } from './fixtures.js';
import type { Harness } from './harness.js';
import { JobsService } from '../src/jobs/jobs.service.js';

let h: Harness;
let w: World;
let jobs: JobsService;
beforeAll(async () => {
  h = await boot();
  w = await world(h);
  jobs = h.app.get(JobsService);
});
afterAll(async () => { await h.close(); });

describe('outbox relay and feed', () => {
  it('projects domain events into the feed, once, in scope', async () => {
    const mgr = await w.employee('Feed Manager');
    const emp = await w.employee('Feed Employee', { reportingManagerId: mgr.id });
    const other = await w.employee('Feed Other');
    const s = await w.join(emp);
    const m = await w.join(mgr, ['manager']);
    const o = await w.join(other);
    await h.api.post('/v1/attendance/punches').set(s.auth).send({});
    await h.api.post('/v1/attendance/punches').set(o.auth).send({});
    await jobs.run('outbox-relay');
    await jobs.run('outbox-relay'); // second run must not duplicate
    const feed = await h.api.get('/v1/feed?type=punch.in').set(m.auth);
    expect(feed.status).toBe(200);
    expect(feed.body.data.map((f: { employeeName: string }) => f.employeeName)).toEqual(['Feed Employee']);
    expect(feed.body.data[0]).toMatchObject({ type: 'punch.in', platform: 'web' });
    const all = await h.api.get('/v1/feed?type=punch.in&limit=1').set(w.co.auth);
    expect(all.body.data).toHaveLength(1);
    expect(all.body.nextCursor).toBeTruthy();
    const next = await h.api.get(`/v1/feed?type=punch.in&limit=5&cursor=${all.body.nextCursor}`).set(w.co.auth);
    expect(next.body.data.every((x: { id: string }) => x.id !== all.body.data[0].id)).toBe(true);
    // the feed is a manager feature: plain employees do not get it
    expect((await h.api.get('/v1/feed').set(o.auth)).status).toBe(403);
  });
});

describe('scheduled jobs', () => {
  it('finalizes days so absences exist without anyone opening the register', async () => {
    const e = await w.employee('Final Fiona');
    const out = await jobs.run('finalize-days');
    expect(out[w.co.tenantId]).toBeGreaterThan(0);
    const days = await h.api.get(`/v1/attendance/days?from=${workday(1)}&to=${new Date().toISOString().slice(0, 10)}&employeeId=${e.id}`).set(w.co.auth);
    expect(days.body.length).toBeGreaterThanOrEqual(1);
  });

  it('auto punches out through the job runner', async () => {
    await h.api.patch(`/v1/time/shifts/${w.shiftId}`).set(w.co.auth).send({ rules: { autoPunchOut: { enabled: true, mode: 'hours', hours: 9 } } });
    const e = await w.employee('Forgot Farid');
    const s = await w.join(e);
    const d = workday(1);
    await h.api.post('/v1/attendance/punches').set(s.auth).send({ type: 'in', at: at(d, '10:00'), offline: true });
    const res = await jobs.run('auto-punch-out');
    expect(res[w.co.tenantId]).toBeGreaterThanOrEqual(1);
    await h.api.patch(`/v1/time/shifts/${w.shiftId}`).set(w.co.auth).send({ rules: {} });
  });

  it('purges recycle-bin rows after 30 days and keeps recent ones', async () => {
    const a = await h.api.post('/v1/org/departments').set(w.co.auth).send({ name: 'Old bin' });
    const b = await h.api.post('/v1/org/departments').set(w.co.auth).send({ name: 'New bin' });
    await h.api.delete(`/v1/org/departments/${a.body.id}`).set(w.co.auth);
    await h.api.delete(`/v1/org/departments/${b.body.id}`).set(w.co.auth);
    await h.db.runAsTenant(w.co.tenantId, {}, () => h.db.q.execute(sql`update departments set deleted_at = now() - interval '31 days' where id = ${a.body.id}::uuid`));
    expect(await jobs.purge(w.co.tenantId)).toBeGreaterThanOrEqual(1);
    const bin = await h.api.get('/v1/org/departments?deleted=only').set(w.co.auth);
    expect(bin.body.data.map((x: { name: string }) => x.name)).toEqual(['New bin']);
  });

  it('moves expired trials to past due and maintains partitions', async () => {
    await h.db.platform.execute(sql`update platform.tenants set trial_ends_at = now() - interval '1 day' where id = ${w.co.tenantId}::uuid`);
    const r = await jobs.run('expire-trials');
    expect((r as { expired: number }).expired).toBeGreaterThanOrEqual(1);
    const t = await h.api.get(`/platform/v1/tenants/${w.co.tenantId}`).set(w.admin.auth);
    expect(t.body.status).toBe('past_due');
    expect(await jobs.run('maintain-partitions')).toEqual({ ok: 1 });
    // operators can run a job by hand
    const manual = await h.api.post('/platform/v1/jobs/maintain-partitions/run').set(w.admin.auth);
    expect(manual.status).toBe(200);
    expect((await h.api.post('/platform/v1/jobs/nope/run').set(w.admin.auth)).status).toBe(400);
  });
});

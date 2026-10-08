import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, at, workday, world, type World } from './fixtures.js';
import type { Harness } from './harness.js';

let h: Harness;
let w: World;
beforeAll(async () => {
  h = await boot();
  w = await world(h);
});
afterAll(async () => { await h.close(); });

const range = () => { const d = workday(3); return `from=${d}&to=${workday(1)}`; };
const col = (rows: Record<string, unknown>[], name: string) => rows.find((r) => r.employee === name);

describe('reports', () => {
  it('lists the catalogue only for people who may read reports', async () => {
    const r = await h.api.get('/v1/reports').set(w.co.auth);
    expect(r.status).toBe(200);
    expect(r.body.map((x: { key: string }) => x.key)).toEqual(expect.arrayContaining(['attendance-summary', 'late-arrivals', 'leave-taken', 'task-performance', 'field-travel', 'headcount']));
    const e = await w.join(await w.employee('No Reports'));
    expect((await h.api.get('/v1/reports').set(e.auth)).status).toBe(403);
    expect((await h.api.get('/v1/reports/attendance-summary').set(e.auth)).status).toBe(403);
  });

  it('summarises attendance and finds late arrivals', async () => {
    const early = await w.employee('Rep Early');
    const late = await w.employee('Rep Late');
    const day = workday(2);
    await w.punchOffline(w.co.auth, 'in', day, '09:25', { employeeId: early.id });
    await w.punchOffline(w.co.auth, 'out', day, '18:40', { employeeId: early.id });
    await w.punchOffline(w.co.auth, 'in', day, '11:30', { employeeId: late.id });
    await w.punchOffline(w.co.auth, 'out', day, '19:00', { employeeId: late.id });
    const sum = await h.api.get(`/v1/reports/attendance-summary?${range()}`).set(w.co.auth);
    expect(sum.status).toBe(200);
    const e = col(sum.body.rows, 'Rep Early')!;
    expect(Number(e.present)).toBeGreaterThanOrEqual(1);
    expect(Number(e.workedHours)).toBeGreaterThan(8);
    expect(sum.body.totals.present).toBeGreaterThanOrEqual(2);
    expect(sum.body.truncated).toBe(false);

    const lateRep = await h.api.get(`/v1/reports/late-arrivals?${range()}`).set(w.co.auth);
    const names = lateRep.body.rows.map((r: { employee: string }) => r.employee);
    expect(names).toContain('Rep Late');
    expect(names).not.toContain('Rep Early');
    expect(Number(col(lateRep.body.rows, 'Rep Late')!.totalMinutes)).toBeGreaterThan(60);
  });

  it('reports task performance and headcount', async () => {
    const emp = await w.employee('Rep Tasker');
    const s = await w.join(emp);
    const mk = async () => (await h.api.post('/v1/field/tasks').set(w.co.auth).send({ title: 'Report task', assigneeId: emp.id, dueAt: new Date().toISOString() })).body.id as string;
    const t1 = await mk();
    await mk();
    await h.api.post(`/v1/field/tasks/${t1}/check-in`).set(s.auth).send({});
    await h.api.post(`/v1/field/tasks/${t1}/complete`).set(s.auth).send({ outcome: 'Done' });
    const today = new Date().toISOString().slice(0, 10);
    const r = await h.api.get(`/v1/reports/task-performance?from=${today.slice(0, 8)}01&to=${today}`).set(w.co.auth);
    const row = col(r.body.rows, 'Rep Tasker')!;
    expect(row).toMatchObject({ assigned: 2, completed: 1, open: 1 });
    expect(Number(row.completionRate)).toBe(50);
    const hc = await h.api.get('/v1/reports/headcount').set(w.co.auth);
    expect(hc.body.rows[0]).toMatchObject({ department: 'No department' });
    expect(hc.body.totals.active).toBeGreaterThanOrEqual(3);
  });

  it('computes field travel from recorded points', async () => {
    const emp = await w.employee('Rep Walker');
    const s = await w.join(emp);
    await h.api.post('/v1/attendance/punches').set(w.co.auth).send({ employeeId: emp.id, type: 'in', at: new Date(Date.now() - 90 * 60_000).toISOString() });
    const ping = (min: number, lat: number, lng: number) => ({ at: new Date(Date.now() - min * 60_000).toISOString(), latitude: lat, longitude: lng, accuracy: 10 });
    // about 1.1 km per 0.01 degrees of latitude
    const sent = await h.api.post('/v1/location/pings').set(s.auth).send({ pings: [ping(60, 13.0, 80.2), ping(50, 13.01, 80.2), ping(40, 13.02, 80.2), ping(30, 13.03, 80.2)] });
    expect(sent.body.accepted).toBe(4);
    const today = new Date().toISOString().slice(0, 10);
    const r = await h.api.get(`/v1/reports/field-travel?from=${today}&to=${today}&employeeId=${emp.id}`).set(w.co.auth);
    expect(r.status).toBe(200);
    expect(r.body.rows).toHaveLength(1);
    expect(r.body.rows[0].km).toBeGreaterThan(3);
    expect(r.body.rows[0].km).toBeLessThan(4);
    expect(r.body.rows[0].points).toBe(4);
  });

  it('applies data scope to reports', async () => {
    const mgr = await w.employee('Scope Boss');
    const mine = await w.employee('Scope Mine', { reportingManagerId: mgr.id });
    const other = await w.employee('Scope Elsewhere');
    const m = await w.join(mgr, ['manager']);
    const day = workday(2);
    for (const e of [mine, other]) { await w.punchOffline(w.co.auth, 'in', day, '09:30', { employeeId: e.id }); await w.punchOffline(w.co.auth, 'out', day, '18:30', { employeeId: e.id }); }
    const r = await h.api.get(`/v1/reports/attendance-summary?${range()}`).set(m.auth);
    expect(r.status).toBe(200);
    const names = r.body.rows.map((x: { employee: string }) => x.employee);
    expect(names).toContain('Scope Mine');
    expect(names).not.toContain('Scope Elsewhere');
  });

  it('validates parameters and exports to Excel and CSV', async () => {
    expect((await h.api.get('/v1/reports/nope').set(w.co.auth)).status).toBe(404);
    expect((await h.api.get('/v1/reports/field-travel?from=2026-01-01&to=2026-03-01').set(w.co.auth)).body.code).toBe('range_too_long');
    expect((await h.api.get('/v1/reports/headcount?from=2026-03-01&to=2026-01-01').set(w.co.auth)).status).toBe(422);
    const csv = await h.api.get(`/v1/reports/attendance-summary/export?format=csv&${range()}`).set(w.co.auth);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Present days');
    expect(csv.text).toContain('Total');
    const xlsx = await h.api.get(`/v1/reports/attendance-summary/export?${range()}`).set(w.co.auth).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { JobsService } from '../src/jobs/jobs.service.js';
import { boot, world, type World } from './fixtures.js';
import { workday } from './fixtures.js';
import type { Harness } from './harness.js';

let h: Harness;
let w: World;
let cat: Record<string, string>;
const owner = new pg.Pool({ connectionString: process.env.DATABASE_URL });
beforeAll(async () => {
  h = await boot(); w = await world(h);
  cat = Object.fromEntries((await h.api.get('/v1/admin/expenses/categories?limit=50').set(w.co.auth)).body.data.map((x: { name: string; id: string }) => [x.name, x.id]));
});
afterAll(async () => { await h.close(); await owner.end(); });

const def = (over: Record<string, unknown> = {}) => ({ dataset: 'attendance', dimensions: ['employee'], measures: ['days', 'worked_hours'], filters: [], range: { mode: 'last_days', days: 30 }, ...over });
const run = (auth: Record<string, string>, definition: unknown) => h.api.post('/v1/report-builder/run').set(auth).send({ definition });
const rowOf = (rows: Record<string, unknown>[], name: string) => rows.find((r) => r.employee === name);

async function team() {
  const mgr = await w.employee('Bld Manager');
  const a = await w.employee('Bld Alice', { reportingManagerId: mgr.id });
  const b = await w.employee('Bld Bob', { reportingManagerId: mgr.id });
  const outsider = await w.employee('Bld Outsider');
  const day = workday(2);
  for (const [e, inT, outT] of [[a, '09:00', '18:00'], [b, '09:30', '13:30'], [outsider, '10:00', '19:00']] as const) {
    await w.punchOffline(w.co.auth, 'in', day, inT, { employeeId: e.id });
    await w.punchOffline(w.co.auth, 'out', day, outT, { employeeId: e.id });
  }
  return { mgr, a, b, outsider, m: await w.join(mgr, ['manager']) };
}

describe('report builder', () => {
  it('lists the data sources and their fields for people who may build reports, and not for others', async () => {
    const ds = await h.api.get('/v1/report-builder/datasets').set(w.co.auth);
    expect(ds.status).toBe(200);
    expect(ds.body.map((d: { key: string }) => d.key)).toEqual(['attendance', 'leave', 'expenses', 'tasks', 'leads', 'calls']);
    const att = ds.body[0];
    expect(att.dimensions.map((x: { key: string }) => x.key)).toContain('department');
    expect(att.measures.find((x: { key: string }) => x.key === 'worked_hours')).toMatchObject({ unit: 'hours' });
    const e = await w.join(await w.employee('Bld Plain'));
    expect((await h.api.get('/v1/report-builder/datasets').set(e.auth)).status).toBe(403);
    expect((await run(e.auth, def())).status).toBe(403);
  });

  it('groups and totals attendance, and agrees with the fixed attendance report', async () => {
    const t = await team();
    const r = await run(w.co.auth, def());
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.columns.map((c: { key: string }) => c.key)).toEqual(['employee', 'days', 'worked_hours']);
    expect(rowOf(r.body.rows, 'Bld Alice')).toMatchObject({ days: 1, worked_hours: 9 });
    expect(rowOf(r.body.rows, 'Bld Bob')).toMatchObject({ worked_hours: 4 });
    const fixed = await h.api.get(`/v1/reports/attendance-summary?from=${r.body.range.from}&to=${r.body.range.to}`).set(w.co.auth);
    const alice = (fixed.body.rows as { employee: string; present: number }[]).find((x) => x.employee === 'Bld Alice');
    const mine = await run(w.co.auth, def({ measures: ['present_days'], filters: [{ field: 'employee_name', op: 'eq', value: 'Bld Alice' }] }));
    expect(mine.body.rows[0].present_days).toBe(alice?.present ?? 1);
    void t;
  });

  it('applies the viewer\'s data scope however the report was built', async () => {
    const t = await team();
    const r = await run(t.m.auth, def());
    const names = (r.body.rows as { employee: string }[]).map((x) => x.employee);
    expect(names).toEqual(expect.arrayContaining(['Bld Alice', 'Bld Bob']));
    expect(names).not.toContain('Bld Outsider');
    const total = await run(t.m.auth, def({ dimensions: [], measures: ['days'] }));
    const all = await run(w.co.auth, def({ dimensions: [], measures: ['days'] }));
    expect(total.body.rows[0].days).toBeLessThan(all.body.rows[0].days);
  });

  it('supports several groupings, filters, sorting and limits', async () => {
    await team();
    const r = await run(w.co.auth, def({
      dimensions: ['month', 'status'], measures: ['days', 'avg_hours'], sort: { key: 'days', dir: 'desc' }, limit: 2,
      filters: [{ field: 'status', op: 'in', value: ['P', 'HP'] }, { field: 'employee_name', op: 'contains', value: 'bld' }],
    }));
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.rows.length).toBeLessThanOrEqual(2);
    expect(r.body.rows[0]).toHaveProperty('month');
    expect((r.body.rows as { status: string }[]).every((x) => ['P', 'HP'].includes(x.status))).toBe(true);
    const none = await run(w.co.auth, def({ filters: [{ field: 'employee_name', op: 'eq', value: 'Nobody Here' }] }));
    expect(none.body.rows).toEqual([]);
  });

  it('refuses designs that name things outside the data source, and treats values as data', async () => {
    const bad = async (d: unknown) => (await run(w.co.auth, d)).status;
    expect(await bad(def({ dataset: 'passwords' }))).toBe(422);
    expect(await bad(def({ dimensions: ['salary'] }))).toBe(422);
    expect(await bad(def({ measures: ['sum_everything'] }))).toBe(422);
    expect(await bad(def({ measures: [] }))).toBe(422);
    expect(await bad(def({ dimensions: ['employee', 'employee'] }))).toBe(422);
    expect(await bad(def({ dimensions: ['employee"; drop table employees; --'] }))).toBe(422);
    expect(await bad(def({ filters: [{ field: 'employee_name', op: 'gt', value: 5 }] }))).toBe(422);
    expect(await bad(def({ filters: [{ field: 'status', op: 'eq', value: 'NOPE' }] }))).toBe(422);
    expect(await bad(def({ sort: { key: 'worked_hours', dir: 'desc' }, measures: ['days'] }))).toBe(422);
    expect(await bad(def({ range: { mode: 'custom', from: '2025-01-01', to: '2026-12-31' } }))).toBe(422);
    const inj = await run(w.co.auth, def({ filters: [{ field: 'employee_name', op: 'eq', value: "x'; drop table employees; --" }] }));
    expect(inj.status).toBe(200);
    expect(inj.body.rows).toEqual([]);
    expect((await h.api.get('/v1/people/employees').set(w.co.auth)).status).toBe(200); // still there
  });

  it('reports on leave, expenses, tasks, leads and calls', async () => {
    const mgr = await w.employee('Mix Manager');
    const emp = await w.employee('Mix Employee', { reportingManagerId: mgr.id, mobile: '+919876500001' });
    const m = await w.join(mgr, ['manager']);
    const s = await w.join(emp);
    // expense: 400 claimed and approved at 350
    const claim = await h.api.post('/v1/expenses/claims').set(s.auth).send({ employeeId: emp.id, categoryId: cat.Travel, expenseDate: new Date().toISOString().slice(0, 10), amount: 400 });
    await h.api.post(`/v1/expenses/claims/${claim.body.id}/approve`).set(m.auth).send({ approvedAmount: 350 });
    const ex = await run(w.co.auth, { dataset: 'expenses', dimensions: ['category'], measures: ['claims', 'claimed', 'approved'], range: { mode: 'this_month' } });
    expect(ex.status, JSON.stringify(ex.body)).toBe(200);
    expect(ex.body.rows.find((r: { category: string }) => r.category === 'Travel')).toMatchObject({ claimed: expect.any(Number), approved: expect.any(Number) });
    // task + lead + call
    const cust = await h.api.post('/v1/field/customers').set(w.co.auth).send({ name: 'Mix Customer' });
    await h.api.post('/v1/field/tasks').set(m.auth).send({ title: 'Mix visit', customerId: cust.body.id, assigneeId: emp.id });
    const tk = await run(w.co.auth, { dataset: 'tasks', dimensions: ['employee'], measures: ['tasks', 'completion_rate'], range: { mode: 'last_days', days: 7 }, filters: [{ field: 'employee_name', op: 'eq', value: 'Mix Employee' }] });
    expect(tk.status, JSON.stringify(tk.body)).toBe(200);
    expect(tk.body.rows[0]).toMatchObject({ employee: 'Mix Employee', tasks: 1 });
    await h.api.post('/v1/sales/leads').set(s.auth).send({ name: 'Mix Lead', ownerId: emp.id, value: 1000 });
    const ld = await run(w.co.auth, { dataset: 'leads', dimensions: ['stage'], measures: ['leads', 'value', 'win_rate'], range: { mode: 'last_days', days: 7 } });
    expect(ld.status, JSON.stringify(ld.body)).toBe(200);
    expect(ld.body.rows.find((r: { stage: string }) => r.stage === 'new')?.leads).toBeGreaterThanOrEqual(1);
    await h.api.post('/v1/field/calls').set(s.auth).send({ employeeId: emp.id, phone: '+919800000099', direction: 'outgoing', startedAt: new Date().toISOString(), durationSeconds: 180, outcome: 'connected' });
    const cl = await run(w.co.auth, { dataset: 'calls', dimensions: ['direction'], measures: ['calls', 'talk_minutes'], range: { mode: 'last_days', days: 2 } });
    expect(cl.status, JSON.stringify(cl.body)).toBe(200);
    expect(cl.body.rows.find((r: { direction: string }) => r.direction === 'outgoing')?.talk_minutes).toBeGreaterThanOrEqual(3);
    const lv = await run(w.co.auth, { dataset: 'leave', dimensions: ['leave_type', 'status'], measures: ['requests', 'days'], range: { mode: 'last_month' } });
    expect(lv.status).toBe(200);
  });
});

describe('saved reports and dashboards', () => {
  it('keeps private reports private, shares company ones, and lets only the owner change or delete', async () => {
    const mgr = await w.employee('Sv Manager');
    const peer = await w.employee('Sv Peer');
    const m = await w.join(mgr, ['manager']);
    const p = await w.join(peer, ['manager']);
    const priv = await h.api.post('/v1/report-builder/reports').set(m.auth).send({ name: 'My private', visibility: 'private', definition: def() });
    expect(priv.status, JSON.stringify(priv.body)).toBe(201);
    const shared = await h.api.post('/v1/report-builder/reports').set(m.auth).send({ name: 'Shared view', visibility: 'company', definition: def({ dimensions: ['department'] }) });
    expect((await h.api.get(`/v1/report-builder/reports/${priv.body.id}`).set(p.auth)).status).toBe(404);
    expect((await h.api.get(`/v1/report-builder/reports/${shared.body.id}`).set(p.auth)).status).toBe(200);
    const names = ((await h.api.get('/v1/report-builder/reports').set(p.auth)).body.data as { name: string }[]).map((x) => x.name);
    expect(names).toContain('Shared view');
    expect(names).not.toContain('My private');
    expect((await h.api.patch(`/v1/report-builder/reports/${shared.body.id}`).set(p.auth).send({ name: 'Hijacked' })).status).toBe(403);
    expect((await h.api.delete(`/v1/report-builder/reports/${shared.body.id}`).set(p.auth)).status).toBe(403);
    expect((await h.api.patch(`/v1/report-builder/reports/${shared.body.id}`).set(m.auth).send({ name: 'Renamed' })).body.name).toBe('Renamed');
    // an invalid design cannot be saved
    expect((await h.api.post('/v1/report-builder/reports').set(m.auth).send({ name: 'Broken', definition: def({ measures: ['nope'] }) })).status).toBe(422);
    // an employee has no builder at all
    const e = await w.join(await w.employee('Sv Plain'));
    expect((await h.api.post('/v1/report-builder/reports').set(e.auth).send({ name: 'No', definition: def() })).status).toBe(403);
  });

  it('runs a saved report for whoever opens it, with their own scope, and exports it', async () => {
    const t = await team();
    const saved = await h.api.post('/v1/report-builder/reports').set(w.co.auth).send({ name: 'Hours by person', visibility: 'company', definition: def() });
    const asAdmin = await h.api.get(`/v1/report-builder/reports/${saved.body.id}/run`).set(w.co.auth);
    const asMgr = await h.api.get(`/v1/report-builder/reports/${saved.body.id}/run`).set(t.m.auth);
    const names = (r: { body: { rows: { employee: string }[] } }) => r.body.rows.map((x) => x.employee);
    expect(names(asAdmin)).toContain('Bld Outsider');
    expect(names(asMgr)).not.toContain('Bld Outsider');
    const csv = await h.api.get(`/v1/report-builder/reports/${saved.body.id}/export?format=csv`).set(t.m.auth);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('Hours worked');
    expect(csv.text).not.toContain('Bld Outsider');
    const xlsx = await h.api.get(`/v1/report-builder/reports/${saved.body.id}/export`).set(w.co.auth);
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
  });

  it('builds dashboards from saved reports, loads each widget independently, and refuses reports the person cannot open', async () => {
    const good = (await h.api.post('/v1/report-builder/reports').set(w.co.auth).send({ name: 'Dash good', visibility: 'company', definition: def({ dimensions: ['month'], measures: ['days'], chart: 'bar' }) })).body;
    const gone = (await h.api.post('/v1/report-builder/reports').set(w.co.auth).send({ name: 'Dash gone', visibility: 'company', definition: def() })).body;
    const mine = (await h.api.post('/v1/report-builder/reports').set(w.co.auth).send({ name: 'Dash private', visibility: 'private', definition: def() })).body;
    const mgr = await w.join(await w.employee('Dash Manager'), ['manager']);
    const widgets = [
      { id: 'w1', title: 'Days by month', reportId: good.id, display: 'bar', size: 'md' },
      { id: 'w2', title: 'Soon gone', reportId: gone.id, display: 'table', size: 'lg' },
    ];
    const d = await h.api.post('/v1/report-builder/dashboards').set(w.co.auth).send({ name: 'Operations', visibility: 'company', widgets });
    expect(d.status, JSON.stringify(d.body)).toBe(201);
    expect((await h.api.post('/v1/report-builder/dashboards').set(mgr.auth).send({ name: 'Mine', widgets: [{ id: 'x', title: 'X', reportId: mine.id, display: 'kpi', size: 'sm' }] })).status).toBe(422);
    expect((await h.api.post('/v1/report-builder/dashboards').set(w.co.auth).send({ name: 'Dup', widgets: [widgets[0], widgets[0]] })).status).toBe(422);
    await h.api.delete(`/v1/report-builder/reports/${gone.id}`).set(w.co.auth);
    const data = await h.api.get(`/v1/report-builder/dashboards/${d.body.id}/data`).set(mgr.auth);
    expect(data.status).toBe(200);
    expect(data.body.dashboard.widgets).toHaveLength(2);
    const byId = Object.fromEntries((data.body.results as { widgetId: string; result?: { rows: unknown[] }; error?: string }[]).map((r) => [r.widgetId, r]));
    expect(byId.w1!.result!.rows).toBeDefined();
    expect(byId.w2!.error).toBeTruthy();
  });
});

describe('scheduled reports', () => {
  it('sends a snapshot to its owner when due, as the owner sees the data, and nobody else can open it', async () => {
    const t = await team();
    const saved = (await h.api.post('/v1/report-builder/reports').set(t.m.auth).send({ name: 'Monday hours', visibility: 'private', definition: def() })).body;
    const sch = await h.api.post('/v1/report-builder/schedules').set(t.m.auth).send({ reportId: saved.id, frequency: 'weekly', weekday: 1, hour: 8 });
    expect(sch.status, JSON.stringify(sch.body)).toBe(200);
    expect(new Date(sch.body.nextRunAt).getTime()).toBeGreaterThan(Date.now());
    expect(((await h.api.get('/v1/report-builder/schedules').set(t.m.auth)).body.data as { reportName: string }[])[0]!.reportName).toBe('Monday hours');
    const jobs = h.app.get(JobsService);
    await jobs.run('run-report-schedules');
    expect((await h.api.get('/v1/report-builder/snapshots').set(t.m.auth)).body.data).toHaveLength(0); // not due yet
    await owner.query(`update report_schedules set next_run_at = now() - interval '1 minute' where id = $1`, [sch.body.id]);
    await jobs.run('run-report-schedules');
    const snaps = (await h.api.get('/v1/report-builder/snapshots').set(t.m.auth)).body.data as { id: string; name: string; rowCount: number }[];
    expect(snaps).toHaveLength(1);
    expect(snaps[0]).toMatchObject({ name: 'Monday hours' });
    const snap = await h.api.get(`/v1/report-builder/snapshots/${snaps[0]!.id}`).set(t.m.auth);
    const names = (snap.body.rows as { employee: string }[]).map((r) => r.employee);
    expect(names).toEqual(expect.arrayContaining(['Bld Alice', 'Bld Bob']));
    expect(names).not.toContain('Bld Outsider');
    expect(((await h.api.get('/v1/notifications').set(t.m.auth)).body.data as { type: string; link: string }[]).some((n) => n.type === 'report.ready' && n.link === `/reports/snapshots/${snaps[0]!.id}`)).toBe(true);
    expect((await h.api.get(`/v1/report-builder/snapshots/${snaps[0]!.id}/export?format=csv`).set(t.m.auth)).text).toContain('Bld Alice');
    // the schedule moved on; nobody else can open the snapshot
    const row = (await owner.query('select next_run_at > now() as later, last_status from report_schedules where id = $1', [sch.body.id])).rows[0];
    expect(row).toEqual({ later: true, last_status: 'sent' });
    expect((await h.api.get(`/v1/report-builder/snapshots/${snaps[0]!.id}`).set(w.co.auth)).status).toBe(404);
    expect((await h.api.get('/v1/report-builder/snapshots').set(w.co.auth)).body.data).toHaveLength(0);
  });

  it('records a failure when the owner has lost access, and can be removed', async () => {
    const mgr = await w.employee('Gone Manager');
    const m = await w.join(mgr, ['manager']);
    const saved = (await h.api.post('/v1/report-builder/reports').set(m.auth).send({ name: 'Orphan', visibility: 'private', definition: def() })).body;
    const sch = (await h.api.post('/v1/report-builder/schedules').set(m.auth).send({ reportId: saved.id, frequency: 'daily', hour: 6 })).body;
    await owner.query(`update platform.memberships set status = 'suspended' where employee_id = $1`, [mgr.id]);
    await owner.query(`update report_schedules set next_run_at = now() - interval '1 minute' where id = $1`, [sch.id]);
    await h.app.get(JobsService).run('run-report-schedules');
    const st = (await owner.query('select last_status from report_schedules where id = $1', [sch.id])).rows[0].last_status as string;
    expect(st).toMatch(/^failed/);
    await owner.query(`update platform.memberships set status = 'active' where employee_id = $1`, [mgr.id]);
    expect((await h.api.delete(`/v1/report-builder/schedules/${sch.id}`).set(m.auth)).status).toBe(200);
    expect((await h.api.delete(`/v1/report-builder/schedules/${sch.id}`).set(m.auth)).status).toBe(404);
    // a report the person cannot open cannot be scheduled
    const other = await w.join(await w.employee('Gone Other'), ['manager']);
    expect((await h.api.post('/v1/report-builder/schedules').set(other.auth).send({ reportId: saved.id, frequency: 'daily' })).status).toBe(404);
  });
});

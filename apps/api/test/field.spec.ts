import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, world, type World } from './fixtures.js';
import type { Harness } from './harness.js';

let h: Harness;
let w: World;
beforeAll(async () => {
  h = await boot();
  w = await world(h);
});
afterAll(async () => { await h.close(); });

const HQ = { latitude: 13.0827, longitude: 80.2707 };
const near = { latitude: 13.0829, longitude: 80.2709 }; // ~30 m
const far = { latitude: 13.2, longitude: 80.4 }; // ~20 km

describe('customers and contacts', () => {
  it('creates customers with codes and keeps one primary contact', async () => {
    const c = await h.api.post('/v1/field/customers').set(w.co.auth).send({ name: 'Anand Stores', ...HQ, city: 'Chennai' });
    expect(c.status).toBe(201);
    expect(c.body.code).toMatch(/^CUST-\d+$/);
    const a = await h.api.post('/v1/field/contacts').set(w.co.auth).send({ customerId: c.body.id, name: 'Anand', isPrimary: true });
    const b = await h.api.post('/v1/field/contacts').set(w.co.auth).send({ customerId: c.body.id, name: 'Bala', isPrimary: true });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const list = await h.api.get(`/v1/field/contacts?customerId=${c.body.id}`).set(w.co.auth);
    const primaries = list.body.data.filter((x: { isPrimary: boolean }) => x.isPrimary).map((x: { name: string }) => x.name);
    expect(primaries).toEqual(['Bala']);
  });

  it('lets employees read customers but not change them', async () => {
    const e = await w.employee('Reader One');
    const s = await w.join(e);
    expect((await h.api.get('/v1/field/customers').set(s.auth)).status).toBe(200);
    expect((await h.api.post('/v1/field/customers').set(s.auth).send({ name: 'Nope' })).status).toBe(403);
  });
});

describe('tasks', () => {
  it('runs the visit workflow: assign, check in near, complete', async () => {
    const mgr = await w.employee('Task Manager');
    const emp = await w.employee('Task Rep', { reportingManagerId: mgr.id });
    const m = await w.join(mgr, ['manager']);
    const s = await w.join(emp);
    const cust = await h.api.post('/v1/field/customers').set(w.co.auth).send({ name: 'Visit Customer', ...HQ });
    const t = await h.api.post('/v1/field/tasks').set(m.auth).send({ title: 'Collect cheque', customerId: cust.body.id, assigneeId: emp.id, status: 'completed' });
    expect(t.status).toBe(201);
    expect(t.body).toMatchObject({ status: 'open', code: expect.stringMatching(/^TSK-/) }); // clients cannot choose a status

    const mine = await h.api.get('/v1/field/tasks').set(s.auth);
    expect(mine.body.data.map((x: { id: string }) => x.id)).toContain(t.body.id);

    const ci = await h.api.post(`/v1/field/tasks/${t.body.id}/check-in`).set(s.auth).send(near);
    expect(ci.status).toBe(200);
    expect(ci.body).toMatchObject({ status: 'in_progress', warnings: [] });
    expect(ci.body.checkInDistanceM).toBeLessThan(100);
    expect((await h.api.post(`/v1/field/tasks/${t.body.id}/check-in`).set(s.auth).send(near)).status).toBe(409);

    const done = await h.api.post(`/v1/field/tasks/${t.body.id}/complete`).set(s.auth).send({ ...near, outcome: 'Cheque collected' });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ status: 'completed', outcome: 'Cheque collected' });
    expect((await h.api.patch(`/v1/field/tasks/${t.body.id}`).set(m.auth).send({ title: 'x' })).status).toBe(409);
  });

  it('warns or blocks a check-in that is far from the customer, per setting', async () => {
    const emp = await w.employee('Far Rep');
    const s = await w.join(emp);
    const cust = await h.api.post('/v1/field/customers').set(w.co.auth).send({ name: 'Far Customer', ...HQ });
    const mk = async () => (await h.api.post('/v1/field/tasks').set(w.co.auth).send({ title: 'Visit', customerId: cust.body.id, assigneeId: emp.id })).body.id as string;
    const t1 = await mk();
    const warn = await h.api.post(`/v1/field/tasks/${t1}/check-in`).set(s.auth).send(far);
    expect(warn.status).toBe(200);
    expect(warn.body.warnings).toEqual(['far_from_customer']);

    await h.api.put('/v1/settings/geo.checkin_mode').set(w.co.auth).send({ value: 'block' });
    const t2 = await mk();
    const blocked = await h.api.post(`/v1/field/tasks/${t2}/check-in`).set(s.auth).send(far);
    expect(blocked.status).toBe(422);
    expect(blocked.body.code).toBe('too_far_from_customer');
    await h.api.put('/v1/settings/geo.checkin_mode').set(w.co.auth).send({ value: 'warn' });
  });

  it('keeps tasks inside scope', async () => {
    const mgr = await w.employee('Scope Manager');
    const mine = await w.employee('Scope Mine', { reportingManagerId: mgr.id });
    const other = await w.employee('Scope Other');
    const m = await w.join(mgr, ['manager']);
    const o = await w.join(other);
    expect((await h.api.post('/v1/field/tasks').set(m.auth).send({ title: 'Outside', assigneeId: other.id })).status).toBe(403);
    const ok = await h.api.post('/v1/field/tasks').set(m.auth).send({ title: 'Inside', assigneeId: mine.id });
    expect(ok.status).toBe(201);
    // another employee cannot see or work someone else's task
    expect((await h.api.get(`/v1/field/tasks/${ok.body.id}`).set(o.auth)).status).toBe(404);
    expect((await h.api.post(`/v1/field/tasks/${ok.body.id}/check-in`).set(o.auth).send({})).status).toBe(404);
    // the assignee can cancel with a reason
    const s = await w.join(mine);
    expect((await h.api.post(`/v1/field/tasks/${ok.body.id}/cancel`).set(s.auth).send({ reason: 'x' })).status).toBe(422);
    const c = await h.api.post(`/v1/field/tasks/${ok.body.id}/cancel`).set(s.auth).send({ reason: 'Customer closed today' });
    expect(c.body.status).toBe('cancelled');
    const sum = await h.api.get('/v1/field/tasks/summary').set(m.auth);
    expect(sum.status).toBe(200);
    expect(sum.body).toEqual(expect.objectContaining({ open: expect.any(Number), overdue: expect.any(Number) }));
  });
});

describe('location tracking', () => {
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  /** Punch on the employee's behalf at a chosen time (an admin override), so tests control when work started. */
  const punchAt = (employeeId: string, type: 'in' | 'out', minAgo: number) => h.api.post('/v1/attendance/punches').set(w.co.auth).send({ employeeId, type, at: ago(minAgo) });
  const ping = (minAgo: number, p: { latitude: number; longitude: number }, extra: Record<string, unknown> = {}) => ({ at: new Date(Date.now() - minAgo * 60_000).toISOString(), ...p, accuracy: 10, ...extra });

  it('records points only while punched in, deduplicates, and drives the live map', async () => {
    const mgr = await w.employee('Map Manager');
    const emp = await w.employee('Map Rep', { reportingManagerId: mgr.id });
    const stranger = await w.employee('Map Stranger');
    const m = await w.join(mgr, ['manager']);
    const s = await w.join(emp);
    const x = await w.join(stranger);

    // not punched in: nothing is stored
    const before = await h.api.post('/v1/location/pings').set(s.auth).send({ pings: [ping(1, HQ)] });
    expect(before.body).toMatchObject({ accepted: 0, outsideWorkingTime: 1, trackingEnabled: true });

    expect((await punchAt(emp.id, 'in', 60)).status).toBe(201);
    await punchAt(stranger.id, 'in', 60);
    const batch = [ping(3, HQ, { speed: 0 }), ping(2, near, { speed: 3 }), ping(1, near, { mockLocation: true })];
    const ok = await h.api.post('/v1/location/pings').set(s.auth).send({ pings: batch });
    expect(ok.body).toMatchObject({ accepted: 3, duplicate: 0 });
    const again = await h.api.post('/v1/location/pings').set(s.auth).send({ pings: batch });
    expect(again.body).toMatchObject({ accepted: 0, duplicate: 3 });
    // a point from before the punch-in is outside working time
    const old = await h.api.post('/v1/location/pings').set(s.auth).send({ pings: [ping(90, HQ)] }); // an hour before the punch-in
    expect(old.body.outsideWorkingTime).toBe(1);
    // too old and future points are rejected as stale
    const stale = await h.api.post('/v1/location/pings').set(s.auth).send({ pings: [ping(60 * 24 * 9, HQ)] });
    expect(stale.body.stale).toBe(1);

    const live = await h.api.get('/v1/location/live').set(m.auth);
    expect(live.status).toBe(200);
    const row = live.body.data.find((r: { name: string }) => r.name === 'Map Rep');
    expect(row).toMatchObject({ status: 'moving' }); // the mock point never moves the pin
    expect(live.body.data.some((r: { name: string }) => r.name === 'Map Stranger')).toBe(false);
    // employees do not get the map
    expect((await h.api.get('/v1/location/live').set(s.auth)).status).toBe(403);

    // punch out: further points are refused and the pin shows off duty
    expect((await punchAt(emp.id, 'out', 0)).status).toBe(201);
    const after = await h.api.post('/v1/location/pings').set(s.auth).send({ pings: [ping(0, far)] });
    expect(after.body.accepted).toBe(0);
    const live2 = await h.api.get('/v1/location/live').set(m.auth);
    expect(live2.body.data.find((r: { name: string }) => r.name === 'Map Rep').status).toBe('off_duty');
  });

  it('builds a day trail inside scope and honours the tracking switch', async () => {
    const mgr = await w.employee('Trail Manager');
    const emp = await w.employee('Trail Rep', { reportingManagerId: mgr.id });
    const other = await w.employee('Trail Other');
    const m = await w.join(mgr, ['manager']);
    const s = await w.join(emp);
    expect((await punchAt(emp.id, 'in', 60)).status).toBe(201);
    const pts = [ping(40, HQ), ping(30, near), ping(20, { latitude: 13.09, longitude: 80.28 }), ping(10, { latitude: 13.1, longitude: 80.29 })];
    expect((await h.api.post('/v1/location/pings').set(s.auth).send({ pings: pts })).body.accepted).toBe(4);
    const today = (await h.api.get(`/v1/attendance/punches?employeeId=${emp.id}`).set(w.co.auth)).body.data[0].attendanceDate as string;
    const trail = await h.api.get(`/v1/location/trail?employeeId=${emp.id}&date=${today}`).set(m.auth);
    expect(trail.status).toBe(200);
    expect(trail.body.points.length).toBeGreaterThanOrEqual(3);
    expect(trail.body.distanceMeters).toBeGreaterThan(1000);
    expect((await h.api.get(`/v1/location/trail?employeeId=${other.id}&date=${today}`).set(m.auth)).status).toBe(403);

    await h.api.put('/v1/settings/geo.tracking_enabled').set(w.co.auth).send({ value: false });
    const off = await h.api.post('/v1/location/pings').set(s.auth).send({ pings: [ping(0, HQ)] });
    expect(off.body).toMatchObject({ accepted: 0, trackingEnabled: false });
    expect((await h.api.get('/v1/location/policy').set(s.auth)).body.enabled).toBe(false);
    await h.api.put('/v1/settings/geo.tracking_enabled').set(w.co.auth).send({ value: true });
  });

  it('never leaks across companies', async () => {
    const other = await world(h);
    const live = await h.api.get('/v1/location/live').set(other.co.auth);
    expect(live.body.data).toEqual([]);
    const cust = await h.api.get('/v1/field/customers').set(other.co.auth);
    expect(cust.body.data).toEqual([]);
  });
});

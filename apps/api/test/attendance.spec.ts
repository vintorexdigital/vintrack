import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, at, lastSunday, workday, world, type World } from './fixtures.js';
import type { Harness } from './harness.js';

let h: Harness;
let w: World;
beforeAll(async () => {
  h = await boot();
  w = await world(h);
});
afterAll(async () => { await h.close(); });

const P = '/v1/attendance/punches';
const patchShiftRules = (rules: Record<string, unknown>) => h.api.patch(`/v1/time/shifts/${w.shiftId}`).set(w.co.auth).send({ rules });
const baseRules = async () => (await h.api.get(`/v1/time/shifts/${w.shiftId}`).set(w.co.auth)).body.rules;

describe('punching', () => {
  it('toggles between in and out and rejects invalid sequences', async () => {
    const e = await w.employee('Toggle Tara');
    const s = await w.join(e);
    const a = await h.api.post(P).set(s.auth).send({});
    expect(a.status, JSON.stringify(a.body)).toBe(201);
    expect(a.body.type).toBe('in');
    expect((await h.api.post(P).set(s.auth).send({ type: 'in' })).body.code).toBe('already_punched_in');
    const st = await h.api.get('/v1/attendance/status').set(s.auth);
    expect(st.body).toMatchObject({ linked: true, state: 'in', shift: { name: 'General shift', startTime: '10:00' } });
    const b = await h.api.post(P).set(s.auth).send({});
    expect(b.body.type).toBe('out');
    expect((await h.api.post(P).set(s.auth).send({ type: 'out' })).body.code).toBe('not_punched_in');
  });

  it('refuses employees without a shift or a linked employee record', async () => {
    const e = await w.employee('No Shift', { shiftId: null });
    const s = await w.join(e);
    const r = await h.api.post(P).set(s.auth).send({});
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('no_shift_assigned');
    // the owner has no employee record
    const o = await h.api.post(P).set(w.co.auth).send({});
    expect(o.status).toBe(403);
    expect(o.body.code).toBe('no_employee');
  });

  it('accepts offline punches with their device time and rejects future or ancient ones', async () => {
    const e = await w.employee('Offline Omar');
    const s = await w.join(e);
    const d = workday(2);
    const ok = await w.punchOffline(s.auth, 'in', d, '09:55');
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ offline: true, attendanceDate: d });
    expect(new Date(ok.body.at).toISOString()).toBe(at(d, '09:55'));
    const future = await h.api.post(P).set(s.auth).send({ type: 'out', at: new Date(Date.now() + 3_600_000).toISOString(), offline: true });
    expect(future.status).toBe(422);
    const old = await h.api.post(P).set(s.auth).send({ type: 'out', at: new Date(Date.now() - 20 * 86_400_000).toISOString(), offline: true });
    expect(old.body.code).toBe('punch_too_old');
  });

  it('puts a night-shift punch after midnight on the day the shift started', async () => {
    const shift = await h.api.post('/v1/time/shifts').set(w.co.auth).send({ name: 'Night', timezone: 'Asia/Kolkata', startTime: '22:00', workingMinutes: 540 });
    expect(shift.status).toBe(201);
    const e = await w.employee('Night Nora', { shiftId: null });
    await h.api.post(`/v1/time/shifts/${shift.body.id}/assignments`).set(w.co.auth).send({ employeeIds: [e.id], effectiveFrom: '2024-01-01' });
    const s = await w.join(e);
    const d = workday(3);
    const next = new Date(new Date(d).getTime() + 86_400_000).toISOString().slice(0, 10);
    const i = await h.api.post(P).set(s.auth).send({ type: 'in', at: at(d, '22:05'), offline: true });
    const o = await h.api.post(P).set(s.auth).send({ type: 'out', at: at(next, '06:50'), offline: true });
    expect(i.body.attendanceDate).toBe(d);
    expect(o.body.attendanceDate).toBe(d);
    const day = await h.api.get(`/v1/attendance/days/${e.id}/${d}`).set(w.co.auth);
    expect(day.body.day).toMatchObject({ statusCode: 'P', workedMinutes: 525 });
  });
});

describe('shift restrictions are enforced on the server', () => {
  async function fresh(name: string) {
    const e = await w.employee(name);
    return { e, s: await w.join(e) };
  }
  afterAll(async () => { await patchShiftRules({}); });

  it('checks allowed sources, IP ranges and mandatory comments', async () => {
    const { s } = await fresh('Restricted Ravi');
    await patchShiftRules({ platforms: { punchSources: ['mobile'] } });
    const noWeb = await h.api.post(P).set(s.auth).send({});
    expect(noWeb.body.code).toBe('punch_source_not_allowed');
    await patchShiftRules({ punch: { ipAllowlist: ['10.20.0.0/16'] } });
    expect((await h.api.post(P).set(s.auth).send({})).body.code).toBe('punch_ip_not_allowed');
    await patchShiftRules({ punch: { ipAllowlist: ['127.0.0.0/8', '::1/128', '::ffff:127.0.0.1/128'] } });
    expect((await h.api.post(P).set(s.auth).send({})).status).toBe(201);
    await h.api.post(P).set(s.auth).send({});
    await patchShiftRules({ punch: { commentOnIn: true } });
    const needComment = await h.api.post(P).set(s.auth).send({});
    expect(needComment.body.code).toBe('comment_required');
    expect((await h.api.post(P).set(s.auth).send({ comment: 'Starting from the depot' })).status).toBe(201);
  });

  it('requires selfie and location on mobile, with an app-proof override', async () => {
    const e = await w.employee('Selfie Sana');
    await patchShiftRules({ punch: { selfie: 'mandatory', location: 'mandatory' } });
    const mobile = await w.join(e).then(async (web) => {
      void web;
      const { signIn } = await import('./harness.js');
      return signIn(h, e.workEmail, w.co.slug, undefined, 'mobile');
    });
    const key = { 'Idempotency-Key': `k-${Date.now()}-1` };
    const noSelfie = await h.api.post(P).set({ ...mobile.auth, ...key }).send({ latitude: 13.08, longitude: 80.27 });
    expect(noSelfie.body.code).toBe('selfie_required');
    const noLoc = await h.api.post(P).set({ ...mobile.auth, 'Idempotency-Key': `k-${Date.now()}-2` }).send({ selfieKey: 'selfies/a.jpg' });
    expect(noLoc.body.code).toBe('location_required');
    const ok = await h.api.post(P).set({ ...mobile.auth, 'Idempotency-Key': `k-${Date.now()}-3` }).send({ selfieKey: 'selfies/a.jpg', latitude: 13.08, longitude: 80.27, mockLocation: true });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.warnings).toContain('mock_location');
    await h.api.post(P).set({ ...mobile.auth, 'Idempotency-Key': `k-${Date.now()}-4` }).send({ selfieKey: 's', latitude: 13.08, longitude: 80.27 });
    await patchShiftRules({ punch: { selfie: 'mandatory', location: 'mandatory', allowAppWithoutProof: true } });
    const proofless = await h.api.post(P).set({ ...mobile.auth, 'Idempotency-Key': `k-${Date.now()}-5` }).send({});
    expect(proofless.status).toBe(201);
  });

  it('limits punches to allowed geo-fences', async () => {
    const fence = await h.api.post('/v1/field/geo-fences').set(w.co.auth).send({ name: 'HQ', fenceType: 'circle', latitude: 13.0827, longitude: 80.2707, radiusMeters: 150 });
    expect(fence.status).toBe(201);
    await patchShiftRules({ punch: { fencesIn: [fence.body.id], location: 'optional' } });
    const { s } = await fresh('Fenced Farah');
    const out = await h.api.post(P).set(s.auth).send({ latitude: 13.2, longitude: 80.3 });
    expect(out.body.code).toBe('outside_fence');
    const inside = await h.api.post(P).set(s.auth).send({ latitude: 13.0829, longitude: 80.2709, accuracy: 10 });
    expect(inside.status).toBe(201);
  });

  it('blocks punches at the employee home location and enforces device binding', async () => {
    const e = await w.employee('Homebody Hari');
    await h.api.patch(`/v1/people/employees/${e.id}`).set(w.co.auth).send({ displayName: 'Homebody Hari' });
    const { sql } = await import('drizzle-orm');
    await h.db.runAsTenant(w.co.tenantId, {}, () => h.db.q.execute(sql`update employees set home_latitude = 12.97, home_longitude = 77.59 where id = ${e.id}::uuid`));
    await patchShiftRules({ punch: { blockAtHome: { enabled: true, radiusMeters: 200 } } });
    const s = await w.join(e);
    const home = await h.api.post(P).set(s.auth).send({ latitude: 12.9701, longitude: 77.5901 });
    expect(home.body.code).toBe('punch_at_home');
    expect((await h.api.post(P).set(s.auth).send({ latitude: 13.5, longitude: 77.9 })).status).toBe(201);

    await patchShiftRules({ mobile: { deviceBinding: true } });
    const e2 = await w.employee('Bound Bina');
    const { signIn } = await import('./harness.js');
    await w.join(e2);
    const m = await signIn(h, e2.workEmail, w.co.slug, undefined, 'mobile');
    const key = () => ({ 'Idempotency-Key': `d-${Date.now()}-${Math.random()}` });
    const first = await h.api.post(P).set({ ...m.auth, ...key() }).send({ deviceId: 'phone-A', platform: 'android' });
    expect(first.status).toBe(201);
    await h.api.post(P).set({ ...m.auth, ...key() }).send({ deviceId: 'phone-A', platform: 'android' });
    const other = await h.api.post(P).set({ ...m.auth, ...key() }).send({ deviceId: 'phone-B', platform: 'android' });
    expect(other.status).toBe(403);
    expect(other.body.code).toBe('device_not_bound');
  });

  it('blocks early punch-in and late punch-in when configured', async () => {
    await patchShiftRules({});
    const e = await w.employee('Timed Tina');
    const s = await w.join(e);
    const d = workday(2);
    await patchShiftRules({ punch: { blockEarlyMinutes: 30 } });
    expect((await w.punchOffline(s.auth, 'in', d, '08:30')).body.code).toBe('punch_too_early');
    expect((await w.punchOffline(s.auth, 'in', d, '09:45')).status).toBe(201);
    await h.api.post(P).set(s.auth).send({ type: 'out', at: at(d, '18:00'), offline: true });
    await patchShiftRules({ punch: { blockAfterMaxPunchIn: true } });
    const d2 = workday(3);
    expect((await w.punchOffline(s.auth, 'in', d2, '10:40')).body.code).toBe('punch_too_late');
  });
});

describe('attendance days and policies', () => {
  it('computes worked time, lateness and applies a published policy with explanations', async () => {
    await patchShiftRules({});
    const e = await w.employee('Policy Pia');
    const s = await w.join(e);
    const pol = await h.api.post('/v1/attendance/policies').set(w.co.auth).send({
      name: 'Late policy', startDate: '2024-01-01',
      rules: [{ type: 'late_punch_in', graceMinutes: 0, afterMarks: 2, consequence: 'half_day' }, { type: 'min_hours', halfDayBelowMinutes: 300, absentBelowMinutes: 120 }],
    });
    expect(pol.status, JSON.stringify(pol.body)).toBe(201);
    expect((await h.api.post(`/v1/attendance/policies/${pol.body.id}/publish`).set(w.co.auth)).body.state).toBe('published');

    const [d1, d2, d3] = [workday(4), workday(3), workday(2)];
    for (const [d, inT, outT] of [[d1, '10:25', '19:00'], [d2, '10:30', '19:00'], [d3, '10:10', '13:00']] as const) {
      await w.punchOffline(s.auth, 'in', d, inT);
      await h.api.post(P).set(s.auth).send({ type: 'out', at: at(d, outT), offline: true });
    }
    const day = (d: string) => h.api.get(`/v1/attendance/days/${e.id}/${d}`).set(w.co.auth).then((r) => r.body.day);
    const a = await day(d1);
    expect(a).toMatchObject({ statusCode: 'P', lateMinutes: 10, lateMark: true, deductionUnits: 0 });
    expect(a.explanation[0]).toBe('Late by 10 min; 1st late mark this cycle.');
    const b = await day(d2);
    expect(b).toMatchObject({ lateMark: true, deductionUnits: 0.5 });
    expect(b.explanation[0]).toBe('Late by 15 min; 2nd late mark this cycle; half day deducted.');
    const c = await day(d3);
    expect(c).toMatchObject({ statusCode: 'HP', workedMinutes: 170 });
    expect(c.explanation.join(' ')).toContain('below');
  });

  it('keeps published policies immutable and versions them', async () => {
    const pol = await h.api.post('/v1/attendance/policies').set(w.co.auth).send({ name: 'Immutable', startDate: '2024-06-01', rules: [{ type: 'overtime', thresholdMinutes: 30 }] });
    expect((await h.api.patch(`/v1/attendance/policies/${pol.body.id}`).set(w.co.auth).send({ name: 'Draft edit' })).status).toBe(200);
    await h.api.post(`/v1/attendance/policies/${pol.body.id}/publish`).set(w.co.auth);
    const edit = await h.api.patch(`/v1/attendance/policies/${pol.body.id}`).set(w.co.auth).send({ name: 'Nope' });
    expect(edit.status).toBe(409);
    expect(edit.body.code).toBe('policy_published');
    expect((await h.api.delete(`/v1/attendance/policies/${pol.body.id}`).set(w.co.auth)).status).toBe(409);
    expect((await h.api.post(`/v1/attendance/policies/${pol.body.id}/new-version`).set(w.co.auth).send({ startDate: '2024-06-01' })).status).toBe(422);
    const v2 = await h.api.post(`/v1/attendance/policies/${pol.body.id}/new-version`).set(w.co.auth).send({ startDate: '2025-01-01' });
    expect(v2.status).toBe(201);
    expect(v2.body).toMatchObject({ revision: 2, state: 'draft', previousId: pol.body.id });
    const noRules = await h.api.post('/v1/attendance/policies').set(w.co.auth).send({ name: 'Empty', startDate: '2024-06-01', rules: [] });
    expect((await h.api.post(`/v1/attendance/policies/${noRules.body.id}/publish`).set(w.co.auth)).status).toBe(422);
  });

  it('previews a re-run without changing anything, then applies it', async () => {
    const e = await w.employee('Rerun Rina');
    const s = await w.join(e);
    const d = workday(5);
    await w.punchOffline(s.auth, 'in', d, '10:30');
    await h.api.post(P).set(s.auth).send({ type: 'out', at: at(d, '19:00'), offline: true });
    const before = (await h.api.get(`/v1/attendance/days/${e.id}/${d}`).set(w.co.auth)).body.day;
    const pol = await h.api.post('/v1/attendance/policies').set(w.co.auth).send({ name: 'Strict late', startDate: '2026-01-01', rules: [{ type: 'late_punch_in', graceMinutes: 0, afterMarks: 1, consequence: 'full_day' }] });
    await h.api.post(`/v1/attendance/policies/${pol.body.id}/publish`).set(w.co.auth);
    const dry = await h.api.post('/v1/attendance/rerun').set(w.co.auth).send({ from: d, to: d, employeeIds: [e.id], dryRun: true });
    expect(dry.body.changed).toBe(1);
    const unchanged = (await h.api.get(`/v1/attendance/days?from=${d}&to=${d}&employeeId=${e.id}`).set(w.co.auth)).body[0];
    expect(unchanged.deductionUnits).toBe(before.deductionUnits);
    const real = await h.api.post('/v1/attendance/rerun').set(w.co.auth).send({ from: d, to: d, employeeIds: [e.id], dryRun: false });
    expect(real.body.changed).toBe(1);
    const after = (await h.api.get(`/v1/attendance/days?from=${d}&to=${d}&employeeId=${e.id}`).set(w.co.auth)).body[0];
    expect(after.deductionUnits).toBe(1);
  });
});

describe('overrides, regularization and locking', () => {
  it('overrides a day and clears it, with an audit trail', async () => {
    const e = await w.employee('Override Omi');
    const d = workday(2);
    const o = await h.api.put(`/v1/attendance/days/${e.id}/${d}/override`).set(w.co.auth).send({ code: 'HP', reason: 'Site visit' });
    expect(o.body).toMatchObject({ statusCode: 'HP', overrideCode: 'HP' });
    expect((await h.api.put(`/v1/attendance/days/${e.id}/${d}/override`).set(w.co.auth).send({ code: 'P', reason: '' })).status).toBe(422);
    const cleared = await h.api.delete(`/v1/attendance/days/${e.id}/${d}/override`).set(w.co.auth);
    expect(cleared.body.statusCode).toBe('AB');
    const audit = await h.api.get('/v1/audit?entity=attendance-days').set(w.co.auth);
    expect(audit.body.data.map((a: { action: string }) => a.action)).toEqual(expect.arrayContaining(['overridden', 'override_removed']));
  });

  it('runs the regularization workflow with scope, windows and no self-approval', async () => {
    const mgr = await w.employee('Reg Manager');
    const emp = await w.employee('Reg Employee', { reportingManagerId: mgr.id });
    const stranger = await w.employee('Reg Stranger');
    const m = await w.join(mgr, ['manager']);
    const s = await w.join(emp);
    const strangerS = await w.join(stranger);
    const d = workday(2);
    const R = '/v1/attendance/regularizations';

    const req = await h.api.post(R).set(s.auth).send({ employeeId: emp.id, date: d, requestedCode: 'P', reason: 'Forgot to punch' });
    expect(req.status, JSON.stringify(req.body)).toBe(201);
    expect(req.body).toMatchObject({ status: 'pending', currentCode: 'AB' });
    expect((await h.api.post(R).set(s.auth).send({ employeeId: emp.id, date: d, requestedCode: 'P', reason: 'Again' })).body.code).toBe('request_pending');
    const day = await h.api.get(`/v1/attendance/days/${emp.id}/${d}`).set(w.co.auth);
    expect(day.body.day.statusCode).toBe('PA');
    expect((await h.api.post(R).set(s.auth).send({ employeeId: emp.id, date: workday(30), requestedCode: 'P', reason: 'Old' })).body.code).toBe('regularization_window');
    expect((await h.api.post(R).set(s.auth).send({ employeeId: emp.id, date: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10), requestedCode: 'P', reason: 'Future' })).status).toBe(422);

    expect((await h.api.post(`${R}/${req.body.id}/approve`).set(s.auth).send({})).status).toBe(403);
    expect((await h.api.post(`${R}/${req.body.id}/approve`).set(strangerS.auth).send({})).status).toBe(403);
    // managers see their reportees' requests, strangers see none
    expect((await h.api.get(R).set(m.auth)).body.data).toHaveLength(1);
    expect((await h.api.get(R).set(strangerS.auth)).body.data).toHaveLength(0);
    const ok = await h.api.post(`${R}/${req.body.id}/approve`).set(m.auth).send({ comment: 'OK' });
    expect(ok.body.status).toBe('approved');
    expect((await h.api.post(`${R}/${req.body.id}/approve`).set(m.auth).send({})).body.code).toBe('already_actioned');
    const after = await h.api.get(`/v1/attendance/days/${emp.id}/${d}`).set(w.co.auth);
    expect(after.body.day).toMatchObject({ statusCode: 'AP', overrideCode: 'P' });

    const d2 = workday(3);
    const r2 = await h.api.post(R).set(s.auth).send({ employeeId: emp.id, date: d2, requestedCode: 'HP', reason: 'Half day' });
    expect((await h.api.post(`${R}/${r2.body.id}/reject`).set(m.auth).send({})).status).toBe(422);
    expect((await h.api.post(`${R}/${r2.body.id}/reject`).set(m.auth).send({ comment: 'No evidence' })).body.status).toBe('rejected');
    expect((await h.api.get(`/v1/attendance/days/${emp.id}/${d2}`).set(w.co.auth)).body.day.statusCode).toBe('AB');

    const r3 = await h.api.post(R).set(s.auth).send({ employeeId: emp.id, date: workday(4), requestedCode: 'P', reason: 'Cancel me' });
    expect((await h.api.post(`${R}/${r3.body.id}/cancel`).set(s.auth)).body.status).toBe('cancelled');
    expect((await h.api.patch(`${R}/${r3.body.id}`).set(s.auth).send({ reason: 'x' })).status).toBe(409);
  });

  it('refuses changes to locked payroll cycles', async () => {
    const e = await w.employee('Locked Lata');
    const d = workday(2);
    await h.api.put(`/v1/attendance/days/${e.id}/${d}/override`).set(w.co.auth).send({ code: 'P', reason: 'Present on site' });
    await h.api.post('/v1/attendance/lock').set(w.co.auth).send({ from: d, to: d });
    const blocked = await h.api.put(`/v1/attendance/days/${e.id}/${d}/override`).set(w.co.auth).send({ code: 'AB', reason: 'Changed my mind' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('day_locked');
    await h.api.post('/v1/attendance/lock').set(w.co.auth).send({ from: d, to: d, locked: false });
    expect((await h.api.put(`/v1/attendance/days/${e.id}/${d}/override`).set(w.co.auth).send({ code: 'AB', reason: 'Now allowed' })).status).toBe(200);
  });
});

describe('days still in progress', () => {
  it('records no absence for today until the day is over', async () => {
    const e = await w.employee('Today Tanvi');
    const today = new Date().toISOString().slice(0, 10);
    const d = await h.api.get(`/v1/attendance/days/${e.id}/${today}`).set(w.co.auth);
    // today may already be over for the shift timezone; only assert when the engine marked it in progress
    if (d.body.day.inProgress) {
      expect(d.body.day.explanation[0]).toContain('not over');
      const list = await h.api.get(`/v1/attendance/days?from=${today}&to=${today}&employeeId=${e.id}`).set(w.co.auth);
      expect(list.body).toHaveLength(0);
    }
    const fd = new Date(Date.now() + 2 * 86_400_000);
    while (fd.getUTCDay() === 0) fd.setUTCDate(fd.getUTCDate() + 1); // Sundays are weekly offs
    const future = fd.toISOString().slice(0, 10);
    const f = await h.api.get(`/v1/attendance/days/${e.id}/${future}`).set(w.co.auth);
    expect(f.body.day.inProgress).toBe(true);
  });
});

describe('monthly register', () => {
  it('builds the cycle grid with codes, weekly offs, summary and payroll export', async () => {
    const e = await w.employee('Register Reema');
    const s = await w.join(e);
    const d = workday(2);
    await w.punchOffline(s.auth, 'in', d, '10:00');
    await h.api.post(P).set(s.auth).send({ type: 'out', at: at(d, '19:00'), offline: true });
    const reg = await h.api.get(`/v1/attendance/register?date=${d}&q=register reema`).set(w.co.auth);
    expect(reg.status).toBe(200);
    expect(reg.body.rows).toHaveLength(1);
    const row = reg.body.rows[0];
    expect(row.employee.name).toBe('Register Reema');
    expect(row.cells[d].code).toBe('P');
    const sunday = lastSunday();
    if (sunday >= reg.body.cycle.start) expect(row.cells[sunday]?.code).toBe('NW');
    expect(row.summary.P).toBe(1);
    expect(reg.body.days.length).toBeGreaterThanOrEqual(28);
    expect(reg.body.legend.find((l: { code: string }) => l.code === 'LMP')).toBeTruthy();
    const xlsx = await h.api.get(`/v1/attendance/register/export?date=${d}&q=register reema`).set(w.co.auth).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (x: Buffer) => c.push(x)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(xlsx.status).toBe(200);
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');
  });

  it('scopes the register to the managers reportees', async () => {
    const mgr = await w.employee('Scope Manager');
    const mine = await w.employee('Scope Mine', { reportingManagerId: mgr.id });
    await w.employee('Scope Other');
    const m = await w.join(mgr, ['manager']);
    const reg = await h.api.get(`/v1/attendance/register?limit=200`).set(m.auth);
    const names = reg.body.rows.map((r: { employee: { name: string } }) => r.employee.name);
    expect(names).toEqual(expect.arrayContaining(['Scope Manager', 'Scope Mine']));
    expect(names).not.toContain('Scope Other');
    void mine;
  });
});

describe('breaks and automatic punch-out', () => {
  it('tracks breaks and subtracts them from worked time', async () => {
    const e = await w.employee('Break Bala');
    const s = await w.join(e);
    expect((await h.api.post('/v1/attendance/breaks/start').set(s.auth).send({})).body.code).toBe('not_punched_in');
    await h.api.post(P).set(s.auth).send({});
    const bt = (await h.api.get('/v1/time/break-types').set(w.co.auth)).body.data[0].id;
    const st = await h.api.post('/v1/attendance/breaks/start').set(s.auth).send({ breakTypeId: bt });
    expect(st.status).toBe(201);
    expect((await h.api.post('/v1/attendance/breaks/start').set(s.auth).send({})).body.code).toBe('break_open');
    expect((await h.api.get('/v1/attendance/status').set(s.auth)).body.state).toBe('break');
    expect((await h.api.post('/v1/attendance/breaks/end').set(s.auth)).status).toBe(200);
    expect((await h.api.post('/v1/attendance/breaks/end').set(s.auth)).body.code).toBe('no_break');
  });

  it('closes forgotten sessions at the cutoff and blocks re-punching that day', async () => {
    await patchShiftRules({ autoPunchOut: { enabled: true, mode: 'hours', hours: 10, blockAfter: true } });
    const e = await w.employee('Auto Asha');
    const s = await w.join(e);
    const d = workday(2);
    await w.punchOffline(s.auth, 'in', d, '10:00');
    const ran = await h.api.post('/v1/attendance/auto-punch-out/run').set(w.co.auth);
    expect(ran.body.closed).toBeGreaterThanOrEqual(1);
    const log = (await h.api.get(`${P}?employeeId=${e.id}&date=${d}`).set(w.co.auth)).body.data;
    const out = log.find((p: { type: string }) => p.type === 'out');
    expect(out).toMatchObject({ source: 'system' });
    expect(new Date(out.at).toISOString()).toBe(at(d, '20:00'));
    expect((await h.api.post('/v1/attendance/auto-punch-out/run').set(w.co.auth)).body.closed).toBe(0);
    const again = await w.punchOffline(s.auth, 'in', d, '21:00');
    expect(again.body.code).toBe('blocked_after_auto_punch_out');
    await patchShiftRules({});
    expect(await baseRules()).toBeTruthy();
  });
});

describe('shift assignments', () => {
  it('are effective-dated and keep history', async () => {
    const other = await h.api.post('/v1/time/shifts').set(w.co.auth).send({ name: 'Early', timezone: 'Asia/Kolkata', startTime: '07:00', workingMinutes: 480 });
    const e = await w.employee('Shifty Sam');
    const from = workday(1);
    expect((await h.api.post(`/v1/time/shifts/${other.body.id}/assignments`).set(w.co.auth).send({ employeeIds: [e.id], effectiveFrom: from })).status).toBe(200);
    const list = await h.api.get(`/v1/time/shifts/${other.body.id}/employees`).set(w.co.auth);
    expect(list.body.map((x: { employeeId: string }) => x.employeeId)).toContain(e.id);
    // the earlier assignment was closed the day before, not deleted
    const { sql } = await import('drizzle-orm');
    const hist = await h.db.runAsTenant(w.co.tenantId, {}, () => h.db.q.execute(sql`select effective_from, effective_to from shift_assignments where employee_id = ${e.id}::uuid and shift_id = ${w.shiftId}::uuid`));
    expect((hist.rows[0] as { effective_to: string }).effective_to).toBe(new Date(new Date(from).getTime() - 86_400_000).toISOString().slice(0, 10));
    const gen = await h.api.get(`/v1/time/shifts/${w.shiftId}/employees`).set(w.co.auth);
    expect(gen.body.map((x: { employeeId: string }) => x.employeeId)).not.toContain(e.id);
    const del = await h.api.delete(`/v1/time/shifts/${other.body.id}`).set(w.co.auth);
    expect(del.status).toBe(409);
    expect(del.body.code).toBe('shift_in_use');
    expect((await h.api.post('/v1/time/shifts').set(w.co.auth).send({ name: 'Bad tz', timezone: 'Mars/Phobos', startTime: '09:00', workingMinutes: 480 })).status).toBe(422);
  });
});

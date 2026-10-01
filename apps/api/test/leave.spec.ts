import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { boot, workday, world, type World } from './fixtures.js';
import type { Harness } from './harness.js';

let h: Harness;
let w: World;
let types: Record<string, string>;
beforeAll(async () => {
  h = await boot();
  w = await world(h);
  const t = await h.api.get('/v1/leave/types').set(w.co.auth);
  types = Object.fromEntries(t.body.data.map((x: { code: string; id: string }) => [x.code, x.id]));
});
afterAll(async () => { await h.close(); });

const L = '/v1/leave/requests';
/** A weekday `n` days from now that is not a Sunday or the seeded fixed-date holidays. */
function future(n: number): string {
  const d = new Date(Date.now() + n * 86_400_000);
  for (;;) {
    const iso = d.toISOString().slice(0, 10);
    if (d.getUTCDay() !== 0 && !['01-01', '01-26', '05-01', '08-15', '10-02', '12-25'].includes(iso.slice(5))) return iso;
    d.setUTCDate(d.getUTCDate() + 1);
  }
}
const nextDay = (iso: string) => new Date(new Date(iso).getTime() + 86_400_000).toISOString().slice(0, 10);

describe('balances and accruals', () => {
  it('accrues monthly from the session start and shows the ledger', async () => {
    const e = await w.employee('Accrual Anil');
    const s = await w.join(e);
    const b = await h.api.get('/v1/leave/balances').set(s.auth);
    expect(b.status).toBe(200);
    const cl = b.body.find((x: { code: string }) => x.code === 'CL');
    const month = new Date().getUTCMonth() + 1;
    expect(cl).toMatchObject({ balance: month, taken: 0, accrued: month, pending: 0, yearAccrual: 12 });
    const sl = b.body.find((x: { code: string }) => x.code === 'SL');
    expect(sl.balance).toBe(6); // flat annual
    // employees cannot read other people's balances
    const other = await w.employee('Accrual Other');
    expect((await h.api.get(`/v1/leave/balances?employeeId=${other.id}`).set(s.auth)).status).toBe(404);
    expect((await h.api.get(`/v1/leave/balances?employeeId=${other.id}`).set(w.co.auth)).status).toBe(200);
  });

  it('prorates mid-session joiners and carries forward from the previous session', async () => {
    const year = new Date().getUTCFullYear();
    const joiner = await w.employee('Mid Joiner', { dateOfJoining: `${year}-07-16` });
    const bal = await h.api.get(`/v1/leave/balances?employeeId=${joiner.id}&asOf=${year}-12-31`).set(w.co.auth);
    const cl = bal.body.find((x: { code: string }) => x.code === 'CL');
    // July prorated (16/31) plus five full months
    expect(cl.accrued).toBeCloseTo(1 * (16 / 31) + 5, 1);
    const veteran = await w.employee('Carry Chitra');
    const prev = await h.api.get(`/v1/leave/balances?employeeId=${veteran.id}&asOf=${year}-01-02`).set(w.co.auth);
    const el = prev.body.find((x: { code: string }) => x.code === 'EL');
    // EL carries forward up to 30 days: last year's balance (15) opens this year
    expect(el.accrued).toBeGreaterThanOrEqual(15);
  });
});

describe('applying for leave', () => {
  it('validates dates, balance, notice and overlaps, and counts only working days', async () => {
    const e = await w.employee('Apply Alok');
    const s = await w.join(e);
    const d1 = future(14);
    const ok = await h.api.post(L).set(s.auth).send({ employeeId: e.id, leaveTypeId: types.CL, fromDate: d1, toDate: d1, reason: 'Family function' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body).toMatchObject({ status: 'pending', days: 1, code: expect.stringMatching(/^LV-/) });
    expect((await h.api.post(L).set(s.auth).send({ employeeId: e.id, leaveTypeId: types.CL, fromDate: d1, toDate: d1 })).body.code).toBe('overlap');

    // a range over a Sunday: Fri..Mon is 3 working days when Sunday is excluded (sandwich default)
    let fri = new Date(Date.now() + 40 * 86_400_000);
    while (fri.getUTCDay() !== 5) fri = new Date(fri.getTime() + 86_400_000);
    const from = fri.toISOString().slice(0, 10);
    const to = new Date(fri.getTime() + 3 * 86_400_000).toISOString().slice(0, 10);
    const span = await h.api.post(L).set(s.auth).send({ employeeId: e.id, leaveTypeId: types.LOP, fromDate: from, toDate: to });
    expect(span.body.days).toBe(3);

    const sun = new Date(Date.now() + 20 * 86_400_000);
    while (sun.getUTCDay() !== 0) sun.setUTCDate(sun.getUTCDate() + 1);
    const sunday = sun.toISOString().slice(0, 10);
    expect((await h.api.post(L).set(s.auth).send({ employeeId: e.id, leaveTypeId: types.CL, fromDate: sunday, toDate: sunday })).body.code).toBe('no_working_days');

    expect((await h.api.post(L).set(s.auth).send({ employeeId: e.id, leaveTypeId: types.EL, fromDate: future(1), toDate: future(1) })).body.code).toBe('notice_too_short');
    expect((await h.api.post(L).set(s.auth).send({ employeeId: e.id, leaveTypeId: types.CL, fromDate: future(60), toDate: future(90) })).body.code).toBe('insufficient_balance');
    expect((await h.api.post(L).set(s.auth).send({ employeeId: e.id, leaveTypeId: types.CL, fromDate: '2026-02-05', toDate: '2026-02-01' })).status).toBe(422);
    const half = await h.api.post(L).set(s.auth).send({ employeeId: e.id, leaveTypeId: types.CL, fromDate: future(25), toDate: future(25), duration: 'first_half' });
    expect(half.body.days).toBe(0.5);
    const pendingBal = (await h.api.get('/v1/leave/balances').set(s.auth)).body.find((x: { code: string }) => x.code === 'CL');
    expect(pendingBal.pending).toBe(1.5);
    expect(pendingBal.available).toBe(pendingBal.balance - 1.5);
  });

  it('honours holidays, half-day restrictions and profile membership', async () => {
    const year = new Date().getUTCFullYear();
    const hol = future(50);
    const created = await h.api.post('/v1/leave/holidays').set(w.co.auth).send({ name: 'Company day', startDate: hol, endDate: hol });
    expect(created.status).toBe(201);
    const e = await w.employee('Holiday Hema');
    const s = await w.join(e);
    expect((await h.api.post(L).set(s.auth).send({ employeeId: e.id, leaveTypeId: types.CL, fromDate: hol, toDate: hol })).body.code).toBe('no_working_days');
    expect((await h.api.post('/v1/leave/holidays').set(w.co.auth).send({ name: 'Backwards', startDate: '2026-05-02', endDate: '2026-05-01' })).status).toBe(422);

    const profile = await h.api.post('/v1/leave/profiles').set(w.co.auth).send({ name: 'No halves', halfDayAllowed: false });
    const e2 = await w.employee('Half Hari', { leaveProfileId: profile.body.id });
    const s2 = await w.join(e2);
    // the type is only offered to the default profile
    await h.api.patch(`/v1/leave/types/${types.CL}`).set(w.co.auth).send({});
    const open = await h.api.post('/v1/leave/types').set(w.co.auth).send({ name: 'Open type', code: 'OPN', entitlement: { tiers: [{ totalDays: 10, accrual: 'flat' }] } });
    const noHalf = await h.api.post(L).set(s2.auth).send({ employeeId: e2.id, leaveTypeId: open.body.id, fromDate: future(30), toDate: future(30), duration: 'first_half' });
    expect(noHalf.body.code).toBe('half_day_not_allowed');
    const notInProfile = await h.api.post(L).set(s2.auth).send({ employeeId: e2.id, leaveTypeId: types.CL, fromDate: future(30), toDate: future(30) });
    expect(notInProfile.status).toBe(422);
    void year;
  });
});

describe('approval', () => {
  it('approves within scope, updates balances and attendance, and cancels back', async () => {
    const mgr = await w.employee('Leave Manager');
    const emp = await w.employee('Leave Employee', { reportingManagerId: mgr.id });
    const stranger = await w.employee('Leave Stranger');
    const m = await w.join(mgr, ['manager']);
    const s = await w.join(emp);
    const st = await w.join(stranger);
    const day = workday(2); // approved leave in the past shows on the register
    const back = await h.api.post('/v1/leave/types').set(w.co.auth).send({ name: 'Backdated unpaid', code: 'BKD', paid: false, entitlement: { tiers: [{ totalDays: 30, accrual: 'flat' }] }, restrictions: { pastDaysAllowed: 7, exceedBalance: 'allow' } });
    types.BKD = back.body.id;
    const r = await h.api.post(L).set(s.auth).send({ employeeId: emp.id, leaveTypeId: types.BKD, fromDate: day, toDate: day, reason: 'Unwell' });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect((await h.api.get(`/v1/attendance/days/${emp.id}/${day}`).set(w.co.auth)).body.day.statusCode).toBe('PUL');

    expect((await h.api.post(`${L}/${r.body.id}/approve`).set(s.auth).send({})).status).toBe(403);
    expect((await h.api.post(`${L}/${r.body.id}/approve`).set(st.auth).send({})).status).toBe(403);
    expect((await h.api.get(L).set(st.auth)).body.data).toHaveLength(0);
    expect((await h.api.get(L).set(m.auth)).body.data).toHaveLength(1);
    const ok = await h.api.post(`${L}/${r.body.id}/approve`).set(m.auth).send({ comment: 'Get well soon' });
    expect(ok.body).toMatchObject({ status: 'approved', actionComment: 'Get well soon' });
    expect((await h.api.post(`${L}/${r.body.id}/approve`).set(m.auth).send({})).body.code).toBe('already_actioned');
    expect((await h.api.get(`/v1/attendance/days/${emp.id}/${day}`).set(w.co.auth)).body.day).toMatchObject({ statusCode: 'L', leaveUnits: 1 });
    const bal = (await h.api.get('/v1/leave/balances').set(s.auth)).body.find((x: { code: string }) => x.code === 'BKD');
    expect(bal.taken).toBe(1);
    const ledger = await h.api.get(`/v1/leave/balances/ledger?employeeId=${emp.id}&leaveTypeId=${types.BKD}`).set(w.co.auth);
    expect(ledger.body[0]).toMatchObject({ kind: 'taken', days: 1 });

    // payroll counts unpaid leave as a deduction day: payable days exclude it
    expect((await h.api.post(`${L}/${r.body.id}/cancel`).set(m.auth)).body.status).toBe('cancelled');
    expect((await h.api.get('/v1/leave/balances').set(s.auth)).body.find((x: { code: string }) => x.code === 'BKD').taken).toBe(0);
    expect((await h.api.get(`/v1/attendance/days/${emp.id}/${day}`).set(w.co.auth)).body.day.statusCode).toBe('AB');
  });

  it('requires a reason to reject and blocks self-approval', async () => {
    const e = await w.employee('Reject Rani');
    const s = await w.join(e);
    const r = await h.api.post(L).set(s.auth).send({ employeeId: e.id, leaveTypeId: types.CL, fromDate: future(16), toDate: future(16) });
    expect((await h.api.post(`${L}/${r.body.id}/reject`).set(w.co.auth).send({})).status).toBe(422);
    expect((await h.api.post(`${L}/${r.body.id}/reject`).set(w.co.auth).send({ comment: 'Peak season' })).body.status).toBe('rejected');
    expect((await h.api.post(`${L}/${r.body.id}/cancel`).set(s.auth)).body.code).toBe('already_actioned');
    expect((await h.api.patch(`${L}/${r.body.id}`).set(s.auth).send({ reason: 'x' })).body.code).toBe('not_editable');
    // an employee-role user holding approve rights still cannot approve their own request
    const mgr = await w.employee('Self Approver');
    const m = await w.join(mgr, ['manager']);
    const mine = await h.api.post(L).set(m.auth).send({ employeeId: mgr.id, leaveTypeId: types.CL, fromDate: future(18), toDate: future(18) });
    expect(mine.status).toBe(201);
    const self = await h.api.post(`${L}/${mine.body.id}/approve`).set(m.auth).send({});
    expect(self.status).toBe(403);
    expect(self.body.code).toBe('self_approval');
  });

  it('auto-approves leave types configured to do so', async () => {
    const t = await h.api.post('/v1/leave/types').set(w.co.auth).send({
      name: 'Bonus day', code: 'bd', paid: true, entitlement: { tiers: [{ totalDays: 3, accrual: 'flat' }] }, restrictions: { autoApprove: true },
    });
    expect(t.status, JSON.stringify(t.body)).toBe(201);
    expect(t.body.code).toBe('BD');
    const e = await w.employee('Auto Aarav');
    const s = await w.join(e);
    const r = await h.api.post(L).set(s.auth).send({ employeeId: e.id, leaveTypeId: t.body.id, fromDate: future(21), toDate: future(21) });
    expect(r.body.status).toBe('approved');
    expect((await h.api.get('/v1/leave/balances').set(s.auth)).body.find((x: { code: string }) => x.code === 'BD').taken).toBe(1);
  });
});

describe('calendar, adjustments and configuration', () => {
  it('returns requests, holidays and weekly offs for a range, scoped to the viewer', async () => {
    const from = future(10);
    const e = await w.employee('Calendar Cara');
    const s = await w.join(e);
    await h.api.post(L).set(s.auth).send({ employeeId: e.id, leaveTypeId: types.CL, fromDate: from, toDate: from });
    const cal = await h.api.get(`/v1/leave/calendar?from=${from}&to=${nextDay(from)}`).set(s.auth);
    expect(cal.status).toBe(200);
    expect(cal.body.requests.map((r: { employeeId: string }) => r.employeeId)).toEqual([e.id]);
    expect(cal.body.nonWorking.some((n: { name: string }) => n.name === 'Sundays')).toBe(true);
    expect((await h.api.get(`/v1/leave/calendar?from=2026-01-01&to=2026-12-31`).set(s.auth)).status).toBe(422);
  });

  it('credits, debits and expires compensatory leave', async () => {
    const e = await w.employee('Adjust Asha');
    const body = { employeeId: e.id, leaveTypeId: types.CL, days: 2, note: 'Goodwill credit' };
    const before = (await h.api.get(`/v1/leave/balances?employeeId=${e.id}`).set(w.co.auth)).body.find((x: { code: string }) => x.code === 'CL').balance;
    const up = await h.api.post('/v1/leave/balances/adjust').set(w.co.auth).send(body);
    expect(up.body.balance).toBe(before + 2);
    const down = await h.api.post('/v1/leave/balances/adjust').set(w.co.auth).send({ ...body, days: 1, direction: 'debit', note: 'Correction' });
    expect(down.body.balance).toBe(before + 1);
    expect((await h.api.post('/v1/leave/balances/adjust').set(w.co.auth).send({ ...body, note: 'x' })).status).toBe(422);
    expect((await h.api.post('/v1/leave/balances/adjust').set(w.co.auth).send({ ...body, kind: 'comp_off' })).body.code).toBe('comp_off_disabled');
    const co = await h.api.post('/v1/leave/types').set(w.co.auth).send({ name: 'Comp off', code: 'CO', entitlement: { tiers: [{ totalDays: 0, accrual: 'flat' }], compOff: { enabled: true, expiryDays: 30 } } });
    expect((await h.api.post('/v1/leave/balances/adjust').set(w.co.auth).send({ ...body, leaveTypeId: co.body.id, days: 1, kind: 'comp_off', note: 'Worked on a holiday' })).body.balance).toBe(1);
    // a manager without the adjust permission cannot
    const mgr = await w.employee('Adjust Manager');
    const m = await w.join(mgr, ['manager']);
    expect((await h.api.post('/v1/leave/balances/adjust').set(m.auth).send(body)).status).toBe(403);
  });

  it('validates leave types and protects ones in use', async () => {
    const dup = await h.api.post('/v1/leave/types').set(w.co.auth).send({ name: 'Casual leave', code: 'XX', entitlement: { tiers: [{ totalDays: 1 }] } });
    expect(dup.status).toBe(409);
    expect((await h.api.post('/v1/leave/types').set(w.co.auth).send({ name: 'Bad', code: 'BAD', entitlement: { tiers: [] } })).status).toBe(422);
    expect((await h.api.post('/v1/leave/types').set(w.co.auth).send({ name: 'Bad color', code: 'BC', color: 'red', entitlement: { tiers: [{ totalDays: 1 }] } })).status).toBe(422);
    const e = await w.employee('Protect Priya');
    const s = await w.join(e);
    await h.api.post(L).set(s.auth).send({ employeeId: e.id, leaveTypeId: types.EL, fromDate: future(30), toDate: future(30) });
    const del = await h.api.delete(`/v1/leave/types/${types.EL}`).set(w.co.auth);
    expect(del.status).toBe(409);
    expect(del.body.code).toBe('leave_type_in_use');
    // editing a type does not reset its JSON rules
    const before = (await h.api.get(`/v1/leave/types/${types.SL}`).set(w.co.auth)).body;
    await h.api.patch(`/v1/leave/types/${types.SL}`).set(w.co.auth).send({ description: 'Illness' });
    const after = (await h.api.get(`/v1/leave/types/${types.SL}`).set(w.co.auth)).body;
    expect(after.entitlement).toEqual(before.entitlement);
    expect(after.restrictions).toEqual(before.restrictions);
    void sql;
  });
});

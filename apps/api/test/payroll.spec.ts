import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JobsService } from '../src/jobs/jobs.service.js';
import { boot, world, type World } from './fixtures.js';
import type { Harness } from './harness.js';

let h: Harness;
let w: World;
const owner = new pg.Pool({ connectionString: process.env.DATABASE_URL });
beforeAll(async () => { h = await boot(); w = await world(h); });
afterAll(async () => { await h.close(); await owner.end(); });

/** The previous calendar month: finished, with a known length and Sundays. */
function lastMonth() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const days: string[] = [];
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86_400_000)) days.push(d.toISOString().slice(0, 10));
  return { start: days[0]!, end: days.at(-1)!, days };
}
const cyc = lastMonth();

/** Fills the cycle with computed attendance rows: present on weekdays and Saturdays, weekly off on Sundays, absent on the days given. */
async function attendance(employeeId: string, absent: string[] = []) {
  const tenant = (await h.api.get('/v1/auth/me').set(w.co.auth)).body.company.id as string;
  for (const d of cyc.days) {
    const sunday = new Date(`${d}T00:00:00Z`).getUTCDay() === 0;
    const code = sunday ? 'NW' : absent.includes(d) ? 'AB' : 'P';
    await owner.query(
      `insert into attendance_days (tenant_id, employee_id, date, status_code, present_units, absent_units) values ($1, $2, $3, $4, $5, $6) on conflict (tenant_id, employee_id, date) do nothing`,
      [tenant, employeeId, d, code, code === 'P' ? 1 : 0, code === 'AB' ? 1 : 0],
    );
  }
}
const structure = (employeeId: string, over: Record<string, unknown> = {}) => h.api.post('/v1/payroll/salary-structures').set(w.co.auth).send({ employeeId, effectiveFrom: '2024-01-01', basic: 20000, hra: 8000, specialAllowance: 10000, pfEnabled: true, professionalTax: 200, ...over });

describe('payroll', () => {
  it('is for payroll staff only: salaries and runs are closed to managers and employees', async () => {
    const m = await w.join(await w.employee('Pay Manager'), ['manager']);
    const e = await w.join(await w.employee('Pay Plain'));
    for (const auth of [m.auth, e.auth]) {
      expect((await h.api.get('/v1/payroll/runs').set(auth)).status).toBe(403);
      expect((await h.api.get('/v1/payroll/salary-structures').set(auth)).status).toBe(403);
      expect((await h.api.post('/v1/payroll/runs').set(auth).send({ date: cyc.end })).status).toBe(403);
    }
    expect((await h.api.get('/v1/payroll/runs').set(w.co.auth)).status).toBe(200);
  });

  it('drafts a run from attendance and salary structures, prorates loss of pay, and flags people without a structure', async () => {
    const full = await w.employee('Pay Full');
    const lop = await w.employee('Pay Lop');
    const none = await w.employee('Pay NoStructure');
    expect((await structure(full.id)).status).toBe(201);
    expect((await structure(lop.id)).status).toBe(201);
    const absent = cyc.days.filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() !== 0).slice(0, 4);
    await attendance(full.id); await attendance(lop.id, absent); await attendance(none.id);

    // a cycle that has not ended cannot be drafted
    expect((await h.api.post('/v1/payroll/runs').set(w.co.auth).send({ date: new Date().toISOString().slice(0, 10) })).body.code).toBe('cycle_not_ended');

    const r = await h.api.post('/v1/payroll/runs').set(w.co.auth).send({ date: cyc.end });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.run).toMatchObject({ status: 'draft', cycleStart: cyc.start, cycleEnd: cyc.end });
    expect(r.body.missingStructure).toContain('Pay NoStructure');
    const slips = r.body.payslips as { name: string; gross: number; net: number; payableDays: number; lopDays: number; cycleDays: number }[];
    const f = slips.find((s) => s.name === 'Pay Full')!;
    expect(f).toMatchObject({ gross: 38000, payableDays: cyc.days.length, lopDays: 0 });
    expect(f.net).toBe(36000); // 38,000 less provident fund 1,800 and professional tax 200
    const l = slips.find((s) => s.name === 'Pay Lop')!;
    expect(l.lopDays).toBe(4);
    expect(l.gross).toBeCloseTo((38000 * (cyc.days.length - 4)) / cyc.days.length, 1);
    expect(slips.find((s) => s.name === 'Pay NoStructure')).toBeUndefined();
    expect(r.body.run.employees).toBe(slips.length);
    expect(r.body.run.net).toBeCloseTo(slips.reduce((a, s) => a + s.net, 0), 1);

    // changing a structure and redrafting recalculates, without duplicating the run
    await h.api.post('/v1/payroll/salary-structures').set(w.co.auth).send({ employeeId: full.id, effectiveFrom: '2025-01-01', basic: 30000, hra: 10000, pfEnabled: false, professionalTax: 0 });
    const again = await h.api.post('/v1/payroll/runs').set(w.co.auth).send({ date: cyc.start });
    expect(again.body.run.id).toBe(r.body.run.id);
    expect((again.body.payslips as { name: string; gross: number }[]).find((s) => s.name === 'Pay Full')!.gross).toBe(40000);
    expect(((await h.api.get('/v1/payroll/runs').set(w.co.auth)).body.data as unknown[]).length).toBe(1);
  });

  it('finalizes (locking attendance), releases payslips only then, pays, and notifies each person', async () => {
    const run = (await h.api.get('/v1/payroll/runs').set(w.co.auth)).body.data[0] as { id: string };
    const detail = (await h.api.get(`/v1/payroll/runs/${run.id}`).set(w.co.auth)).body.payslips as { id: string; employeeId: string; name: string }[];
    const person = detail.find((s) => s.name === 'Pay Full')!;
    const emp = await w.join({ id: person.employeeId, workEmail: (await owner.query('select work_email from employees where id = $1', [person.employeeId])).rows[0].work_email });

    // while drafting, the person sees nothing
    expect((await h.api.get('/v1/payroll/payslips').set(emp.auth)).body.data).toHaveLength(0);
    expect((await h.api.get(`/v1/payroll/payslips/${person.id}`).set(emp.auth)).status).toBe(404);
    expect((await h.api.get(`/v1/payroll/payslips/${person.id}`).set(w.co.auth)).status).toBe(200);

    expect((await h.api.post(`/v1/payroll/runs/${run.id}/pay`).set(w.co.auth).send({})).body.code).toBe('not_finalized');
    const fin = await h.api.post(`/v1/payroll/runs/${run.id}/finalize`).set(w.co.auth).send({});
    expect(fin.body.run.status).toBe('finalized');
    const locked = await owner.query(`select count(*)::int as n from attendance_days where date between $1 and $2 and not locked`, [cyc.start, cyc.end]);
    expect(locked.rows[0].n).toBe(0);
    expect((await h.api.post('/v1/payroll/runs').set(w.co.auth).send({ date: cyc.end })).body.code).toBe('run_closed');

    // reopening unlocks; finalizing again locks again
    expect((await h.api.post(`/v1/payroll/runs/${run.id}/reopen`).set(w.co.auth).send({})).body.run.status).toBe('draft');
    expect((await owner.query(`select count(*)::int as n from attendance_days where date between $1 and $2 and locked`, [cyc.start, cyc.end])).rows[0].n).toBe(0);
    await h.api.post(`/v1/payroll/runs/${run.id}/finalize`).set(w.co.auth).send({});

    // finalized payslips are visible to their owner only
    const mine = (await h.api.get('/v1/payroll/payslips').set(emp.auth)).body.data as { id: string; employeeId: string; label: string }[];
    expect(mine).toHaveLength(1);
    expect(mine[0]!.employeeId).toBe(person.employeeId);
    const other = detail.find((s) => s.name === 'Pay Lop')!;
    expect((await h.api.get(`/v1/payroll/payslips/${other.id}`).set(emp.auth)).status).toBe(404);

    const paid = await h.api.post(`/v1/payroll/runs/${run.id}/pay`).set(w.co.auth).send({ reference: 'NEFT-BATCH-77' });
    expect(paid.body.run).toMatchObject({ status: 'paid', paymentReference: 'NEFT-BATCH-77' });
    expect((await h.api.post(`/v1/payroll/runs/${run.id}/reopen`).set(w.co.auth).send({})).body.code).toBe('not_finalized');
    await h.app.get(JobsService).run('outbox-relay');
    const notes = (await h.api.get('/v1/notifications').set(emp.auth)).body.data as { title: string; link: string }[];
    expect(notes.some((n) => /payslip for .* is ready/.test(n.title) && n.link === '/me/payslips')).toBe(true);

    const html = await h.api.get(`/v1/payroll/payslips/${person.id}/print`).set(emp.auth);
    expect(html.status).toBe(200);
    expect(html.headers['content-type']).toContain('text/html');
    expect(html.text).toContain('Pay Full');
    expect(html.text).toContain('Net pay');
    expect(html.text).not.toContain('Pay Lop');
    const csv = await h.api.get(`/v1/payroll/runs/${run.id}/export?format=csv`).set(w.co.auth);
    expect(csv.text).toContain('Net pay');
    expect(csv.text).toContain('Pay Lop');
  });
});

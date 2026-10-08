import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, world, type World } from './fixtures.js';
import type { Harness } from './harness.js';
import { JobsService } from '../src/jobs/jobs.service.js';

let h: Harness;
let w: World;
let cat: Record<string, string>;
beforeAll(async () => {
  h = await boot();
  w = await world(h);
  const c = await h.api.get('/v1/admin/expenses/categories?limit=50').set(w.co.auth);
  cat = Object.fromEntries(c.body.data.map((x: { name: string; id: string }) => [x.name, x.id]));
});
afterAll(async () => { await h.close(); });

const today = () => new Date().toISOString().slice(0, 10);
const ago = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10);

describe('expense claims', () => {
  it('seeds default categories for a new company', () => {
    expect(Object.keys(cat)).toEqual(expect.arrayContaining(['Travel', 'Fuel', 'Meals', 'Other']));
  });

  it('runs submit, approve, pay with the right permissions at each step', async () => {
    const mgr = await w.employee('Exp Manager');
    const emp = await w.employee('Exp Employee', { reportingManagerId: mgr.id });
    const m = await w.join(mgr, ['manager']);
    const s = await w.join(emp);
    const made = await h.api.post('/v1/expenses/claims').set(s.auth).send({ employeeId: emp.id, categoryId: cat.Travel, expenseDate: today(), amount: 480.5, merchant: 'Metro', status: 'paid', approvedAmount: 9999 });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ status: 'pending', currency: 'INR', approvedAmount: null, code: expect.stringMatching(/^EXP-/) });

    expect((await h.api.post(`/v1/expenses/claims/${made.body.id}/approve`).set(s.auth).send({})).status).toBe(403); // not their own
    const ok = await h.api.post(`/v1/expenses/claims/${made.body.id}/approve`).set(m.auth).send({ approvedAmount: 400, comment: 'Within policy' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: 'approved', approvedAmount: 400 });
    expect((await h.api.post(`/v1/expenses/claims/${made.body.id}/approve`).set(m.auth).send({})).status).toBe(409);
    expect((await h.api.post(`/v1/expenses/claims/${made.body.id}/pay`).set(m.auth).send({})).status).toBe(403); // managers do not pay
    const paid = await h.api.post(`/v1/expenses/claims/${made.body.id}/pay`).set(w.co.auth).send({ reference: 'NEFT-7781' });
    expect(paid.body).toMatchObject({ status: 'paid', paymentReference: 'NEFT-7781' });
    expect((await h.api.patch(`/v1/expenses/claims/${made.body.id}`).set(s.auth).send({ amount: 1 })).status).toBe(409);
  });

  it('enforces category limits, dates and descriptions', async () => {
    const emp = await w.employee('Exp Rules');
    const s = await w.join(emp);
    await h.api.patch(`/v1/admin/expenses/categories/${cat.Fuel}`).set(w.co.auth).send({ maxAmount: 1000 });
    const post = (b: Record<string, unknown>) => h.api.post('/v1/expenses/claims').set(s.auth).send({ employeeId: emp.id, categoryId: cat.Meals, expenseDate: today(), amount: 100, ...b });
    expect((await post({ categoryId: cat.Fuel, amount: 1500 })).body.code).toBe('over_limit');
    expect((await post({ expenseDate: ago(-3) })).status).toBe(422);
    expect((await post({ expenseDate: ago(120) })).body.code).toBe('claim_too_old');
    expect((await post({ categoryId: cat.Other })).status).toBe(422); // description required
    expect((await post({ categoryId: cat.Other, description: 'Courier charges' })).status).toBe(201);
    expect((await post({ amount: 0 })).status).toBe(422);
  });

  it('needs a reason to reject, caps approvals, and lets the requester cancel', async () => {
    const mgr = await w.employee('Exp Boss');
    const emp = await w.employee('Exp Cancel', { reportingManagerId: mgr.id });
    const m = await w.join(mgr, ['manager']);
    const s = await w.join(emp);
    const mk = async () => (await h.api.post('/v1/expenses/claims').set(s.auth).send({ employeeId: emp.id, categoryId: cat.Meals, expenseDate: today(), amount: 200 })).body.id as string;
    const a = await mk();
    expect((await h.api.post(`/v1/expenses/claims/${a}/reject`).set(m.auth).send({})).status).toBe(422);
    expect((await h.api.post(`/v1/expenses/claims/${a}/approve`).set(m.auth).send({ approvedAmount: 500 })).status).toBe(422);
    expect((await h.api.post(`/v1/expenses/claims/${a}/reject`).set(m.auth).send({ comment: 'No receipt' })).body).toMatchObject({ status: 'rejected', approvedAmount: 0 });
    const b = await mk();
    expect((await h.api.post(`/v1/expenses/claims/${b}/cancel`).set(s.auth).send({})).body.status).toBe('cancelled');
    expect((await h.api.post(`/v1/expenses/claims/${b}/cancel`).set(s.auth).send({})).status).toBe(409);
  });

  it('keeps claims inside scope, bulk-approves, summarises and notifies', async () => {
    const mgr = await w.employee('Exp Lead');
    const mine = await w.employee('Exp Mine', { reportingManagerId: mgr.id });
    const other = await w.employee('Exp Other');
    const m = await w.join(mgr, ['manager']);
    const sm = await w.join(mine);
    const so = await w.join(other);
    const claim = async (s: typeof sm, e: typeof mine) => (await h.api.post('/v1/expenses/claims').set(s.auth).send({ employeeId: e.id, categoryId: cat.Fuel, expenseDate: today(), amount: 300 })).body.id as string;
    const c1 = await claim(sm, mine);
    const c2 = await claim(so, other);
    expect((await h.api.get(`/v1/expenses/claims/${c2}`).set(m.auth)).status).toBe(404);
    expect((await h.api.get(`/v1/expenses/claims/${c1}`).set(so.auth)).status).toBe(404);
    expect((await h.api.post('/v1/expenses/claims/approve').set(m.auth).send({ ids: [c1, c2] })).body.results.map((r: { ok: boolean }) => r.ok)).toEqual([true, false]);
    const sum = await h.api.get('/v1/expenses/claims/summary').set(m.auth);
    expect(sum.body).toMatchObject({ approvedUnpaid: 1, approvedUnpaidAmount: 300 });

    await h.app.get(JobsService).run('outbox-relay');
    const inbox = await h.api.get('/v1/notifications').set(sm.auth);
    expect(inbox.body.data.map((n: { title: string }) => n.title)).toContain('Your expense claim was approved');
    const boss = await h.api.get('/v1/notifications').set(m.auth);
    expect(boss.body.data.map((n: { title: string }) => n.title)).toContain('Exp Mine submitted an expense claim');

    const rep = await h.api.get(`/v1/reports/expense-summary?from=${today().slice(0, 8)}01&to=${today()}`).set(w.co.auth);
    const row = rep.body.rows.find((r: { employee: string }) => r.employee === 'Exp Mine');
    expect(row).toMatchObject({ claims: 1, claimed: 300, approved: 300, paid: 0 });
  });
});

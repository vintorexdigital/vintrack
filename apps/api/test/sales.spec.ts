import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, world, type World } from './fixtures.js';
import type { Harness } from './harness.js';

let h: Harness;
let w: World;
beforeAll(async () => { h = await boot(); w = await world(h); });
afterAll(async () => { await h.close(); });

describe('leads', () => {
  it('moves through stages, needs a reason to lose, and cannot change once closed', async () => {
    const emp = await w.employee('Lead Rep');
    const s = await w.join(emp);
    const made = await h.api.post('/v1/sales/leads').set(s.auth).send({ name: 'Priya Shah', companyName: 'Shah Textiles', phone: '+919876543210', ownerId: emp.id, value: 250000, stage: 'won' });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect(made.body).toMatchObject({ stage: 'new', code: expect.stringMatching(/^LEAD-/) });
    const id = made.body.id as string;
    expect((await h.api.post(`/v1/sales/leads/${id}/stage`).set(s.auth).send({ stage: 'contacted', nextFollowUpAt: new Date(Date.now() + 86_400_000).toISOString() })).body.stage).toBe('contacted');
    expect((await h.api.post(`/v1/sales/leads/${id}/stage`).set(s.auth).send({ stage: 'lost' })).status).toBe(422);
    const lost = await h.api.post(`/v1/sales/leads/${id}/stage`).set(s.auth).send({ stage: 'lost', reason: 'Chose a competitor' });
    expect(lost.body).toMatchObject({ stage: 'lost', lostReason: 'Chose a competitor', nextFollowUpAt: null });
    expect((await h.api.post(`/v1/sales/leads/${id}/stage`).set(s.auth).send({ stage: 'qualified' })).status).toBe(409);
    expect((await h.api.patch(`/v1/sales/leads/${id}`).set(s.auth).send({ notes: 'x' })).status).toBe(409);
  });

  it('converts a won lead into a customer with a primary contact, once', async () => {
    const mgr = await w.employee('Lead Manager');
    const emp = await w.employee('Lead Closer', { reportingManagerId: mgr.id });
    const m = await w.join(mgr, ['manager']);
    const lead = (await h.api.post('/v1/sales/leads').set(m.auth).send({ name: 'Ravi Kumar', companyName: 'Kumar Stores', phone: '+919811111111', ownerId: emp.id })).body;
    // an employee without customer-creation rights cannot convert
    const s = await w.join(emp);
    expect((await h.api.post(`/v1/sales/leads/${lead.id}/convert`).set(s.auth)).status).toBe(403);
    const r = await h.api.post(`/v1/sales/leads/${lead.id}/convert`).set(w.co.auth);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.lead).toMatchObject({ stage: 'won', convertedCustomerId: r.body.customerId });
    const cust = await h.api.get(`/v1/field/customers/${r.body.customerId}`).set(w.co.auth);
    expect(cust.body).toMatchObject({ name: 'Kumar Stores', accountOwnerId: emp.id, code: expect.stringMatching(/^CUST-/) });
    const contacts = await h.api.get(`/v1/field/contacts?filter[customerId][eq]=${r.body.customerId}`).set(w.co.auth);
    expect(contacts.body.data).toHaveLength(1);
    expect(contacts.body.data[0]).toMatchObject({ name: 'Ravi Kumar', isPrimary: true });
    expect((await h.api.post(`/v1/sales/leads/${lead.id}/convert`).set(w.co.auth)).status).toBe(409);
  });

  it('keeps leads in scope and assigns only inside it', async () => {
    const mgr = await w.employee('Scope Sales Boss');
    const mine = await w.employee('Scope Sales Mine', { reportingManagerId: mgr.id });
    const other = await w.employee('Scope Sales Other');
    const m = await w.join(mgr, ['manager']);
    const so = await w.join(other);
    expect((await h.api.post('/v1/sales/leads').set(m.auth).send({ name: 'Out', ownerId: other.id })).status).toBe(403);
    const ok = await h.api.post('/v1/sales/leads').set(m.auth).send({ name: 'In', ownerId: mine.id });
    expect(ok.status).toBe(201);
    expect((await h.api.get(`/v1/sales/leads/${ok.body.id}`).set(so.auth)).status).toBe(404);
    expect((await h.api.post(`/v1/sales/leads/${ok.body.id}/stage`).set(so.auth).send({ stage: 'contacted' })).status).toBe(404);
    const rep = await h.api.get('/v1/reports/lead-funnel').set(w.co.auth);
    expect(rep.status).toBe(200);
  });
});

describe('call log', () => {
  it('lets people log their own calls, refuses other people\'s, and keeps them in scope', async () => {
    const a = await w.employee('Caller A');
    const b = await w.employee('Caller B');
    const sa = await w.join(a);
    const sb = await w.join(b);
    const call = { employeeId: a.id, phone: '+919822222222', direction: 'outgoing', startedAt: new Date(Date.now() - 600_000).toISOString(), durationSeconds: 95, outcome: 'connected' };
    const ok = await h.api.post('/v1/field/calls').set(sa.auth).send(call);
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect((await h.api.post('/v1/field/calls').set(sb.auth).send(call)).status).toBe(403);
    expect((await h.api.post('/v1/field/calls').set(sa.auth).send({ ...call, startedAt: new Date(Date.now() + 3_600_000).toISOString() })).status).toBe(422);
    expect((await h.api.get(`/v1/field/calls/${ok.body.id}`).set(sb.auth)).status).toBe(404);
    expect((await h.api.get(`/v1/field/calls/${ok.body.id}`).set(sa.auth)).status).toBe(200);
  });
});

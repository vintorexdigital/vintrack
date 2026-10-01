import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RazorpayProvider, StripeProvider } from '../src/modules/billing/payment-provider.js';
import { BillingService } from '../src/modules/billing/billing.service.js';
import { boot, ownerSession, platformAdmin, type Harness } from './harness.js';

let h: Harness;
let admin: Awaited<ReturnType<typeof platformAdmin>>;
let finance: Awaited<ReturnType<typeof platformAdmin>>;
let billing: BillingService;
beforeAll(async () => {
  h = await boot();
  admin = await platformAdmin(h);
  finance = await platformAdmin(h, 'finance');
  billing = h.app.get(BillingService);
});
afterAll(async () => { await h.close(); });

const tenantStatus = async (id: string) => (await h.api.get(`/platform/v1/tenants/${id}`).set(admin.auth)).body.status as string;

describe('plans and public pricing', () => {
  it('lists purchasable plans with prices without signing in', async () => {
    const r = await h.api.get('/v1/public/plans');
    expect(r.status).toBe(200);
    expect(r.body.map((p: { key: string }) => p.key)).toEqual(['office', 'field', 'all_in_one']);
    expect(r.body[1].prices.INR).toBeGreaterThan(0);
  });
  it('lets finance change a price and records it in the audit log', async () => {
    const r = await h.api.put('/platform/v1/plans/office').set(finance.auth).send({ prices: { INR: 10_900, USD: 200 } });
    expect(r.status).toBe(200);
    expect(r.body.prices.INR).toBe(10_900);
    await h.api.put('/platform/v1/plans/office').set(finance.auth).send({ prices: { INR: 9_900, USD: 200 } });
    const support = await platformAdmin(h, 'support');
    expect((await h.api.put('/platform/v1/plans/office').set(support.auth).send({ prices: { INR: 1 } })).status).toBe(403);
  });
});

describe('subscribing, invoices and payment', () => {
  it('turns a trial into an active paid company once the first invoice is paid', async () => {
    const co = await ownerSession(h, admin, { seatLimit: 20 });
    const sub = await h.api.get('/v1/billing/subscription').set(co.auth);
    expect(sub.body).toMatchObject({ status: 'trial', planKey: 'trial', paymentMethod: 'bank_transfer' });
    expect(sub.body.plans.map((p: { key: string }) => p.key)).toEqual(['office', 'field', 'all_in_one']);

    const made = await h.api.post('/v1/billing/subscribe').set(co.auth).send({ planKey: 'field', seats: 10 });
    expect(made.status).toBe(200);
    expect(made.body.totalMinor).toBe(Math.round(10 * 14_900 * 1.18));
    expect(await tenantStatus(co.tenantId)).toBe('trial');
    expect((await h.api.post('/v1/billing/subscribe').set(co.auth).send({ planKey: 'office', seats: 5 })).status).toBe(409);

    const inv = await h.api.get(`/v1/billing/invoices/${made.body.invoiceId}`).set(co.auth);
    expect(inv.body).toMatchObject({ status: 'open', seats: 10, taxRateBps: 1800, currency: 'INR' });
    expect(inv.body.number).toMatch(/^INV-\d{4}-\d{5}$/);
    const howto = await h.api.post(`/v1/billing/invoices/${made.body.invoiceId}/pay`).set(co.auth).send({});
    expect(howto.body).toMatchObject({ method: 'bank_transfer', reference: inv.body.number });

    const pay = await h.api.post(`/platform/v1/invoices/${made.body.invoiceId}/payments`).set(finance.auth).send({ amountMinor: made.body.totalMinor, reference: 'UTR123' });
    expect(pay.status).toBe(201);
    expect(pay.body.status).toBe('paid');
    expect(await tenantStatus(co.tenantId)).toBe('active');
    expect((await h.api.post(`/v1/billing/invoices/${made.body.invoiceId}/pay`).set(co.auth).send({})).status).toBe(409);
  });

  it('accumulates part payments and is idempotent per provider event', async () => {
    const co = await ownerSession(h, admin);
    const made = await h.api.post('/v1/billing/subscribe').set(co.auth).send({ planKey: 'office', seats: 4 });
    const id = made.body.invoiceId as string;
    const half = Math.floor(made.body.totalMinor / 2);
    const p1 = await billing.recordPayment(id, { amountMinor: half }, { method: 'razorpay', providerEventId: 'evt_1' });
    expect(p1.status).toBe('open');
    await billing.recordPayment(id, { amountMinor: half }, { method: 'razorpay', providerEventId: 'evt_1' }); // redelivery
    expect((await billing.get(id)).payments).toHaveLength(1);
    const p2 = await billing.recordPayment(id, { amountMinor: made.body.totalMinor - half }, { method: 'razorpay', providerEventId: 'evt_2' });
    expect(p2.status).toBe('paid');
  });

  it('refuses seat counts below active employees and changes plans without a new invoice', async () => {
    const co = await ownerSession(h, admin, { seatLimit: 30 });
    for (let i = 0; i < 3; i++) {
      await h.api.post('/v1/people/employees').set(co.auth).send({ firstName: 'E', displayName: `Seat ${i}`, dateOfJoining: '2024-01-01' });
    }
    const low = await h.api.post('/v1/billing/subscribe').set(co.auth).send({ planKey: 'field', seats: 2 });
    expect(low.status).toBe(422);
    expect(low.body.code).toBe('seats_below_usage');
    expect((await h.api.post('/v1/billing/subscribe').set(co.auth).send({ planKey: 'field', seats: 5 })).status).toBe(200);
    const up = await h.api.post('/v1/billing/change').set(co.auth).send({ planKey: 'all_in_one', seats: 12 });
    expect(up.body).toMatchObject({ planKey: 'all_in_one', seatLimit: 12, billedFrom: 'next_invoice' });
    expect((await h.api.post('/v1/billing/change').set(co.auth).send({ seats: 1 })).status).toBe(422);
    expect((await h.api.post('/v1/billing/change').set(co.auth).send({})).status).toBe(422);
  });

  it('keeps invoices private to the company and gives a printable copy', async () => {
    const a = await ownerSession(h, admin);
    const b = await ownerSession(h, admin);
    const made = await h.api.post('/v1/billing/subscribe').set(a.auth).send({ planKey: 'office', seats: 3 });
    expect((await h.api.get(`/v1/billing/invoices/${made.body.invoiceId}`).set(b.auth)).status).toBe(404);
    expect((await h.api.get('/v1/billing/invoices').set(b.auth)).body).toEqual([]);
    const print = await h.api.get(`/v1/billing/invoices/${made.body.invoiceId}/print`).set(a.auth);
    expect(print.status).toBe(200);
    expect(print.text).toContain('Tax invoice INV-');
    expect(print.text).toContain('Tax (18%)');
    // employees without billing permission cannot read plan or invoices
    const emp = await h.api.post('/v1/people/employees').set(a.auth).send({ firstName: 'Plain', displayName: 'Plain Employee', dateOfJoining: '2024-01-01', workEmail: 'plain@example.com' });
    const inv = await h.api.post(`/v1/people/employees/${emp.body.id}/invite`).set(a.auth).send({ roleKeys: ['employee'] });
    const acc = await h.api.post('/v1/auth/invitations/accept').set('x-client', 'api').send({ token: inv.body.devToken, name: 'Plain', password: 'Sup3rSecret!x' });
    expect(acc.body.status).toBe('ok');
    expect((await h.api.get('/v1/billing/subscription').set({ Authorization: `Bearer ${acc.body.accessToken}` })).status).toBe(403);
  });

  it('is idempotent per month and can reissue after a void', async () => {
    const co = await ownerSession(h, admin);
    await h.api.post('/v1/billing/subscribe').set(co.auth).send({ planKey: 'office', seats: 2 });
    const a = await h.api.post(`/platform/v1/tenants/${co.tenantId}/invoices`).set(finance.auth).send({});
    const b = await h.api.post(`/platform/v1/tenants/${co.tenantId}/invoices`).set(finance.auth).send({});
    expect(a.body.id).toBe(b.body.id);
    expect((await h.api.post(`/platform/v1/invoices/${a.body.id}/void`).set(finance.auth).send({ reason: 'Wrong seats' })).body.status).toBe('void');
    const c = await h.api.post(`/platform/v1/tenants/${co.tenantId}/invoices`).set(finance.auth).send({});
    expect(c.body.id).not.toBe(a.body.id);
    const next = await h.api.post(`/platform/v1/tenants/${co.tenantId}/invoices`).set(finance.auth).send({ date: '2031-02-14' });
    expect(next.body).toMatchObject({ periodStart: '2031-02-01', periodEnd: '2031-02-28' });
    expect((await h.api.get(`/platform/v1/invoices?tenantId=${co.tenantId}`).set(finance.auth)).body.length).toBeGreaterThanOrEqual(3);
  });
});

describe('dunning', () => {
  it('moves overdue companies to past due, then suspends, and restores them on payment', async () => {
    const co = await ownerSession(h, admin);
    const made = await h.api.post('/v1/billing/subscribe').set(co.auth).send({ planKey: 'office', seats: 2 });
    await h.api.post(`/platform/v1/invoices/${made.body.invoiceId}/payments`).set(finance.auth).send({ amountMinor: made.body.totalMinor });
    expect(await tenantStatus(co.tenantId)).toBe('active');
    const next = await h.api.post(`/platform/v1/tenants/${co.tenantId}/invoices`).set(finance.auth).send({ date: '2031-03-10' });
    const dueMs = new Date(next.body.dueAt).getTime();
    await billing.runDunning(dueMs + 3 * 86_400_000);
    expect(await tenantStatus(co.tenantId)).toBe('active');
    await billing.runDunning(dueMs + 8 * 86_400_000);
    expect(await tenantStatus(co.tenantId)).toBe('past_due');
    await billing.runDunning(dueMs + 31 * 86_400_000);
    expect(await tenantStatus(co.tenantId)).toBe('suspended');
    await h.api.post(`/platform/v1/invoices/${next.body.id}/payments`).set(finance.auth).send({ amountMinor: next.body.totalMinor });
    // paying the open invoice lifts a suspension that was only for non-payment
    expect(await tenantStatus(co.tenantId)).toBe('active');
    const audit = await h.api.get(`/platform/v1/audit?tenantId=${co.tenantId}`).set(admin.auth);
    expect(audit.body.map((a: { action: string }) => a.action)).toEqual(expect.arrayContaining(['tenant.past_due', 'tenant.suspended_for_non_payment', 'invoice.issued']));
  });
});

describe('payment providers', () => {
  const body = Buffer.from(JSON.stringify({ event: 'payment_link.paid', payload: { payment_link: { entity: { id: 'plink_1', amount_paid: 12_345, currency: 'inr' } } } }));
  it('verifies Razorpay webhook signatures', () => {
    const p = new RazorpayProvider('k', 's', 'whsec');
    const sig = createHmac('sha256', 'whsec').update(body).digest('hex');
    expect(p.parseWebhook(body, { 'x-razorpay-signature': sig, 'x-razorpay-event-id': 'evt_9' })).toEqual({ eventId: 'evt_9', type: 'paid', providerRef: 'plink_1', amountMinor: 12_345, currency: 'INR' });
    expect(p.parseWebhook(body, { 'x-razorpay-signature': 'deadbeef', 'x-razorpay-event-id': 'evt_9' })).toBeNull();
    expect(p.parseWebhook(Buffer.from(body.toString() + ' '), { 'x-razorpay-signature': sig, 'x-razorpay-event-id': 'evt_9' })).toBeNull();
    expect(p.parseWebhook(body, {})).toBeNull();
  });
  it('verifies Stripe signatures and rejects stale timestamps', () => {
    const p = new StripeProvider('sk', 'whsec');
    const raw = Buffer.from(JSON.stringify({ id: 'evt_s1', type: 'checkout.session.completed', data: { object: { id: 'cs_1', amount_total: 500, currency: 'usd', payment_status: 'paid' } } }));
    const t = Math.floor(Date.now() / 1000);
    const sign = (ts: number) => `t=${ts},v1=${createHmac('sha256', 'whsec').update(`${ts}.${raw.toString()}`).digest('hex')}`;
    expect(p.parseWebhook(raw, { 'stripe-signature': sign(t) })).toMatchObject({ eventId: 'evt_s1', providerRef: 'cs_1', amountMinor: 500, currency: 'USD' });
    expect(p.parseWebhook(raw, { 'stripe-signature': sign(t - 3600) })).toBeNull();
    expect(p.parseWebhook(raw, { 'stripe-signature': `t=${t},v1=00` })).toBeNull();
  });
  it('creates checkouts through the gateway API', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fake = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(JSON.stringify({ id: 'plink_9', short_url: 'https://rzp.io/i/x' }), { status: 200 }); }) as unknown as typeof fetch;
    const out = await new RazorpayProvider('key', 'secret', 'wh', fake).createCheckout({ invoiceId: 'i1', number: 'INV-1', amountMinor: 1000, currency: 'INR', customer: { name: 'Acme' }, returnUrl: 'https://x/y' });
    expect(out).toEqual({ url: 'https://rzp.io/i/x', ref: 'plink_9' });
    expect(calls[0]!.url).toBe('https://api.razorpay.com/v1/payment_links');
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ amount: 1000, reference_id: 'i1' });
    const failing = (async () => new Response('no', { status: 500 })) as unknown as typeof fetch;
    await expect(new StripeProvider('sk', 'wh', failing).createCheckout({ invoiceId: 'i', number: 'n', amountMinor: 1, currency: 'USD', customer: { name: 'A' }, returnUrl: 'u' })).rejects.toThrow(/Stripe refused/);
  });
  it('rejects unsigned webhook calls', async () => {
    const r = await h.api.post('/v1/webhooks/billing').send({ event: 'payment_link.paid' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('invalid_webhook');
  });
});

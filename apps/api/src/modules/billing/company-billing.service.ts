import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { formatMoney } from '@trackrex/rules';
import { changeSubscriptionBody, planByKey, subscribeBody } from '@trackrex/schemas';
import { CONFIG, type Config } from '../../core/config.js';
import { invoices, memberships, payments, tenants, tenantUsage, users } from '../../core/auth/platform.tables.js';
import { TenantDirectory } from '../../core/auth/tenant-directory.service.js';
import { currentStore } from '../../core/context.js';
import { AuditService } from '../../core/audit.service.js';
import { Db } from '../../core/database/db.service.js';
import { conflict, notFound, unprocessable } from '../../core/errors.js';
import { Authz } from '../../core/rbac.service.js';
import { BillingService } from './billing.service.js';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider.js';

const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** What a company sees and can do about its own plan, seats and invoices. */
@Injectable()
export class CompanyBillingService {
  constructor(
    private readonly db: Db, private readonly authz: Authz, private readonly audit: AuditService, private readonly dir: TenantDirectory,
    private readonly billing: BillingService, @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider, @Inject(CONFIG) private readonly cfg: Config,
  ) {}

  private get tenantId(): string { return currentStore().tenantId!; }

  async subscription() {
    this.authz.require('billing.subscription.read');
    const [t] = await this.db.app.select().from(tenants).where(eq(tenants.id, this.tenantId));
    if (!t) throw notFound('Company');
    const [u] = await this.db.app.select().from(tenantUsage).where(eq(tenantUsage.tenantId, this.tenantId));
    const plan = planByKey(t.planKey);
    const catalogue = await this.billing.listPlans();
    const price = catalogue.find((p) => p.key === t.planKey)?.prices[t.currency] ?? catalogue.find((p) => p.key === t.planKey)?.prices.INR ?? 0;
    return {
      status: t.status, planKey: t.planKey, planName: plan?.name ?? t.planKey, modules: plan?.modules ?? [], trialEndsAt: t.trialEndsAt, currency: t.currency,
      seatLimit: t.seatLimit, seatsUsed: u?.employeesActive ?? 0, pricePerSeatMinor: price, monthlyMinor: price * t.seatLimit,
      paymentMethod: this.provider.name === 'manual' ? 'bank_transfer' : 'online',
      plans: catalogue.filter((p) => p.active && planByKey(p.key)?.purchasable).map((p) => ({ key: p.key, name: p.name, tagline: planByKey(p.key)!.tagline, highlights: planByKey(p.key)!.highlights, pricePerSeatMinor: p.prices[t.currency] ?? p.prices.INR ?? 0 })),
    };
  }

  /** Choose a first plan during a trial. The first invoice is issued now; the company becomes active when it is paid. */
  async subscribe(body: unknown) {
    this.authz.require('billing.subscription.manage');
    const b = subscribeBody.parse(body);
    const [t] = await this.db.app.select().from(tenants).where(eq(tenants.id, this.tenantId));
    if (!t) throw notFound('Company');
    if (t.planKey !== 'trial') throw conflict('already_subscribed', 'You already have a plan. Use change plan instead.');
    const [u] = await this.db.app.select().from(tenantUsage).where(eq(tenantUsage.tenantId, this.tenantId));
    if (b.seats < (u?.employeesActive ?? 0)) throw unprocessable(`You have ${u?.employeesActive} active employees; choose at least that many seats.`, [{ path: 'seats', message: 'Too few seats' }], 'seats_below_usage');
    await this.billing.priceFor(b.planKey, t.currency);
    await this.db.platform.update(tenants).set({ planKey: b.planKey, seatLimit: b.seats, updatedAt: sql`now()` }).where(eq(tenants.id, this.tenantId));
    this.dir.invalidate(this.tenantId);
    const inv = await this.billing.generate(this.tenantId);
    await this.audit.record({ entity: 'subscription', entityId: this.tenantId, action: 'subscribed', changes: { planKey: { old: 'trial', new: b.planKey }, seatLimit: { old: t.seatLimit, new: b.seats } } });
    return { invoiceId: inv.id, number: inv.number, totalMinor: inv.totalMinor };
  }

  /** Plan or seat changes take effect now; the new terms are billed from the next invoice. */
  async change(body: unknown) {
    this.authz.require('billing.subscription.manage');
    const b = changeSubscriptionBody.parse(body);
    const [t] = await this.db.app.select().from(tenants).where(eq(tenants.id, this.tenantId));
    if (!t) throw notFound('Company');
    if (t.planKey === 'trial') throw conflict('not_subscribed', 'Choose a plan first.');
    const [u] = await this.db.app.select().from(tenantUsage).where(eq(tenantUsage.tenantId, this.tenantId));
    const seats = b.seats ?? t.seatLimit;
    if (seats < (u?.employeesActive ?? 0)) throw unprocessable(`You have ${u?.employeesActive} active employees; remove or exit some before reducing seats below that.`, [{ path: 'seats', message: 'Too few seats' }], 'seats_below_usage');
    const planKey = b.planKey ?? t.planKey;
    if (planKey !== t.planKey) await this.billing.priceFor(planKey, t.currency);
    await this.db.platform.update(tenants).set({ planKey, seatLimit: seats, updatedAt: sql`now()` }).where(eq(tenants.id, this.tenantId));
    this.dir.invalidate(this.tenantId);
    await this.audit.record({ entity: 'subscription', entityId: this.tenantId, action: 'changed', changes: { planKey: { old: t.planKey, new: planKey }, seatLimit: { old: t.seatLimit, new: seats } } });
    return { ...(await this.subscription()), billedFrom: 'next_invoice' };
  }

  async invoices() {
    this.authz.require('billing.subscription.read');
    return this.db.q.select().from(invoices).where(ne(invoices.status, 'void')).orderBy(desc(invoices.issuedAt)).limit(100);
  }

  async invoice(id: string) {
    this.authz.require('billing.subscription.read');
    const [inv] = await this.db.q.select().from(invoices).where(eq(invoices.id, id));
    if (!inv) throw notFound('Invoice');
    const pays = await this.db.q.select().from(payments).where(eq(payments.invoiceId, id));
    return { ...inv, payments: pays };
  }

  /** Start an online payment. With bank transfer there is nothing to start: the response says how to pay. */
  async pay(id: string, returnUrl?: string) {
    this.authz.require('billing.subscription.manage');
    const inv = await this.invoice(id);
    if (inv.status !== 'open') throw conflict('invoice_not_open', inv.status === 'paid' ? 'This invoice is already paid.' : 'This invoice was voided.');
    if (this.provider.name === 'manual') return { method: 'bank_transfer', reference: inv.number, message: `Pay ${formatMoney(inv.totalMinor, inv.currency)} by bank transfer and quote ${inv.number}. Billing will mark it paid when it arrives.` };
    if (inv.checkoutUrl && inv.provider === this.provider.name) return { method: 'online', url: inv.checkoutUrl };
    const [t] = await this.db.app.select().from(tenants).where(eq(tenants.id, this.tenantId));
    const [owner] = await this.db.app.select({ email: users.email }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(and(eq(memberships.tenantId, this.tenantId), eq(memberships.isOwner, true)));
    const co = await this.provider.createCheckout({ invoiceId: inv.id, number: inv.number, amountMinor: inv.totalMinor, currency: inv.currency, customer: { name: t!.legalName ?? t!.name, ...(owner?.email ? { email: owner.email } : {}) }, returnUrl: returnUrl ?? `${this.cfg.WEB_ORIGIN}/admin/billing` });
    if (!co) throw conflict('no_online_payment', 'Online payment is not available.');
    await this.db.q.update(invoices).set({ provider: this.provider.name, providerRef: co.ref, checkoutUrl: co.url, updatedAt: sql`now()` }).where(eq(invoices.id, id));
    return { method: 'online', url: co.url };
  }

  /** A printable invoice. Browsers save it as PDF; a typeset PDF renderer is a later addition. */
  async html(id: string): Promise<string> {
    const inv = await this.invoice(id);
    const [t] = await this.db.app.select().from(tenants).where(eq(tenants.id, this.tenantId));
    const money = (n: number) => esc(formatMoney(n, inv.currency));
    const rows = inv.lines.map((l) => `<tr><td>${esc(l.description)}</td><td class="n">${l.quantity}</td><td class="n">${money(l.unitMinor)}</td><td class="n">${money(l.amountMinor)}</td></tr>`).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Invoice ${esc(inv.number)}</title><style>
body{font:14px/1.5 system-ui,sans-serif;color:#0f172a;max-width:760px;margin:32px auto;padding:0 16px}h1{font-size:22px;margin:0}table{width:100%;border-collapse:collapse;margin-top:24px}
th,td{padding:8px 6px;border-bottom:1px solid #e2e8f0;text-align:left}.n{text-align:right;font-variant-numeric:tabular-nums}.tot td{border:0;font-weight:600}.muted{color:#64748b}
.badge{display:inline-block;padding:2px 8px;border-radius:99px;background:#e2e8f0;font-size:12px}@media print{body{margin:0}}</style></head><body>
<header style="display:flex;justify-content:space-between;gap:16px"><div><h1>${esc(this.cfg.BILLING_SELLER_NAME)}</h1><p class="muted">${esc(this.cfg.BILLING_SELLER_ADDRESS ?? '')}${this.cfg.BILLING_SELLER_GSTIN ? `<br>GSTIN ${esc(this.cfg.BILLING_SELLER_GSTIN)}` : ''}</p></div>
<div style="text-align:right"><strong>Tax invoice ${esc(inv.number)}</strong><br><span class="badge">${esc(inv.status)}</span><br><span class="muted">Issued ${esc(inv.issuedAt.slice(0, 10))} · Due ${esc(inv.dueAt.slice(0, 10))}</span></div></header>
<p><strong>Billed to</strong><br>${esc(t?.legalName ?? t?.name)}<br><span class="muted">Service period ${esc(inv.periodStart)} to ${esc(inv.periodEnd)}</span></p>
<table><thead><tr><th>Description</th><th class="n">Seats</th><th class="n">Unit price</th><th class="n">Amount</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr class="tot"><td colspan="3" class="n">Subtotal</td><td class="n">${money(inv.subtotalMinor)}</td></tr>
<tr class="tot"><td colspan="3" class="n">Tax (${inv.taxRateBps / 100}%)</td><td class="n">${money(inv.taxMinor)}</td></tr>
<tr class="tot"><td colspan="3" class="n">Total</td><td class="n">${money(inv.totalMinor)}</td></tr></tfoot></table></body></html>`;
  }
}

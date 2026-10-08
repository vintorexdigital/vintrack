import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Config } from '../../core/config.js';

export interface CheckoutRequest {
  invoiceId: string;
  number: string;
  amountMinor: number;
  currency: string;
  customer: { name: string; email?: string };
  returnUrl: string;
}

export interface PaymentEvent {
  /** Provider's id for this event, used to ignore redeliveries. */
  eventId: string;
  type: 'paid';
  /** The reference stored on the invoice when the checkout was created. */
  providerRef: string;
  amountMinor: number;
  currency: string;
}

export interface PaymentProvider {
  readonly name: 'manual' | 'razorpay' | 'stripe';
  /** Null for offline methods (bank transfer): finance records the payment by hand. */
  createCheckout(req: CheckoutRequest): Promise<{ url: string; ref: string } | null>;
  /** Returns the verified event, or null when the signature does not match or the event is not one we act on. */
  parseWebhook(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): PaymentEvent | null;
}

type Fetch = typeof fetch;
const header = (h: Record<string, string | string[] | undefined>, k: string): string | undefined => {
  const v = h[k.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
};
function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

export class ManualProvider implements PaymentProvider {
  readonly name = 'manual' as const;
  async createCheckout(): Promise<null> { return null; }
  parseWebhook(): null { return null; }
}

/** Razorpay payment links. Amounts are already in paise. */
export class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay' as const;
  constructor(private readonly keyId: string, private readonly keySecret: string, private readonly webhookSecret: string, private readonly fetchFn: Fetch = fetch) {}

  async createCheckout(req: CheckoutRequest): Promise<{ url: string; ref: string }> {
    const res = await this.fetchFn('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64')}` },
      body: JSON.stringify({
        amount: req.amountMinor, currency: req.currency, reference_id: req.invoiceId, description: `Invoice ${req.number}`,
        customer: { name: req.customer.name, ...(req.customer.email ? { email: req.customer.email } : {}) }, callback_url: req.returnUrl, callback_method: 'get',
      }),
    });
    if (!res.ok) throw new Error(`Razorpay refused the payment link (${res.status}).`);
    const body = (await res.json()) as { id: string; short_url: string };
    return { url: body.short_url, ref: body.id };
  }

  parseWebhook(raw: Buffer, headers: Record<string, string | string[] | undefined>): PaymentEvent | null {
    const sig = header(headers, 'x-razorpay-signature');
    if (!sig || !safeEqualHex(createHmac('sha256', this.webhookSecret).update(raw).digest('hex'), sig)) return null;
    const body = JSON.parse(raw.toString('utf8')) as { event?: string; payload?: { payment_link?: { entity?: { id: string; amount_paid?: number; currency?: string } } } };
    if (body.event !== 'payment_link.paid') return null;
    const e = body.payload?.payment_link?.entity;
    const id = header(headers, 'x-razorpay-event-id');
    if (!e || !id) return null;
    return { eventId: id, type: 'paid', providerRef: e.id, amountMinor: e.amount_paid ?? 0, currency: (e.currency ?? 'INR').toUpperCase() };
  }
}

/** Stripe Checkout sessions, form-encoded as the API requires. */
export class StripeProvider implements PaymentProvider {
  readonly name = 'stripe' as const;
  constructor(private readonly secretKey: string, private readonly webhookSecret: string, private readonly fetchFn: Fetch = fetch) {}

  async createCheckout(req: CheckoutRequest): Promise<{ url: string; ref: string }> {
    const form = new URLSearchParams({
      mode: 'payment', success_url: req.returnUrl, cancel_url: req.returnUrl, client_reference_id: req.invoiceId,
      'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': req.currency.toLowerCase(),
      'line_items[0][price_data][unit_amount]': String(req.amountMinor), 'line_items[0][price_data][product_data][name]': `Invoice ${req.number}`,
    });
    if (req.customer.email) form.set('customer_email', req.customer.email);
    const res = await this.fetchFn('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Bearer ${this.secretKey}` }, body: form,
    });
    if (!res.ok) throw new Error(`Stripe refused the checkout session (${res.status}).`);
    const body = (await res.json()) as { id: string; url: string };
    return { url: body.url, ref: body.id };
  }

  /** Stripe-Signature: `t=<unix>,v1=<hex hmac of "<t>.<body>">`, rejected when older than five minutes. */
  parseWebhook(raw: Buffer, headers: Record<string, string | string[] | undefined>, now = Date.now()): PaymentEvent | null {
    const sig = header(headers, 'stripe-signature');
    if (!sig) return null;
    const parts = Object.fromEntries(sig.split(',').map((p) => p.split('=') as [string, string]));
    const t = Number(parts.t);
    if (!parts.v1 || !Number.isFinite(t) || Math.abs(now / 1000 - t) > 300) return null;
    if (!safeEqualHex(createHmac('sha256', this.webhookSecret).update(`${t}.${raw.toString('utf8')}`).digest('hex'), parts.v1)) return null;
    const body = JSON.parse(raw.toString('utf8')) as { id: string; type: string; data?: { object?: { id: string; amount_total?: number; currency?: string; payment_status?: string } } };
    const o = body.data?.object;
    if (body.type !== 'checkout.session.completed' || !o || o.payment_status !== 'paid') return null;
    return { eventId: body.id, type: 'paid', providerRef: o.id, amountMinor: o.amount_total ?? 0, currency: (o.currency ?? '').toUpperCase() };
  }
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export function providerFromConfig(cfg: Config, fetchFn: Fetch = fetch): PaymentProvider {
  if (cfg.BILLING_PROVIDER === 'razorpay') {
    if (!cfg.RAZORPAY_KEY_ID || !cfg.RAZORPAY_KEY_SECRET || !cfg.RAZORPAY_WEBHOOK_SECRET) throw new Error('RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET are required when BILLING_PROVIDER=razorpay.');
    return new RazorpayProvider(cfg.RAZORPAY_KEY_ID, cfg.RAZORPAY_KEY_SECRET, cfg.RAZORPAY_WEBHOOK_SECRET, fetchFn);
  }
  if (cfg.BILLING_PROVIDER === 'stripe') {
    if (!cfg.STRIPE_SECRET_KEY || !cfg.STRIPE_WEBHOOK_SECRET) throw new Error('STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are required when BILLING_PROVIDER=stripe.');
    return new StripeProvider(cfg.STRIPE_SECRET_KEY, cfg.STRIPE_WEBHOOK_SECRET, fetchFn);
  }
  return new ManualProvider();
}

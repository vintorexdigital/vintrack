# 0009. Billing: seats, monthly invoices, provider adapters

Status: accepted

## Decisions
- **Money is integer minor units** (paise, cents). `packages/rules/billing.ts` builds invoices, so the same function is testable and the API never does float arithmetic on currency.
- **What is bought is seats on a plan.** Plan contents (modules, copy) live in code (`PLAN_CATALOG` in `packages/schemas`), which is also what entitlements read, so a plan's modules and its marketing description cannot drift. Plan prices live in `platform.plans` so finance can change them without a release; invoices copy the price at issue time.
- **One invoice per company per calendar month, issued in advance.** Unique per `(tenant, period_start)` among non-void invoices, so the scheduler, a finance user and the subscribe flow can all ask for it and get the same row. Voiding frees the period for a reissue. India is billed 18% GST; other countries are untaxed until a tax engine exists.
- **Plan and seat changes apply immediately and are billed from the next invoice.** No proration yet; this is deliberate and shown to the customer in the response and UI.
- **Subscribing from a trial** sets the plan, issues the first invoice, and keeps the company in `trial` until that invoice is paid, at which point it becomes `active`.
- **Dunning**: an open invoice overdue 7 days moves a company to `past_due`; 30 days suspends it with reason `Unpaid invoice …`. Paying the last overdue invoice lifts either state, but only suspensions caused by non-payment are lifted automatically. Demo companies are exempt.
- **Row-level security on invoices.** Companies read only their own invoices and payments (the `trackrex_app` role has SELECT plus UPDATE on the checkout columns only). All invoice writes use the platform role. Company reads must go through the request's tenant transaction (`db.q`), not the plain pool, or RLS returns nothing.
- **Payment gateways behind one interface.** `BILLING_PROVIDER` selects `manual` (bank transfer recorded by finance), `razorpay` (payment links) or `stripe` (Checkout sessions). Webhooks at `POST /v1/webhooks/billing` are verified against the raw body (HMAC-SHA256 for Razorpay; timestamped `v1` signature with a five-minute window for Stripe) and are idempotent by provider event id.

## Not verified
The Razorpay and Stripe adapters are tested against locally signed payloads and a stubbed `fetch`, not against the live gateways. Before enabling either in production, run a test-mode payment end to end.

## Consequences
Finance can see MRR and arrears in the platform console, and a company can self-serve plan, seats and payment. A printable HTML invoice is provided; typeset PDFs, credit notes, proration and tax invoices numbered per GST rules are follow-ups.

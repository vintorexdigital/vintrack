# Day-to-day operations

## A company is not paying
`generate-invoices` issues the monthly invoice for every paying company (every 6 hours, idempotent). `run-dunning` marks a company past due 7 days after the due date and suspends it after 30. Paying the open invoice (record it in the platform console under the company) lifts a suspension that was only for non-payment. Demo companies are exempt. Run a job by hand: `POST /platform/v1/jobs/<name>/run`.

## Online payments
With `BILLING_PROVIDER=razorpay` or `stripe`, point the gateway's webhook at `https://api.<domain>/v1/webhooks/billing` and set the webhook secret. Test in the gateway's test mode before going live: the adapters are verified against signed sample payloads, not against the live gateways. Redelivered events are ignored by event id.

## A company asks for help
The company must first switch on support access (Admin, Security, Support access). Staff then start a session from the company page with a reason and a duration. The session cannot read business data (attendance, locations, productivity, reports, feed, exports) and every action is audited. End it from the same page.

## Suspending or closing a company
Platform console, company page, Lifecycle. Suspended companies cannot sign in; deletion starts a 30-day window in which it can be undeleted; after that the purge job removes it.

## Data requests
A company administrator can download all company data (Admin, Company profile, Your data). Individual employee requests (access, correction, erasure) are not automated: use the employee record (edit, exit) and the audit log, and raise erasure with the platform team. There is no per-employee export or anonymisation tool yet.

## Incident basics
- Everything company-owned is behind row-level security; the platform role can read only the `platform` schema. A suspected cross-company leak is the highest-severity class: stop the API, keep the logs, run `apps/api` isolation tests against a copy of the database.
- Rotate `JWT_*` secrets to invalidate all access tokens (refresh tokens remain valid and mint new ones; revoke them in the database to end sessions).
- Logs carry a request id that is also returned in error bodies and the `x-request-id` header.

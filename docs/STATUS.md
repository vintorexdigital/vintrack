# Trackrex build status

Last updated with each commit. This file is the honest ledger of what exists, what is verified, and what is not done.
Phases follow Section 17 of `docs/MASTER_PROMPT.md`.

## Summary

| Phase | Scope | State |
|---|---|---|
| 0 Foundations | Monorepo, tokens, UI kit, app shell, CRUD kit, auth, tenancy with RLS, roles and scopes, settings registry, audit, sequences, soft delete, SDK, OpenAPI, seed, account hierarchy, platform realm | **Built and tested** except the items under "Not done in Phase 0" |
| 1 People, shifts, attendance | Org objects, employees (import, invite, exit, restore), shifts with every restriction, punches (web and API), daily log, monthly register, regularizations, holidays, weekly offs, auto punch-out, feed v1 | **Built and tested** on web and API. Mobile punch UI not built |
| 2 Leave and policies | Sessions, profiles, types with tiered entitlements and restrictions, accruals, requests and approvals, calendar, balances, policy engine with immutable versions, re-run with preview, payroll export | **Built and tested** |
| 3 Field operations | Customers, contacts, tasks with geo-checked check-in and completion, location ingest gated to working time, live map, day trails, retention job; platform console (companies, lifecycle, support hand-off, resellers, audit) | **API and web built and tested.** Not built: custom forms on tasks, visit photos/uploads, geofence alerts, mobile app UI, route planning |
| 4 to 12 | Money and automation, desktop productivity, calls, insights, commercial, hardening, sales CRM, HR suite, service suite | Not started. See the tracker below |

## How it is verified

- `packages/rules`: 62 tests, 96% branch coverage (target 95%).
- `packages/schemas`, `tokens`, `sdk`: unit tests; token contrast is asserted against WCAG.
- `apps/api`: 175 integration and unit tests against a real PostgreSQL 16, migrated from scratch on every run. They include the tenant-isolation suite (every CRUD resource, plus direct database attacks), RBAC and data-scope tests, the punch-restriction matrix, policy and leave scenarios, jobs, OpenAPI contract and migration drift checks.
- `apps/web`, `apps/platform`: `next build` plus Playwright: sign-in smoke tests, the support hand-off, field screens (live map, trail, customers, tasks), platform sign-in with TOTP, and the 19-viewport device matrix asserting no page-level horizontal scroll on nine key screens.

Run everything: `pnpm install && pnpm test` (needs PostgreSQL on port 54329; see `apps/api/test/global-setup.ts`).

## Not done in Phase 0 to 2 (known gaps)

- Envelope encryption for home location and selfie metadata (stored as plain columns for now).
- Object storage and signed upload URLs (selfie keys are accepted as strings; there is no upload endpoint yet).
- Google and Microsoft sign-in are implemented and unit-tested against locally issued tokens, but no live provider was exercised. SAML and OIDC for enterprise tenants are not built. TOTP is enforced for platform staff only; company admins' 2FA setting exists but is not enforced.
- Retention enforcement per data class beyond the 30-day recycle-bin purge.
- Exports are synchronous (up to 10,000 rows) rather than background jobs with notification.
- Reports and the analytics builder (Phase 7), notifications, workflows, WhatsApp and SMS adapters (Phase 4).
- Anek tabular figures are not yet verified in a browser (see ADR 0001 follow-ups).
- Accessibility: keyboard paths exist for the shell, tables and the register, but there is no automated axe run yet.

## Later phases

See the "Phase tracker" section appended below as modules land.

## Phase tracker

| Item | State |
|---|---|
| Platform console (`apps/platform`) | Companies list/detail, provisioning, lifecycle actions, plan/seat/flag edits, support sessions (start/end, fragment hand-off to the web console), resellers and groups (read-only), audit. Creating/editing resellers and groups is not built |
| Field: customers, contacts, tasks | Built. Tasks have no custom form builder yet; no attachments |
| Field: location | Ingest, live map, trails, retention built. No geofence enter/exit events, no per-read audit of trail views |
| Billing: plans, seats, invoices, payments, dunning | Built and tested (ADR 0009): monthly invoices with GST, subscribe/change flows, bank-transfer recording, dunning, public pricing endpoint, Razorpay and Stripe adapters with signed webhooks, company billing page, platform billing page. **Gateways untested live.** No proration, credit notes or typeset PDF invoices |
| Marketing site (`apps/site`) | Static export: home, five module pages, pricing with seat calculator (live prices from the API, list-price fallback), security and privacy, help center with search (10 articles), API reference from OpenAPI, demo request by email, sitemap, robots, structured data. 16 Playwright checks including 11 viewports. **Not built:** blog, customer stories, changelog, status page, videos, translations, a booking form with a backend |
| Mobile (Expo), desktop agent (Electron), browser extension | Not built. API contracts they need for punch, tasks and location exist and are tested |
| Reports, notifications, workflows, expenses, calls, desktop productivity | Not built |

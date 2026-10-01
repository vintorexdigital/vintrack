# Trackrex build status

Updated with every commit. This is the honest ledger of what exists, what is verified, and what is not done.
Phases follow Section 17 of `docs/MASTER_PROMPT.md`. If this file and the code disagree, the code is right and this file is a bug.

## Summary by phase

| Phase | Scope | State |
|---|---|---|
| 0 Foundations | Monorepo, tokens, UI kit, app shell, CRUD kit, auth, tenancy with RLS, roles and scopes, settings registry, audit, sequences, soft delete, SDK, OpenAPI, seed, account hierarchy, platform realm | **Built and tested.** Gaps listed below |
| 1 People, shifts, attendance | Org objects, employees, shifts with every restriction, punches, daily log, register, regularizations, holidays, weekly offs, auto punch-out, feed | **Built and tested** (API, web, mobile punch) |
| 2 Leave and policies | Profiles, types, accruals, requests, approvals, calendar, balances, versioned policies, re-run with preview, payroll export | **Built and tested** |
| 3 Field operations | Customers, contacts, tasks with geo-checked check-in, location ingest, live map, trails | **Built and tested** (API, web, mobile). No custom forms, visit photos, geofence alerts |
| 4 Money and automation | Expenses, notifications | **Partly built.** Expenses, in-app and email notifications done. **Not built:** workflow engine, push/SMS/WhatsApp delivery, multi-level approvals |
| 5 Desktop productivity | Agent, extension, classification, productivity views | **Built and tested** except what needs a real desktop (see agent row). No screenshots |
| 6 Calls | Call log and cloud calling | **Manual call log built** (employees log their own calls, linked to customers and leads; scoped; web). **No telephony, recording, auto-capture from the phone, or cloud calling** |
| 7 Insights | Reports | **Partly built.** Nine fixed reports with export. **Not built:** report builder, dashboards, saved/scheduled reports, charts |
| 8 Commercial | Plans, seats, invoices, payments, dunning, operator console, marketing site, signup | **Built and tested**, gateways untested live. No reseller/white-label management, no proration |
| 9 Hardening | Axe, device matrix, restore drill, runbooks, privacy export | **Partly done.** No security review, load testing, translations audit, store submissions |
| 10 to 12 | Sales CRM, HR suite (payroll, onboarding), service suite (help desk, assets) | **Leads built** (stages, follow-up date, lost reason, conversion to customer and contact, funnel report, scoped, web). **Not built:** lead import and web forms, pipelines per team, opportunities, HR suite, service suite |

## What was verified, and how

Run everything: `pnpm install && pnpm typecheck && pnpm test && pnpm build` (tests need PostgreSQL on port 54329, see `apps/api/test/global-setup.ts`). Browser checks need running dev servers; see `README.md`.

| Area | Verification |
|---|---|
| `packages/rules` | 67 unit tests, including attendance edge cases, accruals, policies, geo, billing |
| `packages/schemas`, `tokens`, `sdk`, `client-core` | 9, 13, 4 and 26 unit tests. Token contrast asserted against WCAG |
| `apps/api` | 220 integration and unit tests against PostgreSQL 16 migrated from scratch each run: tenant isolation for every CRUD resource and direct database attacks, RBAC and scopes, punch rules, policies, leave, jobs, billing and webhooks, files, privacy export, migrations up/down and drift, OpenAPI contract |
| `apps/web` | `next build`; Playwright: sign-in and shell, support hand-off, field, expenses, reports, productivity, billing, typography (tabular figures), axe on 17 pages in light/dark/high-contrast, and the 19-viewport matrix on 9 screens |
| `apps/platform` | `next build`; Playwright: TOTP sign-in, companies, billing, axe on 6 pages |
| `apps/site` | Static export; Playwright: pricing maths, search, sitemap, axe on 8 pages, 11 viewports |
| `apps/mobile` | Core tested in `client-core`; Playwright against the web export and a real API, including an offline selfie punch. **Never run on a device or emulator** |
| `apps/desktop` | 7 unit tests; 2 checks launching the real Electron app on a virtual display against the API |
| `apps/extension` | 4 unit tests; 1 check loading the unpacked extension in Chromium and seeing the site in the productivity day |
| Infra | `infra/scripts/restore-drill.sh` passes against the development database. The API production bundle builds and starts. **The Docker images and Compose file have not been built or run** (no Docker daemon in the build environment) |

Bugs found only by running things for real (fixed, with regression tests): `fetch` called as a method in the mobile client ("Illegal invocation" in browsers), Anek having no tabular figures, a refresh-token rotation race in the extension service worker, and layout overflow of the top bar at 320 px.

## Known gaps (cross-cutting)

- **Security and privacy.** No envelope encryption of home location, selfie metadata or location history (database access controls only). No independent security assessment. TOTP is enforced for platform staff only. SAML and enterprise OIDC are not built. Google and Microsoft sign-in are verified against locally issued tokens only. No per-read audit of who viewed a location trail. Employee-level data requests (export, erasure) are not automated; only the company-wide export exists.
- **Storage.** Files are on local disk (selfies only) behind a provider interface. There is no S3 adapter, so the API must not be spread across hosts, and there are no receipts or other attachments.
- **Delivery channels.** In-app notifications and email (SMTP adapter, per-person opt-out; verified against a local SMTP server, not a provider). No SMS, WhatsApp, push or digests.
- **Exports** are synchronous (up to 10,000 rows per CRUD export, 50,000 per table in the company export).
- **Retention** is enforced for recycle bins (30 days) and location history (company setting). Not for audit, activity or other data classes.
- **Accessibility.** Automated axe checks only. No manual screen-reader or keyboard audit. Chart-like views (day ribbon, productivity bars) have text alternatives but have not been tested with assistive technology.
- **Internationalisation.** English, Tamil and Hindi catalogs exist for the console shell only; the apps, site and most screens are English.
- **Gateways.** Razorpay and Stripe adapters are tested with signed sample payloads and a stubbed `fetch`, never against the live services.
- **Mobile, desktop, extension.** No store packaging, signing, installers or auto-update. Mobile has no background location. Desktop and extension store tokens with the platform's mechanisms but have had no security review.

## Item by item

| Item | State |
|---|---|
| Platform console | Companies (list, detail, provisioning, lifecycle, plan/seat/flag edits), support sessions with fragment hand-off, billing overview and plan prices, resellers and groups (create, suspend/reactivate, assign to a company), audit. Reseller branding, margins in billing, and white-label domains are not built |
| Field | Customers, contacts, tasks (start/complete, distance check, cancel), live map, trails with stops, retention job. No route planning, no custom forms, no geofence enter/exit events |
| Billing | Monthly GST invoices, subscribe/change flows, bank-transfer recording, dunning, public pricing endpoint, company and platform pages, printable invoice HTML. No proration, credit notes, typeset PDF, or tax engine beyond India 18% / none |
| Marketing site | Home, five module pages, pricing calculator, security, help centre (10 articles) with search, API reference, demo by email, sitemap, robots, structured data. No blog, stories, changelog, status page, videos, booking backend |
| Mobile | Sign-in with company choice, Today and punch (location, selfie), offline queue with idempotent replay and a needs-attention list, foreground tracking, tasks (offline-capable), leave balances and apply, sync status. No background location, push, biometrics, breaks, regularization, expenses, feed |
| Desktop agent | Tray app, transparency window, keychain-encrypted refresh token, privacy filter on the machine, minute buckets, shared offline queue. No installers, no screenshots, real window capture not verified (no window manager in tests) |
| Extension | Samples the focused site once a minute while punched in; popup with sign-in and transparency. No store packaging, Firefox/Safari |
| Productivity | Server-side ingest gated to working time with title/URL privacy, classification list with defaults, summary and day views, report, web pages |
| Reports | Attendance summary, late arrivals, leave taken, task performance, field travel, headcount, expense summary, desktop activity; Excel and CSV |
| Notifications | In-app inbox from domain events to the right person once each, plus email over SMTP with a per-person opt-out. No SMS, WhatsApp or push, no per-type preferences |
| Expenses | Categories with limits, claims with partial approval, rejection reason, cancel, pay with reference, bulk approve, report. No receipts, mileage, multi-level approval |
| Privacy | Company-wide data export (Excel, audited). Support sessions cannot read business data. No per-employee tooling |
| Operations | Runbooks for deploy, backup/restore and day-to-day operations; restore drill script; `create-staff` entry for the first operator; on-demand TLS gate for custom domains |

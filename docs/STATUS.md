# Trackrex build status

Updated with every commit. This is the honest ledger of what exists, what is verified, and what is not done.
Phases follow Section 17 of `docs/MASTER_PROMPT.md`. If this file and the code disagree, the code is right and this file is a bug.

**Mock means mock.** Several features sit behind a provider that, in this build, delivers nothing real: SMS, WhatsApp and push messages, cloud calls and their recordings, and the key service that wraps encryption keys. Each is marked **MOCK** below, says so in the console wherever it is used, and has a real adapter or a documented seam for the real thing. "Built" for a mock feature means the product flow, data model, permissions, privacy rules and tests exist; it does not mean a message was sent or a call was placed.

## Summary by phase

| Phase | Scope | State |
|---|---|---|
| 0 Foundations | Monorepo, tokens, UI kit, app shell, CRUD kit, auth, tenancy with RLS, roles and scopes, settings registry, audit, sequences, soft delete, SDK, OpenAPI, seed, account hierarchy, platform realm | **Built and tested** |
| 1 People, shifts, attendance | Org objects, employees, shifts, punches, daily log, register, regularizations, holidays, auto punch-out, feed | **Built and tested** (API, web, mobile punch) |
| 2 Leave and policies | Profiles, types, accruals, requests, approvals, calendar, balances, versioned policies, re-run with preview | **Built and tested** |
| 3 Field operations | Customers, contacts, tasks with geo-checked check-in, location ingest, live map, trails, **custom task forms with photo answers** | **Built and tested** (API, web, mobile). No geofence alerts, route planning |
| 4 Money and automation | Expenses, notifications, **workflow engine, multi-level approvals, SMS/WhatsApp/push delivery** | **Built and tested.** SMS, WhatsApp and push are **MOCK** by default (Twilio and Expo adapters exist, unverified live) |
| 5 Desktop productivity | Agent, extension, classification, productivity views | **Built and tested** except what needs a real desktop. No screenshots |
| 6 Calls | Call log, **cloud calling with recordings** | **Built and tested.** Telephony is **MOCK** by default (Exotel adapter exists, unverified live). No incoming calls, no auto-capture from the phone |
| 7 Insights | Standard reports, **report builder, saved reports, dashboards with charts, scheduled reports** | **Built and tested** |
| 8 Commercial | Plans, seats, invoices, payments, dunning, operator console, site, signup | **Built and tested**, gateways untested live. No proration. **Plan modules are now enforced at the API** |
| 9 Hardening | Axe, device matrix, restore drill, runbooks, privacy export, **envelope encryption, S3 storage** | **Partly done.** No security review, load testing, translations audit, store submissions |
| 10 to 12 | Sales CRM, **HR suite (payroll, onboarding), service suite (help desk, assets)** | **Built and tested.** Payroll statutory maths is simplified (see ADR 0019). No lead import, pipelines per team, opportunities |

## What was verified, and how

Last full run: 323 API tests, 100 rules, 14 schemas, 26 client-core, 13 tokens, 7 desktop, 4 extension, 4 sdk (all passing); `pnpm typecheck` and `pnpm build` green; the mobile web export passes its 4 browser tests; axe passes on 34 console pages. Mobile browser tests need the API started with `CORS_EXTRA_ORIGINS=http://localhost:8081`.

Run everything: `pnpm install && pnpm typecheck && pnpm test && pnpm build` (tests need PostgreSQL on port 54329, see `apps/api/test/global-setup.ts`). Browser checks need running dev servers; see `README.md`.

| Area | Verification |
|---|---|
| `packages/rules` | Unit tests for attendance edge cases, accruals, policies, geo, billing, workflow conditions and webhook-host safety, form validation, report schedules, payroll maths |
| `packages/schemas`, `tokens`, `sdk`, `client-core` | Unit tests; token contrast asserted against WCAG |
| `apps/api` | Integration and unit tests against PostgreSQL 16 migrated from scratch each run: tenant isolation for every CRUD resource and direct database attacks, RBAC and scopes, punch rules, policies, leave, jobs, billing and webhooks, files and S3, envelope encryption, delivery channels, workflows and approvals, forms, calling, report builder, licensing, payroll, onboarding, help desk, privacy export, migrations up/down and drift, OpenAPI contract |
| `apps/web` | `next build`; Playwright against a running API and seeded database: sign-in and shell, field, expenses, reports, builder and dashboards, automation, forms, calling, HR and help desk, productivity, billing, typography, axe on the console pages in light/dark/high-contrast, and the 19-viewport matrix |
| `apps/platform`, `apps/site` | `next build`; Playwright (see earlier ledger) |
| `apps/mobile` | Core tested in `client-core`; Playwright against the web export and a real API, including an offline selfie punch. **Never run on a device or emulator**, so push registration, the camera for form photos and offline form answers are untested on hardware |
| `apps/desktop`, `apps/extension` | Unit tests and launching the real apps (Electron on a virtual display; Chromium with the extension) |
| Dependencies | `pnpm audit --prod --audit-level high` clean; the mobile project has moderate advisories in Expo build tooling |
| Infra | `infra/scripts/restore-drill.sh` passes. **The Docker images and Compose file have not been built or run** (no Docker daemon in the build environment) |

## Known gaps (cross-cutting)

- **Security and privacy.** Location history, live position, home location, selfies, form photos and call recordings are sealed per company (ADR 0013). **The key service is `LocalKms`, a software stand-in: master keys live in the API's environment, which is not an HSM or a cloud KMS** (the interface is the seam for one). Punch coordinates, customer addresses and task check-in positions are not sealed (reports and search need them). No independent security assessment. TOTP is enforced for platform staff only. SAML and enterprise OIDC are not built. No per-read audit of who viewed a location trail (recording playback is audited). Employee-level data requests are not automated; only the company-wide export exists.
- **Storage.** `STORAGE_DRIVER=s3` runs the API on many hosts (ADR 0012). The S3 adapter is tested against a signature-checking in-process double, **not against AWS S3, MinIO or R2**. No pre-signed URLs or multipart upload; no lifecycle rules. Files are selfies, form photos and recordings; there are still no expense receipts.
- **Delivery channels.** In-app and email (SMTP, verified against a local SMTP server) are real. **SMS, WhatsApp and push are MOCK** unless `SMS_PROVIDER`, `WHATSAPP_PROVIDER` and `PUSH_PROVIDER` are set; the Twilio and Expo adapters are tested against stubbed `fetch` only. No delivery receipts, DLT/WhatsApp template registration, quiet hours, per-event preferences or digests. The mobile app registers its push token but this was never run on a device.
- **Workflows** run from the outbox once a minute at best; no branching, loops, chaining, retries, or schedule triggers (ADR 0016). Webhooks block private addresses but resolve the name twice (DNS rebinding window); run the worker with egress rules too.
- **Calls.** Mock mode places no call and records synthetic audio. No incoming calls, transcription, or per-customer consent capture (ADR 0017).
- **Payroll** is a simplified statutory model: no tax deducted at source, filings, arrears, bonuses or reimbursements (ADR 0019). Salary data is not sealed.
- **Exports** are synchronous (up to 10,000 rows per CRUD export, 50,000 per table in the company export).
- **Retention** is enforced for recycle bins (30 days), location history (company setting), call recordings (company setting), message log (90 days) and report snapshots (90 days). Not for audit, activity or other data classes.
- **Accessibility.** Automated axe checks only. No manual screen-reader or keyboard audit. Charts print every value and offer a table, but have not been tested with assistive technology.
- **Internationalisation.** English, Tamil and Hindi catalogs exist for the console shell only.
- **Gateways.** Razorpay and Stripe adapters are tested with signed sample payloads and a stubbed `fetch`, never against the live services.
- **Mobile, desktop, extension.** No store packaging, signing, installers or auto-update. Mobile has no background location, no calling screen, no help desk or payslips.

## Item by item

| Item | State |
|---|---|
| Platform console | Companies, support sessions, billing overview and plan prices, resellers and groups, audit. Reseller branding, margins in billing and white-label domains are not built |
| Field | Customers, contacts, tasks (start/complete, distance check, cancel), live map, trails with stops, retention job, **task forms** (builder, conditional questions, photo answers, required-to-complete, offline on mobile) |
| Workflows and approvals | Triggers on 23 events, conditions, steps (notify, create task, wait, call a web address, ask for approval, start a checklist); runs with logs; approvals inbox; **1 to 3 approval levels up the reporting line** for leave, regularizations and expenses, with an extra level above an expense amount, override recorded, trail on each request |
| Delivery channels | Email, in-app, **SMS / WhatsApp / push (MOCK or Twilio / Expo)**, opt-ins per person, device registration, message log with the provider named on every row |
| Reports | Nine standard reports (Excel, CSV); **builder over six data sources with scope enforced on every query**, saved and shared reports, dashboards (bars, line, donut, big number, table), scheduled snapshots to the owner |
| Calls | Manual call log; **click-to-call (MOCK or Exotel)**, recording on request with retention and audited playback |
| Billing | Monthly GST invoices, subscribe/change, bank transfer, dunning, public pricing, printable invoice. No proration, credit notes, tax engine beyond India 18% / none |
| Marketing site | Home, module pages, pricing calculator, security, help centre, API reference, demo by email, sitemap. No blog, status page, videos |
| Mobile | Sign-in, Today and punch (location, selfie), offline queue with idempotent replay, foreground tracking, tasks and **task forms** (offline-capable), leave. No background location, biometrics, breaks, regularization, expenses, feed, help desk, payslips, calls |
| Desktop agent / Extension | See earlier ledger; unchanged |
| Productivity | Server-side ingest gated to working time with title/URL privacy, classification, summary and day views, report |
| Notifications | In-app inbox from domain events once each; channels per person; approvals, tickets, payslips, reports and SLA breaches included |
| Expenses | Categories with limits, claims with partial approval, rejection reason, cancel, pay, bulk approve, report, **multi-level approval**. No receipts, mileage |
| HR suite | **Salary structures, payroll runs (draft, finalize and lock attendance, pay), payslips (own only, printable), export; onboarding and exit checklists from templates, workflow-started** |
| Service suite | **Help-desk tickets** (deadlines by priority, internal notes, assignment, resolve, reopen, rate, auto-close, SLA breach events) and **assets** (assign, take back with condition, repair, history, "my assets") |
| Privacy | Company-wide export (opens sealed values for the owner company). Support sessions cannot read business data |
| Operations | Runbooks for deploy, backup/restore (including master-key custody) and operations; restore drill script; `create-staff`; on-demand TLS gate for custom domains |

# Trackrex build status

Last updated with each commit. This file is the honest ledger of what exists, what is verified, and what is not done.
Phases follow Section 17 of `docs/MASTER_PROMPT.md`.

## Summary

| Phase | Scope | State |
|---|---|---|
| 0 Foundations | Monorepo, tokens, UI kit, app shell, CRUD kit, auth, tenancy with RLS, roles and scopes, settings registry, audit, sequences, soft delete, SDK, OpenAPI, seed, account hierarchy, platform realm | **Built and tested** except the items under "Not done in Phase 0" |
| 1 People, shifts, attendance | Org objects, employees (import, invite, exit, restore), shifts with every restriction, punches (web and API), daily log, monthly register, regularizations, holidays, weekly offs, auto punch-out, feed v1 | **Built and tested** on web and API. Mobile punch UI not built |
| 2 Leave and policies | Sessions, profiles, types with tiered entitlements and restrictions, accruals, requests and approvals, calendar, balances, policy engine with immutable versions, re-run with preview, payroll export | **Built and tested** |
| 3 to 12 | Field operations, money and automation, desktop productivity, calls, insights, commercial, hardening, sales CRM, HR suite, service suite | See the table below |

## How it is verified

- `packages/rules`: 59 tests, 96% branch coverage (target 95%).
- `packages/schemas`, `tokens`, `sdk`: unit tests; token contrast is asserted against WCAG.
- `apps/api`: integration tests against a real PostgreSQL 16, migrated from scratch on every run. They include the tenant-isolation suite (every CRUD resource, plus direct database attacks), RBAC and data-scope tests, the punch-restriction matrix, policy and leave scenarios, jobs, OpenAPI contract and migration drift checks.
- `apps/web`: `next build` plus Playwright: a sign-in smoke test and the 19-viewport device matrix asserting no page-level horizontal scroll on seven key screens.

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

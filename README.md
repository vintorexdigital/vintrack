# Trackrex

Multi-tenant workforce operations: attendance, leave, field tracking, tasks and forms, expenses, workflows and approvals, calling, desktop productivity, reports and dashboards, payroll, help desk and billing, for office and field teams. Operated by Vintorex. The product specification is `docs/MASTER_PROMPT.md`; what is actually built, and what is not, is `docs/STATUS.md` (including which providers are **mock**: SMS, WhatsApp, push, calling and the key service deliver nothing real until configured). Decisions are in `docs/adr/`.

| Path | What |
|---|---|
| `apps/api` | NestJS API and worker, PostgreSQL with row-level security, OpenAPI at `docs/openapi.json` |
| `apps/web` | Company console (Next.js): manager and employee modes |
| `apps/platform` | Operator console for Vintorex staff |
| `apps/site` | Marketing site, pricing, help centre (static export) |
| `apps/mobile` | Expo app for employees on the move (own npm project) |
| `apps/desktop` | Electron activity agent |
| `apps/extension` | Browser extension for website activity |
| `packages/rules` | Pure business rules: attendance, leave, policies, geo, billing |
| `packages/schemas` | One definition per entity, validation, permissions, settings |
| `packages/ui`, `tokens`, `sdk`, `client-core` | Components, design tokens, API client, offline-safe client logic |
| `infra` | Docker Compose, Caddy, restore drill |

## Run it locally
```
pnpm install
# PostgreSQL 16 on port 54329 (see apps/api/test/global-setup.ts), Redis optional for the worker
pnpm --filter @trackrex/api db:migrate && pnpm --filter @trackrex/api db:seed
AUTH_DEV_OTP_ECHO=true PORT=4000 pnpm --filter @trackrex/api dev   # API
pnpm --filter @trackrex/web dev        # http://localhost:3000, sign in as owner@meridian.test (company meridian-demo), password Trackrex#2026
pnpm --filter @trackrex/platform dev   # http://localhost:3001, admin@vintorex.test, 2FA secret JBSWY3DPEHPK3PXP
```

## Test it
`pnpm typecheck`, then `pnpm test` (unit and API integration, needs PostgreSQL). Browser checks: `pnpm --filter @trackrex/web exec playwright test` (and the same in `platform`, `site`, `mobile`; `desktop` and `extension` use `xvfb-run -a`) against running dev servers.

Operations: `docs/runbooks/`.

## Mock providers and real ones
SMS, WhatsApp, push and cloud calling run against **mock providers** unless configured (`SMS_PROVIDER`, `WHATSAPP_PROVIDER`, `PUSH_PROVIDER`, `TELEPHONY_PROVIDER` in `.env.example`). Mock providers deliver nothing: messages are recorded in Admin, Security, Message log, and a mock call is moved along with the "Simulate" buttons on the customer's Calls tab. Files go to local disk unless `STORAGE_DRIVER=s3`. Location data and selfies are sealed with per-company keys wrapped by `KMS_MASTER_KEYS`, whose development default is public: set your own (`openssl rand -base64 32`).

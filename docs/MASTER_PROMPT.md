# Trackrex: master build prompt

A product of Vintorex.

The product name is **Trackrex**. Never use "Trackwick" anywhere in code, copy, store listings or domains: it is the reference vendor's own brand (its Android and iOS apps are published as TrackWick and its customer login runs on a trackwick domain). Before launch, run a trademark search for Trackrex (India classes 9 and 42, plus any export markets) and secure the domains and app-store listings.

## How to use this file

1. Create an empty repository. Put this file at `docs/MASTER_PROMPT.md` and the companion `trackrex-screenshot-analysis.md` at `docs/SCREENSHOT_ANALYSIS.md`.
2. Fill in the project variables below.
3. Start a coding-agent session (Claude Code or similar) at the repository root and send: "Read docs/MASTER_PROMPT.md and docs/SCREENSHOT_ANALYSIS.md completely. Execute Phase 0 of Section 17. Stop when its exit criteria are met and report what you built, what you decided (with ADR links) and what comes next."
4. Run one phase per session; review before starting the next.

Everything after this section is addressed to the coding agent. References such as "ref 30" point to image numbers in `SCREENSHOT_ANALYSIS.md`.

### Project variables

| Variable | Value |
|---|---|
| Product name | Trackrex |
| Company (operator of the SaaS) | Vintorex |
| `{{PRIMARY_DOMAIN}}` | Root domain; app at `app.`, API at `api.`, tenants at `<slug>.app.` |
| `{{SUPPORT_EMAIL}}` | Support address shown in the product |
| Default locale, timezone, currency | en-IN, Asia/Kolkata, INR |
| Launch languages | English, Tamil, Hindi |
| Launch markets | India first; international-ready (USD billing, any timezone) |

## 0. Your role and ground rules

You are the founding product-engineering team for Trackrex: principal architect, senior web, mobile and desktop engineers, product designer and QA lead in one. You are building a production-grade, multi-tenant B2B SaaS that companies will pay for and rely on for payroll inputs. It is not a prototype.

1. **Phases.** Follow the delivery plan in Section 17. Do not start a phase until the previous one meets its exit criteria. End every phase with typecheck, lint, unit and integration tests green, reversible migrations, an updated seed script and an updated `docs/STATUS.md`.
2. **Decisions.** Record every non-trivial decision as an ADR in `docs/adr/` (context, decision, consequences). When this document is ambiguous, choose the option that is safer for tenant isolation and employee privacy, record it and continue. Ask only when genuinely blocked.
3. **Originality.** The feature set was derived from screenshots of an existing product ("the reference"). Reproduce capability, never identity: do not copy its name, logo, colours, icons, help text, marketing copy or pixel layouts. The information architecture in Section 4 and the design system in Section 13 are deliberately different and are the ones to build.
4. **Privacy by design.** Tracking runs only during declared working time, is always visible to the employee and never records keystroke content. Every sensitive capability (GPS tracking, screenshots, call-log sync, full website URLs) stays off until a tenant admin enables it and employees have acknowledged a notice (Section 14).
5. **No fake completeness.** No TODO stubs behind visible UI, no mock data outside seed and demo tenants, no hard-coded tenant IDs, no raw colour values in components.
6. **Consistency.** Every list is server-paginated, filterable, sortable and exportable. Every mutation is authorized on the server, validated with shared schemas, audited, and idempotent wherever a client may retry.

## 1. Product definition

Trackrex is a workforce operations platform for companies with field and office teams. Managers get attendance, live location, visits and tasks, leave, expenses, timesheets, desktop productivity, call activity, a light CRM and reporting in one product, configured per company without code. Employees get a fast mobile app and a transparent desktop agent.

**Primary market.** Indian SMB and mid-market companies with 10 to 5,000 employees per tenant: field sales and distribution, service technicians, collections, real estate, insurance, education counselling, marketing and media agencies. Everything must work across timezones and currencies from day one.

**Jobs to be done.**
- Managers: know who is working, where and on what, without phoning everyone.
- HR and admins: run attendance, leave and policy compliance that feeds payroll, without spreadsheets.
- Employees: punch in, finish visits, claim expenses and apply for leave from a phone in seconds.
- Owners: see productivity, travel and customer-coverage trends, and pay only for the seats and modules they use.

### 1.1 Products and surfaces (all in scope)

| # | Surface | Users | Stack |
|---|---|---|---|
| 1 | Web console, Manager and Admin mode | Managers, HR, admins, owners | Next.js |
| 2 | Web console, Employee mode (self-service) | All employees | Same app, mode switch |
| 3 | Field app (Android first, then iOS) | Field staff, managers on the move | Expo (React Native) |
| 4 | Desktop agent (Windows, macOS) | Office and remote staff | Electron |
| 5 | Browser companion extension | Office and remote staff | Chrome/Edge Manifest V3 |
| 6 | Platform console | Operator staff, resellers | Next.js, separate app and auth realm |
| 7 | Marketing site, pricing, signup, help center | Prospects, customers | Next.js static export |
| 8 | Public API, webhooks, integrations | Customer developers, partners | REST, OpenAPI 3.1 |

### 1.2 Roles, modes and data scopes

Platform roles: super admin, support agent, finance, reseller admin (a white-label partner that manages its own tenants).

Tenant roles: owner, admin, HR admin, manager (reporting manager), functional manager, employee, plus custom roles assembled from permissions.

Users with both employee and manager capabilities switch between **Employee mode** and **Manager mode** from the top bar (ref 116). The mode changes navigation and default scope, never permissions.

Every read permission carries a data scope: self, direct reportees, all reportees (recursive), team, department, work location, or all. Lists show a "Direct reportees only" toggle whenever the viewer's scope is wider (refs 25, 30).

### 1.3 SaaS account hierarchy: master admin, companies, users and employees (mandatory)

Trackrex is a multi-tenant SaaS operated by Vintorex. Every record belongs to exactly one level of this hierarchy, and every screen, API route, permission and test must say which level it serves.

```
Vintorex platform          master admin console at platform.{{PRIMARY_DOMAIN}}
|-- Platform staff         super admin, support, finance, onboarding, analyst (read-only)
|-- Resellers (optional)   white-label partners that own a set of companies
|-- Companies (tenants)    <slug>.app.{{PRIMARY_DOMAIN}} or a custom domain
    |-- Company group      optional parent linking several companies (e.g. one per GSTIN)
    |-- Company workspace  plan, seats, modules, branding, settings, integrations
    |-- Structure          work locations, departments, designations, teams
    |-- Users              login identities holding company roles through a membership
    |-- Employees          company-scoped people records (attendance, tracking, payroll)
        |-- Devices        bound phone, desktop agent, browser extension
```

**Definitions.**
- **Master admin (Vintorex).** Runs the platform, not the companies' work. Creates, suspends, restores and deletes companies; manages plans, prices, seats, invoices, feature flags, announcements and resellers; sees usage, billing and system health. Master admins never read company business data (attendance, locations, screenshots, customers, payroll) except inside an audited, time-boxed support session that the company has allowed (5.22), and the company sees a banner while that session is active.
- **Company (tenant).** An isolated workspace with its own data, settings, plan, seats, branding and optional custom domain. It is created by self-serve signup, by a master admin, or by a reseller.
- **Company group.** Optional. A holding company links several companies (for example one per legal entity or GSTIN) for consolidated billing and group-level reports. Data stays isolated per company; group admins get read access across member companies only through explicit group roles, and employees can be transferred between group companies with history preserved.
- **User.** A global login identity (email and/or mobile number plus sign-in methods and 2FA). A user has no business data of its own.
- **Membership.** Links one user to one company with that company's roles, status, and optionally one employee record. A user may hold memberships in several companies (group staff, consultants, accountants) and switches company from the profile menu; signing in with a phone OTP that matches several memberships shows a company picker. Switching company issues a new token scoped to that company.
- **Employee.** A company-scoped person record used by attendance, leave, tracking, tasks, payroll and reports. Most employees have a user login through a membership; some do not (for example workers whose attendance is marked by a supervisor).
- **Company roles.** Owner (exactly one, transferable; controls billing and company deletion), Admin, HR admin, Billing admin, Manager, Functional manager, Employee, External user (read-only scoped access for auditors or accountants, no employee record), plus custom roles.
- **Seats.** Every active employee with a license bundle consumes one seat of that bundle. Users without an employee record (external users, admin-only accounts) do not consume seats, up to 5 per company.

**Who can do what.**

| Capability | Master admin | Reseller admin | Company owner | Company admin | Manager | Employee |
|---|---|---|---|---|---|---|
| Create, suspend, restore companies | All | Own companies | No | No | No | No |
| Delete a company | All (after owner request or policy) | Own companies | Own company, 30-day recovery | No | No | No |
| Plans, prices, feature flags, announcements | Yes | Within its price book | No | No | No | No |
| Company subscription, seats, invoices | Yes | Own companies | Yes | With billing permission | No | No |
| Company settings, roles, integrations, branding | Support session only | Support session only | Yes | Yes | No | No |
| Employees and org structure | No | No | Yes | Yes (HR admin too) | View within scope | Own profile per settings |
| Team data (attendance, location, tasks, productivity) | No | No | All | All | Own scope | Self only |
| Approvals (leave, expense, regularization) | No | No | Yes | Yes | Own scope | No |
| Own punch, leave, expenses, tasks | No | No | If also an employee | If also an employee | Yes | Yes |
| Audit log | Platform log | Own companies' platform events | Company log | Company log | No | Own "My data" view |

**Company lifecycle.** trial, then active, then past due (grace period), then suspended (read-only, sign-in shows a billing notice to owner and billing admins only), then cancelled, then deleted. Master admins can extend trials, grant complimentary seats, change plans, suspend for abuse and restore. Deletion is soft for 30 days; after that the company's encryption keys are destroyed and its objects purged, and the owner receives a full data export beforehand.

**Provisioning a company.** Create the company (name, slug, country, timezone, currency, plan), reserve the subdomain, invite the owner, and seed defaults (roles, leave types and holidays for the chosen state, a shift template, report catalogue, notification templates); the owner then lands in the onboarding wizard (5.25). The same path serves self-serve signup, master-admin creation and reseller creation.

**User lifecycle.** Invited, active, suspended, removed. Removing a user from a company ends that membership only; the user identity survives if other memberships exist. Ownership transfer requires the new owner's acceptance. Owner lock-out recovery goes through a master admin with identity verification and is fully audited.

**Isolation and sign-in.**
- Two auth realms: platform staff sign in only at the platform domain with mandatory 2FA and an IP allowlist; company users sign in at the app domain or their custom domain. A platform token is never accepted by company APIs, and a company token is never accepted by platform APIs. Support sessions use a distinct, short-lived token flagged as support.
- Every company token carries the company ID and membership ID; RLS enforces the company boundary (Section 3).
- Per-company limits by plan (seats, storage, API rate, concurrent reports and exports) protect companies from noisy neighbours.

**Master admin console at a glance** (details in 5.26): companies by lifecycle state, MRR and ARR, churn, seats sold versus used, trials ending, past-due companies, active users per company, ingest volume, open support sessions, error rates.

## 2. Tech stack and repository layout (decided)

Monorepo with pnpm workspaces and Turborepo; TypeScript in strict mode everywhere; Node.js LTS.

```
apps/
  web/        Next.js App Router: tenant console (Employee + Manager modes)
  platform/   Next.js: operator console, separate auth realm
  site/       Next.js static export: marketing, pricing, help center, signup
  api/        NestJS (Express adapter): REST API, auth, realtime gateway
  worker/     NestJS standalone: BullMQ processors and schedulers
  mobile/     Expo (React Native, dev client): field app
  desktop/    Electron + Vite: desktop agent
  extension/  Chrome/Edge Manifest V3 extension
packages/
  tokens/     design tokens (JSON source -> CSS variables, Tailwind theme, RN theme)
  ui/         React component library (Radix primitives + tokens), Storybook
  schemas/    zod schemas shared by api, web, mobile and desktop
  sdk/        typed API client generated from OpenAPI
  rules/      pure TypeScript engines: attendance, leave, productivity, geo
  config/     eslint, tsconfig and prettier presets
infra/        docker compose, Caddy, backups, monitoring
docs/         this prompt, screenshot analysis, ADRs, runbooks, API guide
```

**Backend.** One NestJS module per domain. Drizzle ORM with drizzle-kit migrations. PostgreSQL 16+ with PostGIS, pg_trgm and native declarative partitioning. Redis for cache, rate limits, BullMQ queues and the Socket.IO adapter. S3-compatible object storage (MinIO self-hosted, or Cloudflare R2 or AWS S3), reached only through short-lived signed URLs.

**Web.** Next.js App Router with server components for page shells, TanStack Query for client data, TanStack Table with row virtualization, React Hook Form with zod, Apache ECharts for charts, React Flow (`@xyflow/react`) for the workflow designer, dnd-kit for the form builder and dashboard grid, MapLibre GL behind a map-provider interface (Google Maps adapter optional per tenant), Tailwind CSS v4 driven by CSS variables from `packages/tokens`, next-intl for translations.

**Mobile.** Expo with a dev client; expo-location with TaskManager for background tracking (switch to a licensed background-geolocation SDK behind the same interface if the battery target in Section 15 is missed); expo-camera; expo-local-authentication; expo-sqlite for the offline queue; FCM and APNs push.

**Desktop.** Electron with contextIsolation and a hardened preload; `get-windows` for the foreground window; `powerMonitor` for system idle time; `desktopCapturer` for screenshots; better-sqlite3 for the offline buffer; electron-updater with signed builds.

**Provider interfaces** (one adapter each at launch, swappable later): payments (Razorpay for India, Stripe for international), email (Amazon SES or SMTP, with bounce webhooks), SMS and WhatsApp (an Indian business solution provider), cloud telephony, map tiles, geocoding and routing.

**Observability.** pino JSON logs with request IDs, OpenTelemetry traces, Prometheus metrics with Grafana, Sentry for web, API, mobile and desktop, and external uptime checks.

**Deployment v1.** Docker Compose on one VPS (a Hostinger KVM plan or equivalent, starting at 8 vCPU and 16 GB RAM): Caddy (automatic TLS, wildcard tenant subdomains, on-demand TLS for white-label custom domains), web, platform, site, api (two replicas), worker, PostgreSQL, Redis, MinIO and the monitoring stack. Shared Node.js hosting cannot run this product, because it needs long-running workers, Redis, WebSockets and PostGIS. Back up PostgreSQL with WAL archiving plus nightly base backups to off-site object storage, and rehearse a restore monthly. **v2:** managed PostgreSQL and a container platform. No code may assume a single host.

### 2.1 Code organization: CRUD, KISS and DRY (mandatory)

Goal: anyone can find the code for an entity in under a minute, and a new CRUD entity is mostly configuration.

**Rules.**
- **Feature folders, not layer folders.** Code is grouped by module, then by entity. Each entity folder owns its create, read, update and delete code end to end. Framework plumbing lives in `core/`, reusable building blocks in `shared/`, and nowhere else.
- **One schema, many uses (DRY).** Each entity has one zod schema file in `packages/schemas` that defines its `create`, `update`, `read` and `filter` shapes. Those schemas produce the TypeScript types, API validation, the OpenAPI document, the SDK, and the default form fields and table columns. Never redefine a field list anywhere else.
- **CRUD kit (DRY).** On the API, `shared/crud` provides a base controller, service and repository that implement list (pagination, filters, sort, count on demand), get, create, update, soft delete, restore, bulk actions, export, audit and permission checks. On the web and mobile, `shared/crud` provides `CrudListPage`, `CrudForm`, `CrudDetail`, `CrudDrawer` and `useCrudResource`. An entity plugs in through one `resource.ts` definition and overrides only what differs.
- **Keep it simple (KISS).** Plain functions and classes; no metaprogramming beyond the CRUD kit; inheritance at most one level deep; no new abstraction until the third repetition. Files stay under about 300 lines and functions under about 50; split by responsibility when they grow. Names say what things are (`leave-requests.service.ts`, `approveLeaveRequest`), never `utils2` or `helpers`.
- **Public entry points.** Each module exposes an `index.ts`, and other modules import only from it. A boundary lint rule (eslint-plugin-boundaries or dependency-cruiser) enforces this in CI.
- **Business rules live in one place:** pure functions in `packages/rules`, called by services and tested with fixtures. Controllers hold no logic; UI components hold no business rules.

**API layout** (`apps/api/src`):

```
core/                    bootstrap, config, database, auth, tenancy (RLS), rbac and scopes,
                         audit, errors, logging, i18n, idempotency
shared/
  crud/                  crud.controller.ts  crud.service.ts  crud.repository.ts
                         crud.types.ts  query-parser.ts (filters, sort, cursor)  export.ts
  events/                outbox.ts  event-bus.ts
  storage/               signed-urls.ts
  providers/             payments/  email/  messaging/  telephony/  maps/  connectors/
modules/
  attendance/
    attendance.module.ts
    index.ts                   the module's public API
    punches/
      punches.controller.ts    routes; extends the CRUD controller, custom actions only
      punches.service.ts       use cases: check restrictions, record punch
      punches.repository.ts    Drizzle queries
      punches.table.ts         Drizzle table, indexes, RLS policy
      punches.events.ts        domain events it emits
      punches.spec.ts          unit and integration tests
    attendance-days/
    regularizations/
  leave/        leave-types/  leave-profiles/  leave-requests/  holidays/  non-working-days/
  field/        tasks/  check-ins/  geo-fences/  locations/  beat-plans/
  crm/          customers/  contacts/  leads/  opportunities/  targets/  whatsapp/
  hr/           employees/  payroll/  onboarding/  policies/
  service/      cases/  assets/
  expenses/  calls/  productivity/  forms/  workflows/  notifications/
  reports/  analytics/  integrations/  billing/  platform/
jobs/                    one file per BullMQ processor, grouped by module (run by apps/worker)
```

**Web layout** (`apps/web/src`):

```
app/                                     routes only; each page file is a few lines
  (auth)/sign-in/page.tsx
  (console)/layout.tsx                   AppShell (sidebar, icon rail, top bar)
  (console)/leave/types/page.tsx         <CrudListPage resource={leaveTypes} />
  (console)/leave/types/new/page.tsx     <CrudForm resource={leaveTypes} />
  (console)/leave/types/[id]/page.tsx    <CrudDetail resource={leaveTypes} />
features/
  leave/
    leave-types/
      resource.ts        the single definition: API path, schema, columns, filters,
                         form layout, permissions, row actions, empty-state copy
      components/        only what the CRUD kit cannot render (e.g. EntitlementEditor)
    leave-requests/
shared/
  crud/                  CrudListPage  CrudForm  CrudDetail  CrudDrawer  useCrudResource
  layout/                AppShell  Sidebar  IconRail  Topbar  MobileTabBar  ModuleLauncher
  hooks/  lib/  i18n/
```

**Mobile layout** (`apps/mobile/src`) follows the same pattern: `app/` (Expo Router routes only), `features/<module>/<entity>/` (screens, `resource.ts`, hooks), `shared/crud/` (list and form screens driven by the same zod schemas), `shared/offline/` (queue and sync), `shared/tracking/`.

**Naming.** Folders and files in kebab-case; entity folders in the plural (`leave-types`); React components in PascalCase; tables in snake_case plural; permissions `module.entity.action`; routes `/module/entity`, `/module/entity/new`, `/module/entity/:id`.

**Adding an entity (the whole checklist).** 1) Schema in `packages/schemas`. 2) Table and migration. 3) API folder using the CRUD kit. 4) `resource.ts` plus three route files on the web. 5) Permissions and sidebar entry. 6) Tests. If an entity needs more than this, write an ADR explaining why.

## 3. Architecture

**Shape.** A modular monolith. Each domain is a NestJS module with its own controllers, services, repositories and events; modules talk through service interfaces and domain events, never through each other's tables. Domain events are written to a transactional outbox and relayed to BullMQ, where consumers handle notifications, feed entries, webhooks, rollups and search indexing.

**Multi-tenancy.**
- Every tenant-owned table has `tenant_id uuid not null`, and every composite index starts with it.
- PostgreSQL row-level security is enabled on all tenant tables. The API connects as a role without BYPASSRLS and sets `app.tenant_id` and `app.user_id` with `set_config(..., true)` inside each transaction. Platform-level jobs use a separate role and are audited.
- Tenant resolution order: custom domain, then subdomain `<slug>.app.{{PRIMARY_DOMAIN}}`, then the token claim for mobile, desktop and API keys.
- A tenant-isolation test suite proves that every repository method fails to read or write another tenant's rows.

**Authorization.** Permissions are keys shaped `module.resource.action` (for example `attendance.punch.override`); roles are permission sets. A single `ScopeResolver` turns the viewer's data scope into query predicates, and no controller builds its own visibility filter.

**Entitlements.** Tenants buy seats in license bundles, and each bundle is a set of modules (Section 5.23). A request to a module outside the tenant's plan or the employee's bundle returns HTTP 402 with code `module_not_licensed`, and the UI hides that module. Mobile and desktop apps read entitlements at sign-in and on every sync.

**High-volume ingestion.** `/v1/ingest/locations`, `/v1/ingest/activity`, `/v1/ingest/screenshots` and `/v1/ingest/calls` accept gzipped batches of up to 500 records. Each record carries a client-generated UUIDv7 and a device sequence number, so retries are harmless (`ON CONFLICT DO NOTHING`). Raw data lands in monthly partitions, and rollup jobs produce daily fact tables. Dashboards and reports read facts and never scan raw partitions across month-long ranges.

**Time.** Store `timestamptz` in UTC. Each shift has a timezone, and the attendance date is computed from the shift window, so a night shift that crosses midnight belongs to one attendance day. Render times in the viewer's timezone, with a timezone switch on timelines (ref 14).

**Identifiers.** UUIDv7 primary keys. Human-readable codes come from per-tenant sequences with configurable prefixes (EMP-0001, CUST-0001, TSK-0001, EXP-0001, LV-0001). Internal IDs never appear as table columns; row menus offer "Copy ID" instead (the reference exposes database IDs, ref 22).

**Soft delete.** User-facing entities carry `deleted_at`, `deleted_by` and `delete_reason`. Each module has a recycle bin with restore, and a purge job removes items 30 days after deletion (configurable per tenant). References to deleted people render as "Name (deleted)".

**Audit.** An append-only, monthly-partitioned `audit_log` records actor, impersonator, source (web, mobile, desktop, api, system), IP, user agent, entity, action, field-level old and new values, and request ID. Every configuration screen has an Audit history tab (refs 58, 84, 110).

**Settings framework.** A typed settings registry defines each setting's key, section, type, default, description, scope (tenant, shift, team or employee) and feature dependencies. One generic renderer shows settings grouped by intent, with search, "changed from default" markers and inline help. This replaces the reference's long toggle walls (refs 87 to 109). Appendix A lists every setting to carry over.

## 4. Web console information architecture

Replace the reference's 18-link top bar with a grouped, collapsible left sidebar (it collapses to a 72 px icon rail) and a command palette (Ctrl/Cmd + K) that searches pages, people, customers, tasks and settings.

**Manager mode sidebar.**
- Home
- Live map
- Dashboards: Overview, Tasks, Calls, Desktop activity, Apps, Websites
- People: Employees, Teams, Org chart
- Time: Attendance (Daily log, Monthly register, Regularizations), Leave (Requests, Calendar, Balances), Timesheets, Projects
- Field: Tasks and visits (List, Board, Calendar), Customers, Contacts
- Productivity: Day view, Team timeline, Team productivity, Screenshots, Apps and websites, Activity log
- Sales: Leads, Opportunities, Targets, Beat plans, WhatsApp inbox
- HR: Payroll, Onboarding, Policies
- Service: Help desk, Assets
- Expenses
- Calls: Call log, Ignore list
- Feed
- Insights: Reports, Analytics
- Admin (with admin permissions only)

**Employee mode sidebar.** Home, My attendance, My leave, My timesheet, My tasks, My expenses, My customers (when permitted), My productivity (own data only), My data and privacy, Profile.

**Top bar.** Tenant logo, command palette trigger, punch widget (current state, time since the last punch, one-click punch that applies the web restrictions from the employee's shift), mode switcher, notifications, help menu (documentation, keyboard shortcuts, "Take the tour again"), profile menu (language, theme, settings, sign out; ref 117).

**Admin area.** A secondary sidebar with its own search, grouped by intent:
- Organization: profile, branding, work locations, departments, designations, teams, employee types, employment types, business units, cost centers, custom fields (employee, customer, contact)
- Time and attendance: working shifts, attendance policies, break types, geo-fences, attendance settings
- Leave: leave profiles, leave types, holidays, non-working days, leave settings
- Field and CRM: task types and forms, check-in forms, customer settings, contact settings, task settings, board settings, geo settings
- Finance: expense types and forms, expense settings, currencies
- Productivity: apps and websites classification, desktop agent settings, screenshot policy
- Automation: workflows, notification rules, message templates, customer notifications, webhooks
- Communication logs: email log and bounces, SMS and WhatsApp log
- Security: sign-in methods, roles and permissions, devices, IP allowlist, support access, audit log
- Data: import and export, recycle bins, retention, date formats
- Integrations: connectors, API keys, webhooks, sync logs
- Billing: plan and seats, license assignment, invoices, payment methods

### 4.1 Navigation shell: collapsible sidebar and icon view (mandatory)

- **Three states.** *Expanded* (264 px: icons, labels, group headings, badges). *Icon rail* (72 px: icons only on the Paper background, a Petrol bar on the active item, badge dots for pending items, a tooltip label on hover and on keyboard focus, and a flyout listing the group's pages when a group icon is hovered, clicked or focused). *Hidden* (an off-canvas drawer opened from a menu button in the top bar, with a scrim; it closes on navigation, Esc or swipe).
- **Defaults by width.** 1280 px and wider starts expanded; 768 to 1279 px starts as the icon rail; below 768 px the sidebar is hidden and the main destinations move to a bottom tab bar of at most five items.
- **Toggle.** A collapse button pinned to the bottom of the sidebar, plus Ctrl/Cmd + B. The choice is remembered per device and synced as a user preference, but it never overrides the hidden state below 768 px.
- **Module launcher (icon view).** A grid of module icon tiles, opened from the top bar and shown on Home on phones, listing only licensed modules, for fast switching on touch devices.
- **Mechanics.** The shell is a CSS grid (`grid-template-columns: var(--sidebar-width) minmax(0, 1fr)`), so content reflows without layout shift. The width animates over 200 ms and switches instantly under `prefers-reduced-motion`.
- **Icons.** One line-icon set (for example Lucide) at 20 to 24 px; every icon has an accessible name and is never shown without a label or tooltip.
- **Admin sidebar** has the same three states; below 768 px it becomes a searchable section picker at the top of the page.
- **Keyboard and screen readers.** The sidebar is a `nav` landmark, arrow keys move between items, Enter opens a flyout, and focus returns to the trigger when it closes.

**Global UX patterns.**
- Page header: title, scope breadcrumb, one primary action, secondary actions (import, export, columns, density, refresh).
- Filter bar: chips shaped as field, operator and value (equals, in, not in, between, contains, is empty); date presets (Today, Yesterday, Last 7 days, Month to date, Last month, Custom); saved views per user with "Set as default" (ref 41); all filter state in the URL so views can be shared.
- Tables: sticky header, resizable and reorderable columns, virtualized rows, cursor pagination with 25, 50 or 100 rows per page, total count on demand ("Count all", the reference's "Fetch total"), bulk actions on selection, a row menu, CSV and XLSX export as a background job that notifies when ready.
- Detail pages: status header, tabs (Details, Related, Activity, Audit history) and a right-hand context panel.
- Empty states say what the page is for and offer the next action.
- Billing and dunning banners appear only to users with billing permission and can be dismissed for 24 hours (the reference shows a permanent red banner to everyone).

## 5. Module specifications

Each module lists what to store, what to show and the rules that matter. Field lists are minimums.

### 5.1 Home: personal widget dashboard (ref 1)
- Widgets, each with its own date scope and menu: Attendance today (present, absent, on leave, with percentages), Action needed today (pending, overdue and upcoming tasks), Tasks (completed, in progress), Live now (online, on break, travelling), Pending approvals (leave, regularization, expense, timesheet), Birthdays, Work anniversaries, Holidays, Expenses (pending, approved this month), Productivity (total %, working, productive, idle), Timesheet activities, Timesheet breaks, Map snapshot.
- Multiple named dashboards per user; admins set a default per role. Edit mode uses a 12-column drag-and-resize grid, and the "Add widget" gallery lists only licensed widgets. Widgets load independently with skeletons.
- Admins can hide the birthday, anniversary and holiday widgets for the whole tenant (ref 87).
- Target: a 12-widget dashboard renders in under 1.5 s at p95 for a 500-employee tenant.

### 5.2 Dashboards (refs 2 to 10)
- **Overview:** distance, travel time, tasks, present days and working hours, each with a previous-period delta; daily distance trend; per-employee table; live break-compliance table (current break, minutes used, "Exceeded by N min" or "N min left" against the shift allowance, last break start, work duration so far; ref 3).
- **Tasks:** completed, time spent, unique customers; completion trend; top performers; completions by task type; pending by type up to today; top customers.
- **Calls:** outgoing and incoming counts and durations with deltas; trend; per-employee table.
- **Desktop activity:** total and average working, productive and idle time; team trend charts; employees with the most unproductive time; date-wise table.
- **Apps** and **Websites:** daily bars for the top three, top-three share, top-50 table with duration and share.
- Filters: employee (equals or in), team, department, work location, customer (in), date presets. Every tab reads from daily rollup tables.
- Exclude Trackrex's own agent and extension from app and website statistics (the reference counts its own agent as a top app; ref 9).

### 5.3 Employees and organization (refs 19, 44 to 52, 113)
- **Employee fields:** code (prefix plus sequence, editable), first and last name, display name, photo, gender, date of birth, date of joining, date of exit, work email, personal email, mobile (E.164 with the tenant's default country code), reporting manager, functional manager, department, designation, teams, work location, business unit, cost center, employee type, employment type, working shift (effective-dated), leave profile, license bundle, roles, home location (point and address), base location, status (invited, active, suspended, exited), custom fields (5.17).
- **Directory:** counters for All, Punched in, Punched out, Never punched, Late today and On leave; live status with relative time ("In, 7 h ago"); agent sync status ("Desktop synced 15 min ago", "Desktop app never signed in"; ref 30).
- **Actions:** invite by email, SMS or WhatsApp link; bulk import from an XLSX template with a validation preview and row-level errors; bulk update; transfer to a new manager with reassignment of reportees, customers and open tasks; exit (releases the seat, unbinds devices, starts the retention clock); delete to the recycle bin and restore (ref 113); reset device binding; resend invite.
- **Organization objects**, each with a list, a create and edit drawer, status and audit: departments (parent, head), designations (department), teams (lead, members), work locations (address, point, radius, timezone), business units, cost centers, employee types, employment types.
- **Employee profile page:** header with live status and today's day ribbon (Section 13); tabs for Overview, Attendance, Leave, Timesheets, Tasks, Customers, Expenses, Productivity, Devices, Documents and Audit.
- Employee profile settings decide the mandatory fields and which fields employees may edit themselves on web or mobile (ref 104).

### 5.4 Working shifts (refs 53 to 59)
Shift fields, all validated on the server:
- **Timing:** title, timezone, start time, max punch-in time (the late threshold), working hours, break allowance, continuous-idle threshold in minutes (desktop), night shift (derived when the end is before the start).
- **Platforms:** allowed punch sources (mobile app, desktop, web), login platform restrictions, and which platforms may mark breaks.
- **Auto punch-out:** on or off; based on hours after punch-in or on a fixed clock time; value; whether to block further punches until the next attendance day after an auto punch-out.
- **Regularization:** on or off, how many days back, approval required.
- **Punch restrictions:** block punch-in more than N minutes before start; block punch-in after the max punch-in time; mandatory comment on punch-in and on punch-out; IP allowlist (CIDR) for web and desktop punches; block punches at the employee's home location (radius); selfie off, optional or mandatory, with date-time and address watermarks; location off, optional or mandatory; an explicit override that allows app punches without location and selfie; geo-fence restriction for punch-in and for punch-out (choose fences).
- **Timesheet restrictions:** hide past breaks, hide past activities, block punch-in until the previous timesheet is submitted.
- **Mobile restrictions:** device binding (one registered device per employee), biometric unlock (enable or force), punch-in required before using the app, check-out required before punch-out, punch-out required before logout.
- Tabs: Details, Employees (effective-dated assignments, bulk add), Attendance policies, Audit history.
- Every restriction gets automated allow and deny tests on web, mobile and desktop.

### 5.5 Attendance (refs 29 to 32, 101, 102)
- **Punch record:** type (in, out), source (mobile, desktop, web, system, admin), device ID, IP, point, accuracy, address (reverse-geocoded asynchronously), matched geo-fence, selfie object key with watermark metadata, comment, mock-location flag, and an offline flag with both device time and server receive time.
- **Attendance day** (per employee per attendance date): first in, last out, worked minutes, break minutes, late minutes, early-out minutes, status code, policy results, overrides (who, when, why), and a locked flag once payroll for the cycle is closed.
- **Status taxonomy:** Appendix C. Symbols, titles and colours are tenant-configurable (ref 102).
- **Daily log:** every punch with a source icon, selfie lightbox and map popover.
- **Monthly register:** sticky employee column with agent sync status; one column per day with the weekday; every cell shows its letter code on a tint of the status colour (Section 13); summary columns P, A, L, HL, H, PA, HP, AH, AP, D and NW; an attendance-cycle label that follows the tenant's month start day; a legend panel; clicking a cell opens a day drawer with punches, map, policy results and an override action; payroll export to XLSX.
- **Regularizations:** requests showing current and requested state, reason and attachments; approve or reject with a comment; bulk approve; routed through workflows (5.18).
- **My attendance** (Employee mode): month calendar, punches and regularization requests.
- **Settings:** month start day; approval required by default; stop employees editing punch times; restrict regularization; override the regularization window; show late marks in the register; override non-working days; block punch-in on approved leave; show work anniversaries in calendars; re-run attendance policies for a date range as a background job with a preview of changed days; override the status colour table.
- **Jobs:** auto punch-out, missed punch-out detection, "you haven't punched in" reminders.

### 5.6 Attendance policies (refs 59, 74, 75)
A policy has a name, start date, description, attached shifts and an ordered list of rules. Published versions are immutable (the reference forbids edits after publishing; keep that guarantee), and editing creates a new version with its own start date. Each rule type is a pure function in `packages/rules` with golden-file tests:
- **Late punch-in:** grace minutes; after N late marks in a cycle, deduct a half or full day, or mark late-by-policy.
- **Early punch-out:** threshold minutes, with the same consequence options.
- **Minimum hours:** below X hours becomes a half day; below Y becomes absent.
- **Productivity** (desktop): productive time below X becomes a half day or a flag.
- **Task completion:** fewer than N completed tasks or visits becomes a half day or a flag.
- **Missing punch-out:** treated as an auto punch-out, a half day or a pending regularization.
- **Overtime:** minutes beyond the shift go to an overtime bucket for the payroll export.

The engine runs nightly at each tenant's local midnight and on demand. It writes results with a plain-language explanation that appears in the day drawer ("Late by 22 min; 3rd late mark this cycle; half day deducted").

### 5.7 Leave (refs 25 to 28, 76 to 86, 103)
- **Concepts:** leave session (the leave year, for example January to December, configurable), leave profiles (groups of employees who share leave types, holidays and non-working days, with a half-day-allowed flag), leave types, entitlements, a ledger and requests.
- **Leave type:** name, code, colour, paid or unpaid, counts as loss-of-pay deduction, enabled, description, linked profiles.
- **Entitlement** (several tiers by years of experience): effective N months after joining; credited at the start of each period or after it; accrual monthly, quarterly, half-yearly, flat annual, or equally distributed by month; total days per session; flexible leave; compensatory off (earned by working on holidays or non-working days, with expiry); carry-forward (maximum days, expiry); encashment flag (export only).
- **Restrictions:** whether weekends and holidays inside a leave period count (sandwich rules); exceeding balance (block, allow without limit, or allow up to the full-year accrual); past-dated requests up to N days back; future requests at least N days ahead and at most N days out; allowed durations (full day, first half, second half, optional hourly); gender eligibility; reason mandatory; attachment mandatory beyond N days; show the type and the balance summary to employees; maximum days per application; maximum consecutive days; maximum applications per period; types that cannot be combined; auto-approve.
- **Holidays:** per session and per leave profile, with optional holidays and a pick limit. **Non-working days:** weekly patterns per leave profile (every Sunday, 2nd and 4th Saturdays).
- **Screens:** Requests (applied, pending, approved, rejected and cancelled, with "action by" and "action on"); Calendar (filters for status, employees, types, profile, department and team, plus a toggle for holidays and non-working days; ref 28); Balances (per employee, type and session, with ledger drill-down); Apply (live balance and every restriction validated before submit); Approvals (multi-level through workflows); Comp-off requests.
- **Settings:** session range, carry-forward processing date, applying against the previous session, leave type column in Excel exports (ref 103).
- **Attendance link:** approved leave writes to the register, half-day leave combines with half-day presence, and punch-in on approved leave can be blocked.

### 5.8 Timesheets, breaks and projects (refs 3, 18, 37, 38, 64)
- **Break types** (lunch, tea, meeting and so on): paid or unpaid, allowance per shift, live status ("20 min left", "Exceeded by 11 min").
- **Timesheet** (per employee per day): activities (project, activity, optional customer, start and end or duration, notes, billable) and breaks; status draft, submitted, approved or rejected with a comment; auto-drafted from desktop and app data; reminders to submit; locked after approval.
- **Projects:** title, code, customer, manager, members, activities, status, budget hours; employee-created projects only when a setting allows them.
- **Screens:** all timesheets with bulk approve; timesheet detail (timeline and list); My timesheet (quick add, copy yesterday); projects with hours by activity and by member.

### 5.9 Live tracking and location analytics (refs 2, 39, 41)
- Track mobile location only between punch-in and punch-out, and optionally only inside shift hours. Sampling adapts: when stationary, every 5 minutes or on significant change; when moving, every 50 m or 30 s (tenant-tunable within safe bounds). Each point stores latitude, longitude, accuracy, speed, heading, battery, network type, detected activity (still, walking, vehicle), mock flag, device time and sequence.
- **Processing:** drop points worse than 100 m accuracy, smooth jitter, detect stops (10 minutes or more within 100 m, with arrival, departure and address), compute recorded distance along the path and an optional road-snapped estimated distance, travel time, and daily travel facts.
- **Live map:** layers for employees (current, home or base location; ref 41), customers, branches (work locations) and tasks (by status, priority, assignee, completion date); clustering; per-layer filters; saved default filters. The employee drawer shows the day ribbon, route playback with a scrubber and speed control, stops, and battery and GPS events.
- **Alerts:** GPS switched off during the shift, mock location, outside an assigned fence, no update for N minutes, low battery, app force-stopped.

### 5.10 Geo-fences (refs 107, 111)
A fence has a title, type (circle with radius, or polygon), address, optional link (work location, customer, custom) and an active schedule. Fences drive punch restrictions, check-in and task geo-matching, and entry and exit alerts. Geo settings: check-in match distance and mode (warn or block), task-completion match, and whether employees may request new fences from the app (approval required).

### 5.11 Tasks and field visits (refs 4, 5, 20, 21, 65, 92 to 94, 98)
- **Task:** code; title from a configurable pattern ("{type} for {customer}"); type (bound to a task form); customer; contact; assignees, group or distribution list; creator; priority (optional); status (pending, in progress, completed, cancelled; overdue is derived); stage (board columns per type, with colours); start and end; repeat rule (RRULE); target location (the customer's location or a custom point) with tolerance; OTP completion (code sent to the customer contact); attachments; comments; reminders; payment collection; checklist.
- **Execution from the app:** start (records position, time and accuracy against the target), check-in form, complete (form, geo-stamped photos, signature, optional OTP), check-out. Accuracy is computed from the check-in position or the task position, per setting.
- **Views:** list (bulk assign, bulk status change, import), board (card fields chosen in board settings; ref 98), calendar (team, day, week), map (the live map's task layer), recycle bin (30-day purge; ref 21).
- **Settings:** carry over every task flag and feature switch in Appendix A, grouped under execution, restrictions, visibility, features and display.

### 5.12 Customers and contacts (refs 22, 43, 88 to 90, 108)
- **Customer:** code, name, category, status (active, inactive, prospect), owner, reporting managers 1 and 2 (for visibility), phones, email, address and point (source: employee, check-in, task or manual, per setting), territory or work location, remote ID for an ERP or accounting system (searchable and linkable), custom fields, tags, creator (kept after the creator is deleted).
- **Contact:** name, designation, phones, email, linked customers (many-to-many), custom fields.
- **Settings:** unique fields, mandatory fields, visible fields, fields appended in pickers, default country code, contact phone required, remote ID visibility and search, manage contacts, gallery or camera-only photos at check-in, searchable fields, fields shown in the mobile list and detail, access scope (all customers, or owned and team), contact visibility on mobile (all, my reportees, same team), disable contact creation on mobile.
- **Customer detail:** overview, visit timeline, tasks, contacts, calls, linked expenses, map, audit.
- Duplicate detection on create (phone match and name similarity) and a merge tool.

### 5.13 Expenses (refs 23, 24, 66, 71, 72, 91)
- **Claim:** code, title, employee, type (bound to an expense form: travel, food, fuel at distance times rate, lodging, other), date, amount claimed, currency, receipts (photos or PDF), linked task, customer or project, cost center, comment, workflow instance, approved amount (which may differ per stage), reimbursement status (unpaid, or paid with a reference), audit.
- **Rules:** limits per type (per claim, per day and per month, optionally by designation), receipt required above an amount, fuel amount computed from recorded travel, duplicate-receipt detection by image hash.
- **Screens:** all expenses, approvals queue, recycle bin, My expenses, claim PDF (portrait or landscape per setting), optional payment tab on mobile, common fields shown to managers (ref 91).

### 5.14 Call log and cloud calling (refs 6, 34, 35, 97)
- The Android app syncs call-log entries (direction: incoming, outgoing, missed, rejected; number in E.164; duration; start time; SIM slot) only during working time and only for numbers that are not on an ignore list. Numbers are matched to customers and contacts; unmatched numbers offer "Create customer".
- **Ignore list:** tenant-wide numbers, plus personal numbers that each employee adds on the device and that never leave it.
- **Recordings** come only from cloud telephony. The app never records calls on the device.
- **Cloud calling:** a provider adapter for click-to-call from web and mobile, recordings and dispositions via webhooks, and rollout restricted by employee, team, department, designation or work location.
- **Analytics:** calls per employee per day, talk time, unique customers called, first call of the day.
- **Store compliance:** Google Play restricts the call-log permission. Ship call-log sync in a separate Android build distributed privately through Managed Google Play, or apply for Play approval if the use case qualifies for one of the permission exceptions, and verify the current policy before release. iOS offers no call-log access, so iOS users see cloud-telephony data only.

### 5.15 Desktop productivity (refs 7 to 17, 36, 63, 109)
- **Captured by the agent** while the employee is punched in (Section 7): activity buckets (2 minutes by default) with mouse-click, mouse-movement and key-press counts (counts only), active and idle seconds, foreground app, window title (dropped, hashed or kept per tenant setting), browser domain (from the extension), and screenshots when the tenant's policy enables them.
- **Classification:** a per-tenant catalogue of discovered apps and websites with usage totals, each classified productive, unproductive or neutral; overrides per team or department; bulk classification; unclassified items count as neutral.
- **Definitions** (shown as tooltips wherever these numbers appear): working time is punched-in time; recorded time is time covered by agent data; unrecorded time is working time minus recorded time; idle time is input-free time beyond the continuous-idle threshold; productive time is recorded, non-idle time in productive apps and sites; productivity % is productive time divided by working time, or by recorded time when the "consider productive time" setting says so (ref 109).
- **Screens:** Day view per employee (punch in and out, working, productive, idle, productivity %, activity duration; a week strip with daily percentages; per-minute productivity timeline; activity and break timeline; top apps and sites coloured by class; hour-by-hour productivity; hour-grouped screenshots; refs 11 to 13); Team timeline with a timezone switch (ref 14); Team productivity (ref 15); Screenshots browser (ref 16); Apps and websites per employee (ref 17); Activity log of raw buckets (ref 36).
- **Screenshot policy:** off by default; interval of 5 to 30 minutes with the capture moment randomized inside it; blur level none, low or high per team, applied on the device before upload; optional notification on capture; optionally let employees delete a capture within N minutes; never captured during breaks, while paused or outside work time; default retention 30 days.

### 5.16 Activity feed (ref 33)
A real-time stream of events: punch in and out, auto punch-out, break start and end, task started and completed, check-in and check-out, leave applied and approved, expense submitted and approved, GPS off, fence exit, agent offline. Each entry shows the actor, platform (Android, iOS, desktop, web, system), device, a location link and the time. Filter by event type, team or employee; entries arrive live over WebSocket; export is available.

### 5.17 Forms and custom fields (refs 65 to 70)
One form engine serves task types, check-in and check-out forms, expense types, and custom fields on employees, customers and contacts (the reference calls custom fields "Tags"; call them Custom fields).
- **Builder:** the field palette in Appendix D; a drag-and-drop canvas with sections; field properties (label, key, help text, required, default, validation, conditional visibility, read-only on mobile, shown in list, detail, board and reports); preview inside a phone frame; versions (draft, then published, with every submission recording its form version); duplicate; archive.
- **Storage:** submissions as JSONB validated against the published schema; fields marked reportable are projected into typed, indexed columns for filters and reports.
- The form renderer ships in both `packages/ui` (web) and the mobile app, with behavioural parity tests.

### 5.18 Workflows (refs 71, 72)
- **Types:** expense, leave, regularization, timesheet, and optionally task completion and customer creation.
- **Designer:** a node canvas with Start; Approval stage (approver: reporting manager, Nth-level manager, functional manager, department head, role, named user, or a person chosen in a form field); Condition (amount, type, designation, custom field); parallel approval (all or any); Notify; and the end states Approved, Rejected and Cancelled.
- Per-stage SLA with escalation; automatic delegation when an approver is on leave; versions (published versions are immutable and running instances stay on their version); linked forms.

### 5.19 Notifications, templates and email audit (refs 60 to 62, 73, 108)
- **Notification rules:** trigger (any domain event), conditions, audience (employee, manager chain, role, team, named users, customer contact), channels (in-app, push, email, SMS, WhatsApp), a template per channel with variables, quiet hours, a digest option, and a delivery log per recipient.
- **Customer notifications** (ref 108): optional messages to customer contacts on check-in and check-out and on task start and completion, each event with its own channel, template and opt-out handling.
- **Templates:** system templates that tenants can override, with preview and test send; white-label sender domains with SPF and DKIM guidance.
- **Email audit:** history (subject, provider message ID, status, bounce details, sent time) and suppressions (address, total, transient and permanent bounces, status) with an unsuppress action.

### 5.20 Reports (refs 39, 40, 99, 100)
- **Report center** with a left rail: Catalog, My reports, Shared with me, Team reports, Requested (background runs with status, size, expiry and re-run).
- **Each template** has a key, category, description, parameters (date range, employees or teams, filters), selectable and reorderable columns, outputs (XLSX, CSV, and PDF where it makes sense), schedules (daily, weekly or monthly email) and sharing.
- Generation streams to object storage and notifies the requester when ready; long ranges are split by month.
- Date formats are configurable per report family (ref 99).
- Ship the catalogue in Appendix B.

### 5.21 Analytics builder (ref 42)
Folders of saved charts and pivots built on semantic models (attendance days, tasks, visits, travel, calls, expenses, leave, productivity facts). Chart types: KPI, line, bar, stacked bar, donut, table, pivot, map heat layer. Share with users or roles as view or edit, list items under "Shared with me", and pin any item to Home.

### 5.22 Admin: organization, security and account settings (refs 44, 87 to 110)
- **Organization profile:** legal name, display name, logo, address, GSTIN, timezone, distance unit (km or mi), default language, date formats, mobile-number length rules, whether to show work-location identifiers.
- **Branding (white-label):** logo, favicon, brand colour mapped to token overrides (Section 13), custom domain, email sender, and "powered by" visibility per the reseller contract.
- **Security:** sign-in methods (mobile OTP, email OTP, password, Google, Microsoft; SAML or OIDC for enterprise tenants), password policy, mandatory 2FA for admins, session length, IP allowlist, device management (bound devices, revoke), a roles and permissions editor with an "effective access" preview, and an audit log explorer.
- **Support access** (ref 44): a tenant toggle that allows time-boxed access by platform support staff; each session needs a reason, is fully audited and is visible to the tenant.
- **Retention:** per data class (Section 14).

### 5.23 Billing, plans and licenses (refs 112 to 114)
- **Modules:** Core (always included), Attendance, Leave, Tracking (GPS), Tasks and visits, Customers, Expenses, Call log, Desktop activity, Timesheets and projects, Leads and opportunities, Targets and beat plans, WhatsApp inbox, Payroll, Onboarding and policies, Help desk, Assets, Advanced analytics, API and webhooks, White-label.
- **Suites and bundle:** sell suite plans (Live tracking only, Sales CRM, HR, Remote team, Service) plus one all-in-one bundle. For market reference, the reference vendor advertises its all-in-one plan from about US$13 per user per month, billed quarterly or annually, with a 7-day trial (Appendix E).
- **License bundles:** named sets of modules, for example Field (Core, Tracking, Attendance, Leave, Expenses, Tasks, Customers, Call log) and Office (Core, Attendance, Leave, Desktop activity, Timesheets). Tenants buy seats per bundle, billed per seat per month, monthly or annually. Each employee holds exactly one bundle. Seat usage shows total and consumed (ref 112), and exiting or deleting an employee frees the seat (ref 113).
- **Tenant billing screens:** plan and seats (add or remove seats with proration), bulk license assignment, GST-compliant invoices for India issued by Vintorex (downloadable PDF), payment methods, billing contacts, subscription summary (activation date, next renewal; ref 114).
- **Dunning:** the renewal invoice is generated N days ahead; an in-app banner shows to billing admins only; then a grace period; then read-only mode; data is retained per contract.
- **Trial:** 14 days, all modules, 10 seats, optional demo data.

### 5.24 Tools (ref 115)
Bulk import and export (employees, customers, contacts, tasks, holidays), mass reassignment (customers, tasks), recalculations (attendance policies, travel distance, productivity) with a dry-run preview, full tenant data export for portability, and deletion requests.

### 5.25 Onboarding and product tours
Signup leads to a setup wizard: company profile and timezone, work locations, shifts, a leave profile with default leave types and the selected state's public holidays, inviting employees (CSV or phone contacts), and installing the apps (QR codes for mobile, download links for desktop). A checklist stays on Home until setup is complete. Every module has a short contextual tour that can be replayed from the help menu.

### 5.26 Platform console (Vintorex master admin; hierarchy in 1.3)
- **Tenants:** search, health score, seats, MRR, last activity, modules. Tenant detail: subscription, invoices, usage, users, feature flags, internal notes, and support-access sessions (only when the tenant has enabled support access; time-boxed, reason required, fully audited and visible to the tenant).
- **Catalogue:** plans, modules, bundles and prices (INR and USD), coupons.
- **Revenue:** invoices, payments, credit notes, dunning queue.
- **Resellers:** brand kits, their tenants, margins, custom domains.
- **Operations:** announcements (targeted in-app banners), feature flags, system health (queue depth, ingest lag, error rates, storage), data requests (export, deletion), platform audit log.
- Separate auth realm with mandatory 2FA and an IP allowlist.

### 5.27 Marketing site and help center
- **Pages:** home, one page per module, industries, pricing with a seat calculator (bundles, monthly or annual, INR or USD), plan comparison, security and privacy (DPA, sub-processors, with Vintorex as the data processor), customer stories, blog, changelog, status link, demo booking, signup, login.
- **Help center:** searchable articles and short videos, an API reference rendered from OpenAPI, app download pages.
- Static generation, sitemap, structured data, and Core Web Vitals in the green.

### Suite expansion (from the reference vendor's public website)

The reference vendor's website sells a broader suite than the screenshots show: Sales CRM, HR management, remote team management and IT/help desk, plus separate inventory, fleet and school-transport products (Appendix E). Modules 5.28 to 5.39 bring Trackrex to parity. They follow every rule above (CRUD kit, scopes, audit, responsive) and ship in Phases 10 to 12.

### 5.28 Leads
- **Lead:** code, name, company, phones, email, source (manual, bulk upload, web form, Facebook lead ads, Google Ads lead forms, IndiaMART, TradeIndia, ExportersIndia, Google Sheets or OneDrive sheet sync, Calendly booking, API), campaign, owner, stage (per workflow), score, next follow-up, contact attempts, lost reason, custom fields, links to the converted customer and opportunity.
- **Capture:** connectors (5.37) with deduplication on phone and email; auto-assignment rules (round robin, territory, source, product, workload cap); bulk upload and bulk reassignment.
- **Work:** list and board by stage; follow-up tasks and reminders; call, WhatsApp and email actions logged to the lead timeline; stage-wise mandatory fields and restrictions through workflows.
- **Dashboard:** leads by stage and source, times contacted, conversion rate, ageing, first-response time.

### 5.29 Opportunities
Deal pipeline linked to a customer or lead: value, currency, expected close date, probability, line items, stage (workflow), owner, competitors, won or lost with reason. Forecast by period and owner, and a weighted pipeline view.

### 5.30 Targets
Targets per employee, team or territory for a month, quarter or year on measurable metrics: completed visits, new customers, converted leads, order value, collections, calls, working days. Achievement is computed from existing facts and shown on Home, in the app and on leaderboards, with an incentive export.

### 5.31 Beat planning (route plans)
A beat is a named, recurring set of customers for a weekday or date pattern, assigned to employees. The system suggests a visiting order through the routing provider, generates each day's visit tasks, and reports adherence (planned versus visited, sequence deviation, unplanned visits). Speed-violation and route-deviation alerts fire during travel. Employees may propose their own day plan for manager approval.

### 5.32 WhatsApp inbox
WhatsApp Business Platform through a provider adapter: a shared team inbox; conversations linked to leads, customers and contacts; approved template messages; opt-in records; broadcasts only to contacts with a recorded opt-in; assignment and SLA; quick replies; media. Follow Meta's customer-service window and template rules, and verify the current platform policy before release.

### 5.33 Payroll (India first)
- **Salary structures:** earnings, deductions and reimbursements as fixed, percentage or formula components; effective-dated assignment and revisions per employee.
- **Statutory:** PF, ESI, professional tax by state, TDS, and optional LWF. Rates and thresholds live in versioned configuration tables, never in code, and are reviewed every financial year.
- **Pay run:** the monthly cycle pulls attendance days, loss of pay, overtime and approved reimbursements; then preview, adjustments, lock and approval; payslips (PDF, web and app); bank transfer file; statutory report exports; full audit.
- Tenants that keep an external HRMS export to it instead (5.37).
- This is regulated financial output: golden tests per state and scenario, and a review by a payroll professional before launch.

### 5.34 Employee onboarding
A pre-boarding portal opened from an invite link; checklists by role and location with tasks for HR, IT, the manager and the joiner; document collection with verification states; offer letter and policy acknowledgement; asset hand-off (5.36); day-one account and device setup; a progress dashboard.

### 5.35 Policy centre
Policies as PDF or rich text with categories, versions and effective dates; targeting by department, location or role; mandatory acknowledgement with timestamps; view and acknowledgement counts; reminders; re-acknowledgement when a new version is published.

### 5.36 Help desk and assets
- **Cases:** source (email, web form, WhatsApp, phone, app), customer and contact, category, priority, SLA, stages through workflows, assignee or team, tasks on cases (field visits reuse 5.11), cloud-call details and recordings on the case timeline, customer notifications, satisfaction rating, and a dashboard of cases by status and SLA breach.
- **Assets:** register (tag, category, serial number, vendor, purchase date and cost, warranty, location), vendors, allocation to and return from employees with acknowledgement, maintenance records, depreciation and cost analysis, and QR labels scanned from the mobile app.

### 5.37 Integrations catalogue
A connector framework with encrypted per-tenant credentials, field mapping, sync logs and retries. Launch connectors: lead sources (Facebook lead ads, Google Ads, IndiaMART, TradeIndia, ExportersIndia, website forms), spreadsheets (Google Sheets, OneDrive/Excel), scheduling (Calendly), cloud telephony (Exotel, CallerDesk and similar), HRMS (Keka, greytHR, zingHR, Beehive), accounting and ERP through remote IDs (CSV or API), SSO (Google, Microsoft), and outgoing webhooks. Check each vendor's current API terms before building its connector.

### 5.38 Additions to existing modules
- **Computer-based attendance:** optional auto punch-in when the computer is first used inside the shift window, and auto punch-out after shutdown or a long lock, per shift setting.
- **Alerts:** idle alerts and punch-in alerts to managers; speed-violation alerts with a tenant threshold, with speed shown in route playback.
- **Project billing:** hourly rates by member or role, fixed-price milestones, billable-hours report and invoice export.
- **Dashboards:** separate default employee and manager dashboards.

### 5.39 Separate product lines (later, optional)
Build these as separate apps on the same platform only after the core suite is stable: inventory (stock by location, field orders, dispatch), fleet (vehicle GPS devices, trips, fuel, maintenance, driver behaviour) and school transport (bus tracking and parent notifications). School transport processes children's data and needs verifiable parental consent under India's DPDP Act and its own privacy review.

## 6. Mobile field app (Expo)

- **Navigation:** at most five bottom tabs: Home, Tasks, Customers, Requests (leave, expenses, regularizations) and More. Manager mode replaces Tasks with Team.
- **Sign-in:** the tenant's allowed methods, device binding, biometric app lock, language switch.
- **Home:** punch card (front-camera selfie with an optional liveness check, date-time and address watermark, location and fence validation, a comment when required), today's schedule, break timer, alerts.
- **Tracking:** an Android foreground service of type location with a persistent notification while punched in; iOS "Always" authorization with significant-change fallback. Show a prominent disclosure screen explaining what is collected and when before asking for background location. Tracking stops at punch-out.
- **Tasks:** Today, Pending, Upcoming, Overdue and Completed tabs; start, check-in, complete and check-out; dynamic forms with every field type (signature, barcode and QR scan, geo-stamped photos, voice notes); OTP completion; hand-off to the phone's navigation app.
- **Customers and contacts:** list, detail and create per settings; nearby customers; call and WhatsApp shortcuts.
- **Requests:** expenses (receipt capture, submit, approval tracking), leave (balances, apply with live validation, calendar, cancel), attendance history and regularization requests, timesheet activities and breaks.
- **Call-log sync** in the Android build described in 5.14.
- **Manager mode:** team live status, approvals inbox, team map, employee day ribbon.
- **Offline-first:** every mutation goes to an SQLite queue with an idempotency key and the device timestamp; a visible sync indicator; conflict rules (the server wins for configuration; client evidence such as offline punches is kept and flagged).
- **Security and privacy:** "exclude from recent screens" setting (ref 96), root and jailbreak detection that flags rather than blocks, mock-location detection, an in-app "My data" screen.
- **Accessibility:** 44 pt minimum touch targets, dynamic type, sufficient contrast, screen-reader labels.

## 7. Desktop agent (Electron)

- **Install and pair:** MSI and PKG packages for silent MDM rollout plus a normal installer; pair by signing in or with an 8-character code from the web console; auto-update with signed builds (Authenticode on Windows, notarization on macOS).
- **Tray app:** punch in and out, start and end breaks by break type, today's totals, and a "What's being captured" panel showing activity counts, apps, and today's screenshots as thumbnails.
- **Capture rules:** only while punched in and inside allowed hours; paused during breaks, screen lock and sleep.
- **Activity:** per-second input counters rolled into 2-minute buckets; idle from the operating system's idle time and the shift's continuous-idle threshold; foreground app name and executable; window title handled per tenant setting; browser domain from the extension; the agent's own windows are excluded.
- **Screenshots** per policy: interval, blur applied on the device before upload, multi-monitor support, and a default deny-list (password managers, banking and health sites) that is never captured.
- **Reliability:** a 7-day SQLite buffer, batched uploads with backoff, a heartbeat every 60 s, "last synced" visible to managers; tamper signals (agent killed, clock changed, data gaps) are logged as events, never hidden.
- **Budget:** under 2% average CPU, under 200 MB RAM, under 50 MB of upload per day with screenshots every 10 minutes.
- **Hard limits:** no stealth or hidden mode, no keystroke content, no webcam or microphone access.

## 8. Browser extension (Manifest V3)

Chrome and Edge first. The extension reports the active tab's domain (the full URL path only if the tenant enables it and employees have been notified) to the desktop agent through native messaging, and it is active only while the agent reports the employee as punched in. Incognito windows are excluded unless the tenant explicitly allows them. The popup shows the current tracking state.

## 9. Data model (core tables)

Every tenant table has `id` (UUIDv7), `tenant_id`, `created_at`, `created_by`, `updated_at`, `updated_by`, `deleted_at`, `deleted_by`, `delete_reason` and `version` (optimistic locking).

- **Identity and organization:** tenants, tenant_domains, tenant_branding, users, user_identities (OAuth and SSO), sessions, devices, employees, employee_history (effective-dated organization attributes), departments, designations, teams, team_members, work_locations, business_units, cost_centers, employee_types, employment_types, roles, role_permissions, user_roles, custom_field_defs, sequences, settings.
- **Time:** shifts, shift_versions (rules as JSONB), shift_assignments, punches (partitioned), attendance_days, attendance_overrides, regularization_requests, attendance_policies, policy_versions, policy_results, leave_sessions, leave_profiles, leave_profile_members, holidays, holiday_profiles, non_working_rules, leave_types, leave_type_versions (entitlement and restriction JSONB), leave_ledger, leave_balances (materialized), leave_requests, leave_request_days, comp_off_requests, break_types, timesheets, timesheet_entries, projects, project_activities, project_members.
- **Field:** location_points (partitioned), location_stops, daily_travel, geo_fences (geography), fence_events, tasks, task_assignees, task_stages, task_events, task_comments, check_ins, customers, contacts, customer_contacts, customer_locations.
- **Finance:** expense_types, expense_claims, expense_items, reimbursements.
- **Calls:** call_logs (partitioned), call_ignore_numbers, telephony_accounts, telephony_calls.
- **Desktop:** agent_installs, activity_buckets (partitioned), app_catalog, app_classifications, screenshots, daily_productivity, daily_app_usage.
- **Platform features:** forms, form_versions, form_submissions, workflows, workflow_versions, workflow_instances, workflow_steps, notification_rules, notifications, notification_deliveries, message_templates, email_messages, email_suppressions, feed_events (partitioned), reports, report_runs, report_schedules, analytics_folders, analytics_items, analytics_shares, dashboards, dashboard_widgets, saved_views, attachments, import_jobs, export_jobs, api_keys, webhooks, webhook_deliveries, audit_log (partitioned), outbox.
- **Suite expansion:** leads, lead_sources, lead_assignment_rules, opportunities, opportunity_items, targets, target_progress (materialized), beat_plans, beat_plan_customers, beat_runs, whatsapp_conversations, whatsapp_messages, whatsapp_templates, opt_ins, salary_components, salary_structures, employee_salaries, statutory_configs (versioned), pay_runs, pay_run_lines, payslips, onboarding_templates, onboarding_journeys, onboarding_tasks, employee_documents, policies, policy_versions, policy_acknowledgements, cases, case_events, sla_policies, assets, asset_categories, vendors, asset_allocations, asset_maintenance, connectors, connector_credentials (encrypted), connector_runs.
- **Platform and accounts** (platform schema, outside tenant RLS): platform_users, platform_roles, platform_sessions, support_sessions (company, staff, reason, start, end), resellers, company_groups, company_group_members, tenants (lifecycle state, plan, limits, owner membership), tenant_limits, memberships (user, tenant, roles, status, employee_id), invitations, ownership_transfers, platform_audit_log.
- **Billing** (platform schema, outside tenant RLS): plans, modules, bundles, bundle_modules, subscriptions, subscription_items (seats per bundle), seat_assignments, invoices, invoice_lines, payments, credit_notes, coupons, resellers, reseller_tenants, dunning_events, usage_meters.
- **Indexes:** composite indexes led by `tenant_id` on every query path; GiST on geography columns; BRIN on the time columns of partitioned tables; pg_trgm on searchable names and phone numbers.

## 10. API design

- Two API surfaces: `/v1` for company-scoped calls and `/platform/v1` for the master admin console, each with its own token audience that the other rejects. Company switching is `POST /v1/auth/switch-company`, which returns a new token for the chosen membership.
- REST under `/v1`. OpenAPI 3.1 is generated from NestJS decorators and the shared zod schemas, and `packages/sdk` is regenerated from it on every build.
- **Auth:** 15-minute JWT access tokens and rotating refresh tokens (httpOnly cookie on web, secure storage on mobile and desktop); device-bound tokens for mobile and desktop; scoped API keys for integrations.
- **Conventions:** cursor pagination (`limit`, `cursor`, and `include_total=true` on demand); filters as `filter[field][op]=value` with `eq, ne, in, nin, gt, gte, lt, lte, between, contains, empty`; sorting `sort=-created_at,name`; sparse fields `fields=`; expansions `expand=manager,department`.
- **Errors:** RFC 9457 problem details with a stable `code`, plus per-field validation errors.
- `Idempotency-Key` is required on every mobile and desktop mutation.
- Rate limits per token and per tenant, with separate quotas for ingest.
- **Webhooks:** HMAC-SHA256 signatures with a timestamp; retries with exponential backoff for 24 hours; delivery log and replay. Events mirror domain events (`punch.created`, `attendance.day_finalized`, `leave.approved`, `task.completed`, `expense.approved`, `employee.created` and so on).
- **Resource map** (standard CRUD unless actions are listed): auth, me, employees (invite, import, exit, restore), organization lookups, shifts (assignments), punches (web punch), attendance-days (override, monthly register), regularizations (approve, reject), policies (publish, rerun), leave-types, leave-profiles, holidays, non-working-rules, leave-requests (approve, reject, cancel), leave-balances, timesheets (submit, approve), break-types, projects, tasks (start, check-in, complete, check-out, bulk), customers (merge), contacts, expenses (submit, approve), calls, ignore-list, geo-fences, locations (live, history), travel (daily), productivity (daily, timeline), screenshots, apps (classify), forms, workflows, notification-rules, templates, reports (runs, schedules), analytics, dashboards, feed, audit, settings, billing (seats, invoices), and `ingest/*` for batched device data.

## 11. Background jobs

BullMQ; every job is idempotent and runs against each tenant's timezone.
- Auto punch-out per shift rule, every 5 minutes.
- Missed-punch reminders, late alerts and "no location update" alerts.
- Attendance day finalization and the policy engine: nightly at each tenant's local midnight, plus on-demand reruns.
- Leave accruals, comp-off expiry, and carry-forward and lapse at session end.
- Rollups (daily travel with stops and distance, daily productivity, app usage, call stats, task stats): incremental every 10 minutes for the current day, final at day close.
- Reverse-geocoding queue with caching.
- Screenshot processing (thumbnails, blur verification) and retention purge.
- Recycle-bin purge after 30 days, and retention enforcement per data class.
- Report runs, schedules and export jobs.
- Notification fan-out, delivery retries and email bounce processing.
- Webhook delivery and retries.
- Billing: renewal invoices, dunning steps, seat reconciliation, usage metering.
- Birthday and anniversary digests.
- Daily backup verification report.

## 12. Realtime

Socket.IO with one namespace per tenant and rooms per scope: presence (online, offline, on break), live locations (throttled to one update per employee every 15 seconds for viewers), feed events, notification badges and job completion. Subscriptions are authorized by the same ScopeResolver as REST.

## 13. Design system

**Brief.** Field operations measured in time and distance, shown densely. The visual vocabulary comes from route maps and railway timetables: a paper-like canvas, route-line accents and precise figures. One element carries the personality, the day ribbon; everything around it stays quiet.

**Token architecture.** `packages/tokens` holds three layers: primitive (raw values), semantic (purpose) and component. Components reference only semantic or component tokens, and a lint rule rejects raw colour values in component code. Light, dark and high-contrast themes redefine semantic tokens only. White-label tenants override only the `--brand-*` semantic tokens, and a contrast check (4.5:1 for text, 3:1 for UI elements) must pass before an override is saved.

**Core palette** (contrast ratios measured against white):

| Token | Hex | Role |
|---|---|---|
| Ink | #17212B | Primary text (16.3:1) |
| Slate | #52606D | Secondary text and icons (6.5:1) |
| Paper | #F6F7F3 | App background |
| Surface | #FFFFFF | Panels, tables, drawers |
| Rule | #E2E5DF | Borders and dividers |
| Petrol | #0F5E73 | Primary actions, links, selection (7.3:1) |
| Marigold | #F2A516 | Live and "now" accents only: live pins, the current-time line, the active punch state. Never text on light backgrounds; Ink on Marigold is 7.9:1 |

**Status colours** (each at least 4.5:1 as text on Surface; always paired with a letter code or icon, never colour alone):

| Status | Hex |
|---|---|
| Present, productive | #1B7F45 |
| Absent, unproductive | #C8372D |
| Leave | #9A6414 |
| Late, policy mark | #B8501F |
| Holiday | #6D5BD0 |
| Non-working | #6B7580 |
| Pending | #2B6CB0 |
| Idle | Diagonal hatch in Slate at 30% |

Use status colours as text only on Surface. In register cells and status chips, use a 14% tint of the status colour as the background, a 2 px bottom rule in the full status colour, and the letter code in Ink. A status colour on its own tint drops to about 4.1:1, which fails AA for small text.

**Typography.**
- One family: Anek (Ek Type; variable weight and width). Anek Latin for the interface, with Anek Tamil and Anek Devanagari for Tamil and Hindi, so mixed-script screens stay coherent.
- Data tables use a semi-condensed width (wdth around 87.5) to fit ten or more columns without truncation; headings use the normal width.
- Every number in tables, KPIs, timers and timelines uses tabular figures (`font-variant-numeric: tabular-nums`). Check Anek's tabular-figure support in Phase 0; if it is missing, assign a tabular-capable face to a `--font-numeric` token and record an ADR.
- Web scale in px: 12 for captions and legends, 13 for table text, 14 for body, 16 for section titles, 20 for page titles, 28 for KPI figures. Line height 1.35 in tables and 1.5 in body text. Mobile body text starts at 16. Sentence case everywhere; no all-caps labels.

**Layout.**

```
+----------+--------------------------------------------------------+
| sidebar  | top bar: search (Ctrl+K), punch widget, mode, alerts   |
| (groups, +--------------------------------------------------------+
|  or a    | page header: title / scope / one primary action        |
|  72px    | filter bar: chips, date preset, saved view             |
|  rail)   | content: table | board | map | ribbon | register       |
+----------+--------------------------------------------------------+
```

- Left-aligned content on an 8 px spacing grid with 24 px content gutters.
- Group content with rules and whitespace instead of boxing everything in cards. Radius follows hierarchy: 4 px for inputs, 6 px for buttons, 10 px for drawers and popovers, full pill for chips. Shadows appear only on overlays.
- KPIs sit in a single ruled band of tabular figures with signed delta chips (arrow, sign and colour), not a grid of identical boxed tiles.
- Charts use an ECharts theme generated from tokens: lines and areas for trends, bars for comparisons, no 3D, tooltips everywhere, direct labels where space allows, a colour-blind-safe series order, and a text summary for screen readers.

**Responsive and adaptive layout (mandatory).** Every screen in the console, platform console and marketing site must work at every width from 320 px to 5120 px, in portrait and landscape, at browser zoom up to 200%, with no page-level horizontal scroll. A screen is not done until it passes the device matrix below.
- **Width breakpoints:** xs below 480, sm 480 to 767, md 768 to 1023, lg 1024 to 1279, xl 1280 to 1535, 2xl 1536 to 1919, 3xl 1920 and up. **Height:** a `short` variant below 560 px tall (landscape phones, split screens) compacts the top bar and moves secondary panels into sheets.
- **Container queries:** components respond to their container, not only the viewport, so a widget behaves the same in a drawer, a dashboard column or a full page.
- **Fluid type and spacing** with `clamp()` between the mobile and desktop scale steps.
- **Wide and ultrawide (21:9, 32:9):** forms and reading content cap at about 960 px and centre; data-heavy views (tables, register, timelines, maps, dashboards) use the full width, and dashboards add grid columns (1, 2, 3, 4, then 6) rather than stretching widgets.
- **Per-component patterns:**
  - Tables: below md, each row becomes a card with 3 or 4 key fields and an expand control; md to lg, horizontal scroll inside the table with a sticky first column; lg and up, the full table with the column chooser.
  - Monthly register and timelines: sticky name column with horizontal scroll; below md, a week view with a date pager.
  - Forms: one column below lg, two columns at lg and up; a sticky bottom action bar on phones.
  - Drawers and modals: full-screen sheets below md.
  - Filters: a filter bar at md and up; a Filters button that opens a bottom sheet below md.
  - Maps: full-bleed, with the control panel as a draggable bottom sheet below md.
  - KPI band: wraps to two columns below md.
- **Touch:** 44 px minimum targets, no hover-only affordances, safe-area insets on notched devices, state kept across orientation changes.
- **Never block zoom:** no `user-scalable=no` and no `maximum-scale` below 5 (the reference's marketing site sets `user-scalable=no`).
- **Device matrix** (Playwright screenshots plus an automated check that `document.documentElement.scrollWidth <= window.innerWidth`): 320x568, 360x800, 390x844, 412x915, 844x390, 915x412, 768x1024, 1024x768, 820x1180, 1180x820, 1280x800, 1366x768, 1440x900, 1920x1080, 2560x1080, 3440x1440, 5120x1440, 3840x2160, and 1280x800 at 200% zoom. It runs in CI on every pull request that touches UI, and failures block the merge.

**Signature component: the day ribbon.** A horizontal band per employee per day on a time axis. Segments: travel (Petrol), on-site visit (Marigold outline with the customer's initial), productive (Present green), neutral (Slate tint), unproductive (Absent tint), idle (hatch), break (Holiday violet), unrecorded (dotted outline). Punch-in and punch-out are pin markers, and the current time is a Marigold line. Hover shows segment details; click opens the detail drawer. It appears in the team timeline, the employee profile, the live-map drawer, the Home "Live now" widget and mobile manager mode. Build it once in `packages/ui`, with canvas rendering for more than 200 rows.

**Component inventory** (`packages/ui`; each with default, hover, focus-visible, active, disabled, loading and error states, full keyboard support and a Storybook page): Button, IconButton (always labelled), Input, Select and async Combobox, DateRangePicker with presets, TimePicker, FilterChipBar, DataTable, Drawer, Modal, Tabs, SegmentedControl, Toggle with help tooltip, StatusPill (colour plus code), KpiBand, chart wrappers, Map (layers, clusters, popovers), DayRibbon, TeamTimeline, MonthCalendar, AttendanceRegister, FormBuilder, FormRenderer (web and mobile parity), WorkflowCanvas, EmptyState, Skeleton, Toast, CommandPalette, Avatar with presence dot, Stepper, FileUpload with camera option, Lightbox for selfies and screenshots.

**Motion.** 150 to 200 ms ease-out for responses to user actions. The only ambient motion is the live-pin pulse on the map. Respect `prefers-reduced-motion`.

**Voice.** Plain verbs, sentence case, and buttons named for their outcome ("Approve leave", "Publish policy", "Punch in"); the same verb carries through a flow, so "Publish" produces "Published". Errors say what happened and how to fix it, without apologizing. Empty states suggest the next step ("No holidays for 2026 yet. Add them or import your state's list.").

**Accessibility.** WCAG 2.2 AA, axe checks in CI, and full keyboard operation of tables, calendars, the register, the form builder and the workflow canvas.

**Optional tooling.** If the UI/UX Pro Max skill is installed, run its design-system query for a data-dense B2B dashboard and reconcile any conflicts with these tokens in an ADR before building `packages/ui`. If the 21st.dev Magic MCP server is configured, use it only to scaffold component structure, then restyle with these tokens.

## 14. Security, privacy and compliance

- **Isolation and encryption:** RLS plus the isolation test suite; envelope encryption with per-tenant keys for sensitive columns (home location, selfie metadata, any bank details added later); TLS everywhere; private object storage reached only through signed URLs that expire within 5 minutes.
- **Application security:** OWASP ASVS level 2 as the bar; dependency, static-analysis and secret scanning in CI; CSP and HSTS; SSRF protection on outgoing webhooks; rate limits and account lockout; mandatory 2FA for admins; every admin action audited.
- **Monitoring transparency:** a notice-and-acknowledgement screen on first launch of the mobile app and the desktop agent that lists exactly what is collected and when; a "My data" page where employees see their own locations, activity, screenshots and retention periods; tracking strictly bounded to punched-in time; no keystroke content, no webcam or microphone, no covert mode.
- **Retention defaults** (tenant-configurable within limits): raw locations 90 days, screenshots 30 days, activity buckets 180 days, call logs 1 year, daily facts 3 years, audit log 3 years.
- **India:** design for the Digital Personal Data Protection Act, 2023 and its Rules: clear notices, purpose limitation, retention and erasure, breach notification, a grievance contact, and data-principal requests handled through a privacy center. For EU or UK customers, add a GDPR data processing agreement, standard contractual clauses and a data-residency option. Have counsel confirm current obligations before launch.
- **App stores:** Android background-location prominent disclosure and the Play Console declaration; foreground-service type declaration; call-log handling per 5.14; iOS location purpose strings; accurate Play data-safety and App Store privacy labels.
- **Operations:** an incident runbook and a breach-notification workflow in the platform console.

## 15. Non-functional requirements

- **API:** p95 under 300 ms for reads and under 500 ms for writes at 200 requests per second sustained; ingest sustains 2,000 location points per second per API node.
- **Web:** dashboards for 5,000 employees over month-to-date render in under 2 s at p95 (served from rollups); the monthly register for 1,000 employees renders in under 2 s (virtualized); initial JavaScript stays under 250 KB gzipped per route.
- **Mobile:** tracking target under 8% battery over an 8-hour shift on a mid-range Android phone; cold start under 2.5 s; a punch with selfie completes in under 10 s.
- **Desktop agent:** the budgets in Section 7.
- **Availability and recovery:** 99.9% monthly; RPO 15 minutes; RTO 4 hours; zero-downtime deploys for API and web.
- **Scale path:** read replicas for reports, partition pruning, object-storage lifecycle rules.
- **Observability:** dashboards for ingest lag, queue depth, error rate and p95 latency per module, with alerts linked to runbooks.

## 16. Testing and quality gates

- **Rules engines** (`packages/rules`): 95% branch coverage with golden fixture files covering night shifts across midnight, tenants in different timezones, half-day leave combined with half-day presence, sandwich rules, late-mark thresholds, auto punch-out, regularization after the cycle is locked, comp-off expiry, accrual for mid-month joiners, experience tiers and carry-forward caps.
- **Integration:** Testcontainers (PostgreSQL with PostGIS, Redis, MinIO), the tenant-isolation suite, and a permission and scope matrix generated from the permission registry.
- **Contracts:** tests against the OpenAPI document and a compile check of the SDK.
- **End to end:** Playwright for onboarding, web punch, leave apply and approve, the task lifecycle, expense approval, report runs and seat changes; Maestro for mobile punch with selfie, offline task completion and sync; a harness for the desktop agent with simulated input.
- **Load:** k6 for ingest and dashboards, plus a 24-hour soak test.
- **Accessibility and security:** axe in CI and a manual keyboard pass every phase; an OWASP ZAP baseline scan on staging; a dependency audit gate.
- **Every pull request:** typecheck, lint, tests, bundle-size budget, migration check, reviewed OpenAPI diff.

## 17. Delivery plan

| Phase | Scope | Exit criteria |
|---|---|---|
| 0. Foundations | Monorepo with the folder conventions in 2.1, the account hierarchy in 1.3 (platform realm, companies, company groups, users, memberships, invitations, company switcher, support sessions), CI/CD, Docker Compose, tokens and UI kit with Storybook, app shell with collapsible sidebar, icon rail and module launcher (4.1), CRUD kit for API, web and mobile, responsive device-matrix tests, auth (OTP, password, Google, Microsoft), tenancy with RLS, roles and scopes, settings registry, audit log, sequences, soft delete and recycle bins, OpenAPI and SDK, i18n scaffold (en, ta, hi), observability, seed script with the demo tenant | Isolation suite passes; a demo admin signs in, creates an employee and sees the audit entry; the shell and one CRUD entity pass the full device matrix; the Vintorex master admin creates two companies, each owner invites an employee, and a user with memberships in both switches between them without seeing the other company's data |
| 1. People, shifts, attendance | Organization objects; employees (import, invite, exit, restore); shifts with every restriction; punches from web and mobile (selfie, location, fences); daily log; monthly register; regularizations; holidays and non-working days; auto punch-out; feed v1 | Full punch lifecycle proven on Android and iOS; register output matches the golden fixtures |
| 2. Leave and policies | Sessions, profiles, types (entitlement and restrictions), accruals, requests and approvals, calendar, balances, attendance policy engine with versions, re-run tool, payroll export | Every leave and policy golden test passes; payroll XLSX validated |
| 3. Field operations | Background tracking, stops, travel facts, live map with layers, geo-fences, customers and contacts (settings, duplicates, remote ID), tasks and visits (list, board, calendar, OTP, forms), form builder and custom fields | Eight-hour field test on five devices within the battery target; routes and stops accurate on the map |
| 4. Money and automation | Expenses; workflow designer and engine (expense, leave, regularization, timesheet); notification rules; templates; email, SMS and WhatsApp adapters; customer notifications; email audit | Multi-level approvals with escalation and delegation work end to end |
| 5. Desktop productivity | Agent for Windows and macOS, extension, ingestion, classification, day view, team timeline, team productivity, screenshots, timesheets, breaks, projects | Agent stays within budget for a full day on a 4 GB Windows laptop; notice and "What's being captured" panel verified |
| 6. Calls | Android call-log build, ignore list, number matching, cloud-telephony adapter, call dashboards | Calls appear within 2 minutes of ending; ignored numbers never leave the device |
| 7. Insights | Home widgets, dashboard tabs, report center with the full catalogue, schedules, analytics builder, saved map views | Every Appendix B report generates within 60 s on a synthetic 1,000-employee tenant |
| 8. Commercial | Plans, modules, bundles, seat enforcement, Razorpay and Stripe, GST invoices, dunning, platform console, resellers and white-label (domains, branding, sender), marketing site, signup, trial, onboarding wizard, tours | Signup to trial to paid works in test mode; entitlements enforced on web, mobile and desktop |
| 9. Hardening and launch | Performance to budget, security review, privacy center, accessibility audit, translations, help center, runbooks, restore drill, store submissions | Launch checklist signed off |
| 10. Sales CRM suite | Leads, opportunities, targets, beat planning with route optimization, WhatsApp inbox, lead-source and spreadsheet connectors | A lead from each connector is captured, deduplicated, auto-assigned and converted to a customer and an opportunity |
| 11. HR suite | Payroll (structures, statutory, pay run, payslips, bank file), onboarding, policy centre, HRMS connectors | Payroll golden tests pass for at least three states and a payroll professional has reviewed the output |
| 12. Service suite | Help desk cases with SLA, assets with allocation and depreciation | Case lifecycle with SLA-breach alerts and a linked field visit works end to end |

## 18. Seed and demo data

A demo tenant, "Meridian Distributors (demo)", with three work locations in Tamil Nadu (Chennai, Coimbatore, Madurai), 40 employees across both example bundles, two shifts (Field 09:30 to 18:30, Office 10:00 to 19:00), three leave types, 2026 holidays, 300 customers, 1,500 tasks, 60 days of synthetic GPS routes generated along real roads through the routing provider, desktop activity for 15 office staff, calls, and expenses in every workflow state. Generate names and numbers with an Indian-locale faker and never use real people's data. Trial tenants get a "Reset demo data" action. Platform seed: one Vintorex master admin (2FA required), one support agent, one reseller, three demo companies on different plans (trial, active, past due), one company group joining two of them, and one user with memberships in two companies.

## 19. Definition of done (every feature)

- Permission and scope enforced on the server and reflected in the UI.
- Validation from the shared zod schemas, with readable errors.
- Audit entries written and visible in the Audit history tab.
- Loading, empty and error states designed.
- Mobile parity wherever the feature exists on mobile.
- Every string translatable (en, ta, hi).
- Tests at the right level, a help-center article and a changelog entry.
- Filters reflected in the URL; export available on list screens.
- Performance budget met.
- Passes the responsive device matrix (Section 13) with no page-level horizontal scroll, and works with the sidebar expanded, as an icon rail and hidden.
- Follows the folder conventions in 2.1 and uses the CRUD kit, or has an ADR explaining why not.

## Appendix A. Settings catalogue (carry over, grouped by intent)

| Section | Settings |
|---|---|
| Account | Distance unit, timezone, DSR report field, minimum and maximum mobile-number length, default language, show work-location identifier, hide the holiday, birthday and work-anniversary widgets |
| Customer | Unique fields, visible fields, mandatory fields, fields appended in pickers, default country code, customer without name, contact phone required, show and search remote ID, link remote ID, manage contacts, gallery option for check-in photos, searchable fields, fields on the mobile list and detail, geo address source (employee, check-in, task, none), access scope |
| Contact | Unique, mandatory and visible fields; mobile visibility (all, my reportees, same team); disable creation on mobile; default country code |
| Expense | Currency, PDF orientation, PDF in order-form details, payment tab on mobile, common PDF fields, common fields visible to managers, common expense form fields |
| Task: execution | Complete on behalf of employee, complete in-progress tasks on behalf, repeat task on start time, accuracy from check-in position or task position, OTP completion, remove "skip OTP", payment field, overdue evaluation rule |
| Task: restrictions | Punch-out blocked while tasks are pending, start blocked before start time or after end time, creation blocked on approved leave, location restriction, form restrictions for admins and managers, employee restrictions, edit requests for completed tasks |
| Task: visibility | Current-month visibility by end date, overdue access for managers on mobile, work-location-based visibility, customer-filter-based visibility, hide customer from employee, edit rights for functional managers, today-pending tab on mobile |
| Task: features | Reminders, bulk upload, edit, delete, comments, workflow, calendar, dashboard, assign to group, distribution lists, activity alerts, images, JSON field, in-progress status, document ZIP download, images in Excel, priority, customer contact, task download, export of picture fields, customer owner in bulk upload, employee stage audit |
| Task: display | Title pattern, download naming pattern, type sorting, stage colours on the board, status colour overrides, custom colour fields, common task form fields, location-analytics field mapping, board card fields |
| Check-in | Time restriction window |
| Mobile app | Exclude from recent screens |
| Cloud calling | Provider, list display options, rollout restriction by employee, team, department, designation and work location |
| Date formats | Productivity and task reports; attendance and distance reports |
| Attendance | Month start day, override start and end day, approval required by default, restrict regularization, regularization window override, stop employees editing punch times, approval message optional, manager restriction, late marks in the register, override non-working days, work anniversaries in calendars, block punch-in on approved leave, re-run policies, total present column, status symbol and colour table |
| Leave | Session range, carry-forward processing date, apply against the previous session, leave type in Excel export |
| Employee profile | Mandatory fields, fields employees may self-edit, mobile profile fields, block profile edits on mobile |
| Sign-in | Mobile OTP, email OTP, password, Google, Microsoft, SAML or OIDC (enterprise) |
| Geo | Check-in geo-match distance and mode, task-completion geo match, employee fence requests |
| Customer notifications | Punch in and out; leave applied and actioned; expense applied, approved and rejected; check-in and check-out forms; task started and completed |
| Desktop | Consider productive time, window-title handling, full-URL tracking, screenshot policy, sensitive-app deny list |

## Appendix B. Report catalogue (70 templates)

The reference's catalogue uses the same categories, with counts such as 21 productivity, 11 task and 8 travel reports (refs 39, 40). The list below includes the reports visible there and completes each category. Ship at least these:

- **Productivity and activity (21):** consolidated productivity (attendance plus visits per day), DSR daily activity report (Excel), daily productivity, daily productivity by day, employee day summary, punch log, late arrivals, early departures, break summary, break violations, timesheet summary, timesheet activity detail, project hours, desktop productivity by day, desktop productivity by employee, app usage, website usage, idle time, unrecorded time, screenshot index, activity feed export.
- **Task (11):** task detail, tasks by employee, tasks by type, overdue tasks, task form submissions by type, customer visits, check-in and check-out, OTP-verified completions, stage audit, repeat-task compliance, payment collections.
- **Travel (8):** distance by date (recorded versus estimated, with travel time), geo points (log-level points with address), distance by employee, stoppages of 10 minutes or more, route export (GPX, KML), GPS-off and mock-location events, fence entries and exits, travel allowance calculation.
- **Attendance (8):** daily attendance, monthly register for payroll, attendance summary, regularization requests, late marks and deductions, overtime, auto punch-out log, absentees.
- **Employee master (6):** joining, exit, active employees, deleted employees, organization structure, device and app status.
- **Leave (6):** leave status, compensatory leave, pending approvals, balances, ledger, holiday list.
- **Expense (5):** expenses, pending approval, approved, stage-wise audit, reimbursement status.
- **Customers and calls (5):** customer master, customer coverage (visited and not visited), contact master, call detail, call summary by employee.

## Appendix C. Attendance status codes

| Code | Meaning | Colour token |
|---|---|---|
| P | Present | present |
| HP | Half-day present | present |
| AB (A in summaries) | Absent | absent |
| AH | Absent for half the day | absent |
| L | Full-day leave | leave |
| HL | Half-day leave | leave |
| H | Holiday | holiday |
| NW | Non-working day | non-working |
| LM | Late mark | late |
| LMP | Late mark counted by policy | late |
| D | Deduction applied by policy | late |
| AP | Approved present (regularized) | present |
| PA | Pending approval | pending |
| PUL | Pending unpaid leave | pending |
| NJ | Not joined yet (before the date of joining) | non-working |
| OA, ONW, OH | Overridden to absent, to non-working day, or to holiday (the cell shows an override marker) | the target status |

## Appendix D. Form field types

Text, text area, number, currency amount, email, mobile, URL, date, date range, date and time, time, day, duration, yes/no, single select (list), multiple select, rating, signature, barcode and QR scan, picture, picture with geo stamp, multiple pictures, multiple pictures with geo stamp, document upload, voice note, location pin, country, state, district, city, customer picker, customer contact picker, employee picker, team or department picker, custom lookup list, static label, section break, calculated field (formula), payment.

## Appendix E. Reference website capability map (trackolap.com, reviewed 28 September 2026)

Captured to define parity. Use it for scope and for the marketing site's structure; do not copy its wording, visuals or names.

- **Suites and modules.** Sales CRM: lead management, opportunity management, task management, live tracking, field sales automation, expense management, target management, beat planning, WhatsApp CRM. HR management: payroll, employee onboarding, policy centre, attendance and leave. Remote team management: time tracking, project management, employee productivity, employee monitoring. IT and help desk: customer service (cases), asset management. Other products: inventory, fleet, school transport.
- **All-in-one plan feature list** (as advertised): geo attendance with selfie and geo restrictions; late and early punch-out policies; regularization; multiple leave types and policies; live location, route playback, stoppages and speed violations; distance and scheduled reports; custom forms; bulk task assignment and employee-created planned tasks; check-in and check-out; employee and manager dashboards; multiple workflows with stage-wise restrictions; lead bulk upload, integration-driven lead creation, bulk assignment, lead board and follow-ups; geofences; punch-in and idle alerts; salary structures, PF, ESI, professional tax, monthly pay run and payslips; policy upload with acknowledgements and view counts; multi-level hierarchy and multiple timezones; computer-based and automatic attendance; productive and idle time; automated and blurred screenshots; application and website durations; timesheets with breaks and activities; client projects with hour-based and project-based billing; cases with assignment, stages, tasks and cloud-call recordings; asset database, vendors, allocation and cost analysis.
- **Industries marketed:** finance, insurance, IT, edtech, healthcare, media, telecom, startups, recruitment, plywood, construction, staffing, FMCG, agriculture.
- **Integrations marketed:** Facebook lead ads, TradeIndia, ExportersIndia, IndiaMART, Google Ads, Google Sheets, OneDrive spreadsheets, Calendly, Exotel, CallerDesk, Keka, zingHR, Beehive, greytHR.
- **Commercial signals:** separate pricing per suite plus an all-in-one plan advertised from about US$13 per user per month, billed quarterly or annually; a 7-day free trial; upgrade any time; customer data exportable any time.
- **Brand facts:** the vendor's mobile apps and customer login use the name TrackWick, which is why this product is named Trackrex instead.

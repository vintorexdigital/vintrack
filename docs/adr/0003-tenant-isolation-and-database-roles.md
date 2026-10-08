# ADR 0003: Tenant isolation with forced RLS and four database roles

**Decision.**
- Every tenant table has `tenant_id`, `ENABLE` and `FORCE ROW LEVEL SECURITY`, and one policy `tenant_id = app_tenant_id()`. The API sets `app.tenant_id`, `app.user_id` and `app.employee_id` with `set_config(..., true)` at the start of each transaction, so a pooled connection can never leak one company's context into another.
- Roles: `trackrex_app` (company API, no BYPASSRLS), `trackrex_platform` (platform console; granted only the `platform` schema, so a bug there cannot read business data), `trackrex_worker` (BYPASSRLS, reserved for jobs that must cross tenants; the current jobs run per tenant under RLS and do not need it), and the owner role used only for migrations.
- References between tenant tables use composite foreign keys `(tenant_id, id)`, so a cross-company reference is impossible at the database, not just in code.
- `audit_log` and `punches` grant `INSERT` and `SELECT` only to the app role: the audit trail is append-only.
- Master admins read business data only through a support session: a distinct token flagged `sup`, a reason of at least 10 characters, a time box, the company's own opt-in, and a deny list of data prefixes (location, productivity, payroll, calls, reports, feed, punches). The company sees the session and its reason, and switching access off ends it immediately.

**Proof.** `test/isolation.spec.ts` creates two companies and, for every registered CRUD resource, proves company B cannot read, patch, delete, restore or bulk-delete company A's rows. It also attacks the database directly (no context shows no rows, cross-tenant inserts fail with 42501, the platform role cannot select tenant tables, the audit log cannot be updated or deleted).

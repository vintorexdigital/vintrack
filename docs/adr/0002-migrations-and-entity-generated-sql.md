# ADR 0002: Paired SQL migrations, with DDL generated from entity definitions

**Context.** The prompt asks for reversible migrations and for new CRUD entities to be "mostly configuration". `drizzle-kit` generates forward-only SQL and cannot express row-level security, partitioning or same-tenant composite foreign keys.

**Decision.** Migrations are hand-reviewed `NNNN_name.up.sql` and `.down.sql` pairs applied by a small runner (`src/core/database/migrator.ts`). For plain CRUD entities, `entitySql(kit)` generates the table, indexes, tenant isolation policy and grants from the same `defineEntity` definition that drives validation, forms and permissions; an authoring script writes the result into a migration. Drizzle table objects for these entities are built at runtime from the same definition (`tableFromKit`).

**Guards.** `test/migrations.spec.ts` fails when a committed migration drifts from its entity definition, when a Drizzle column has no database column, when a migration lacks a down file, and when any table with a `tenant_id` lacks forced RLS and a policy. CI also migrates up and fully down.

**Consequences.** Adding an entity is one definition file plus one generated migration. Operational tables (punches, attendance days, ledger) are written by hand and use Drizzle only through `sql` templates.

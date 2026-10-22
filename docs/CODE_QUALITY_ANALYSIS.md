# Code quality analysis

This review applies SOLID, YAGNI, DRY, CRUD and KISS as decision tools, not as reasons to rewrite working code.

## Current strengths

- Shared entity definitions in `packages/schemas` drive validation, permissions, filters, forms and API behavior. This is the main DRY boundary.
- `CrudController`, `CrudService` and `CrudRepository` separate HTTP, business orchestration and persistence responsibilities. Entity-specific behavior is added through small hooks and subclasses (SOLID).
- Pure business rules live in `packages/rules` and are independently tested.
- The apps share UI, tokens, schemas, client behavior and SDK packages instead of copying implementations.
- Soft delete, restore, bulk actions, audit, optimistic locking and exports are implemented once for all standard resources (complete CRUD behavior).

## Changes from this review

- Corrected the shared export limit so exactly 10,000 rows are allowed and only the 10,001st row causes rejection.
- Kept the fix inside the shared CRUD service and added boundary regression tests. No entity-specific workarounds were introduced.

## Prioritized follow-up

1. Replace package `lint` scripts that currently run `echo ok` with one shared ESLint configuration. Typechecking is real, but the current lint command provides no static-analysis signal.
2. Split only the largest files when a change requires it. `apps/api/scripts/seed.ts` and the marketing home page are large, but size alone is not a reason to add abstractions (YAGNI).
3. Keep provider integrations behind their existing interfaces. Do not add adapters until a real provider is selected and can be integration-tested (KISS/YAGNI).
4. Add boundary tests for shared CRUD paths before expanding them: bulk limits, restore conflicts, export limits and cursor pagination have a wide blast radius.
5. Preserve the existing package boundaries. Business calculations belong in `packages/rules`; transport and persistence details should stay in app layers (dependency inversion and single responsibility).

## Verification standard

For routine changes, run `pnpm typecheck`, the affected package tests, and `pnpm build` when bundling or route behavior changes. Treat `pnpm lint` as informational until the placeholder scripts are replaced.

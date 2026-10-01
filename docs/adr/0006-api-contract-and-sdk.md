# ADR 0006: One schema source for validation, forms, the SDK and OpenAPI

**Decision.** `defineEntity` in `packages/schemas` is the single source for an entity's create, update, read and filter shapes, table columns, form fields and permission keys. The API validates with those schemas, the web renders forms and lists from them, and the SDK is a typed client over the same definitions rather than code generated from the OpenAPI document. `scripts/openapi.ts` still emits an OpenAPI 3.1 document for third-party developers, and a contract test checks that every registered resource appears in it with the same schema.

**Consequences.** There is no second place to edit a field list. The generated OpenAPI describes custom (non-CRUD) routes by path and method only until each is given an explicit request and response schema.

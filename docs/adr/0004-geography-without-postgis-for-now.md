# ADR 0004: Coordinates as doubles and geometry in `packages/rules`; PostGIS deferred

**Context.** The prompt specifies PostGIS. The development and CI sandbox here cannot install the extension, and nothing in Phases 0 to 2 needs a spatial index: geo-fence checks happen on one punch at a time.

**Decision.** Store latitude and longitude as `double precision`. Fence containment (circle and ray-casting polygon), distance, stop detection and speed are pure functions in `packages/rules/src/geo.ts` with tests. The production Compose file already uses the `postgis/postgis` image, so a later migration can add `geography` columns and GiST indexes for the live map and territory queries (Phase 3) without changing the host.

**Consequences.** No spatial queries over many rows yet. When the live map lands, add `geography(Point)` generated columns and a GiST index in a new migration.

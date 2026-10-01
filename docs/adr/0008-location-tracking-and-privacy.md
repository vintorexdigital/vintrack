# 0008. Location tracking, working-time gating and the live map

Status: accepted

## Context
The master prompt requires tracking that is privacy-first: only during working time, visible to the employee, and enforced on the server rather than trusted to the app.

## Decision
- **Ingest gate on the server.** `POST /v1/location/pings` accepts a batch (up to 500, oldest first, for offline catch-up). Each point is kept only if its timestamp falls inside a working interval derived from the employee's punch history (`workingIntervals` in `packages/rules`): from a punch-in to the next punch-out, or to now while still in. Points outside, in the future by more than five minutes, or older than seven days are counted and dropped. The response says how many of each, so apps can stop sending.
- **Company switch.** `geo.tracking_enabled` turns tracking off for the company. The ingest endpoint then stores nothing and says `trackingEnabled: false`. `GET /v1/location/policy` lets the app show the employee whether tracking is on and the interval in force.
- **Storage.** `location_pings` is partitioned monthly (maintained by `maintain_partitions`) and deduplicated by `(tenant, employee, at)`, so a retried batch is harmless. `geo.trail_retention_days` (default 90) is enforced by the `purge-location-history` job. Mock-location points are stored flagged but never move the live pin or enter a trail.
- **Live map.** `live_locations` holds one row per employee, upserted only when the incoming point is newer. Reads honour data scope (`location.live.read`, managers see reportees). An employee is `moving`, `stopped`, `stale` (no point in 15 minutes while punched in) or `off_duty`.
- **Trails.** `GET /v1/location/trail` returns a cleaned track (accuracy and impossible-jump filtering), stops (10 minutes or more within 100 m), distance and travel time, from the rules package, for one employee and attendance date, inside their scope.
- **Map tiles.** The web console uses Leaflet with OpenStreetMap raster tiles by default. `NEXT_PUBLIC_MAP_TILES` swaps in a commercial provider. The public OSM tile server has a usage policy that production traffic should not rely on; this is recorded as a deployment follow-up.

## Consequences
- A malicious or buggy app cannot create a trail outside working hours.
- Raw points are personal data: they are covered by RLS, partition retention and the audit log of who changed settings, but there is no per-read audit of who viewed a trail yet.
- Geofence enter/exit alerts and travel-claim reconciliation (Phase 4) will read the same tables.

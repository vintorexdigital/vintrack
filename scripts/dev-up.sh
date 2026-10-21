#!/usr/bin/env bash
# Bring up the Trackrex local stack. Run in Terminal.app / Cursor terminal (not the agent sandbox).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p var/logs var/cache/swc
export SWC_NATIVE_BINDING_CACHE="$ROOT/var/cache/swc"

"$ROOT/scripts/dev-postgres.sh"

echo "Migrating…"
(cd apps/api && node --import @swc-node/register/esm-register scripts/migrate.ts up)
echo "Seeding…"
(cd apps/api && node --import @swc-node/register/esm-register scripts/seed.ts)

# Stop prior runs
for f in var/logs/*.pid; do
  [[ -f "$f" ]] || continue
  kill "$(cat "$f")" 2>/dev/null || true
done
pkill -f 'next dev -H 127.0.0.1' 2>/dev/null || true
sleep 1

echo "Starting API (4000), web (3000), platform (3001)…"
(
  cd apps/api
  AUTH_DEV_OTP_ECHO=true PORT=4000 \
    node --import @swc-node/register/esm-register src/main.ts \
    >"$ROOT/var/logs/api.log" 2>&1
) &
echo $! > var/logs/api.pid

(cd apps/web && pnpm exec next dev -H 127.0.0.1 -p 3000 >"$ROOT/var/logs/web.log" 2>&1) &
echo $! > var/logs/web.pid

(cd apps/platform && pnpm exec next dev -H 127.0.0.1 -p 3001 >"$ROOT/var/logs/platform.log" 2>&1) &
echo $! > var/logs/platform.pid

echo
echo "Stack starting. Logs: var/logs/"
echo "  Web:      http://127.0.0.1:3000   owner@meridian.test / Trackrex#2026"
echo "  Platform: http://127.0.0.1:3001   admin@vintorex.test / Trackrex#2026"
echo "            TOTP secret: JBSWY3DPEHPK3PXP"
echo "  API:      http://127.0.0.1:4000"
echo
echo "Tail:  tail -f var/logs/*.log"
echo "Stop:  kill \$(cat var/logs/*.pid)"

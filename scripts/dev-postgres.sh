#!/usr/bin/env bash
# Start local Postgres 17 on 127.0.0.1:54329 for Trackrex development.
# Run this in Terminal.app (outside the Cursor agent sandbox).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGDIR="$ROOT/var/local-pg"
BIN="$PGDIR/node_modules/@embedded-postgres/darwin-x64/native/bin"
LIB="$PGDIR/node_modules/@embedded-postgres/darwin-x64/native/lib"
export DYLD_LIBRARY_PATH="$LIB${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
export DYLD_FALLBACK_LIBRARY_PATH="$LIB${DYLD_FALLBACK_LIBRARY_PATH:+:$DYLD_FALLBACK_LIBRARY_PATH}"

if [[ ! -x "$BIN/postgres" ]]; then
  echo "Installing embedded Postgres…"
  mkdir -p "$PGDIR"
  cd "$PGDIR"
  if [[ ! -f package.json ]]; then
    cat > package.json <<'EOF'
{
  "name": "trackrex-local-pg",
  "private": true,
  "type": "module",
  "dependencies": { "embedded-postgres": "^17.6.0-beta.15" }
}
EOF
  fi
  npm install --no-fund --no-audit
  npm approve-scripts @embedded-postgres/darwin-x64 >/dev/null 2>&1 || true
  npm rebuild @embedded-postgres/darwin-x64 >/dev/null 2>&1 || true
fi

# Restore real binary if a previous wrapper left postgres.real behind
if [[ -f "$BIN/postgres.real" ]]; then
  mv -f "$BIN/postgres.real" "$BIN/postgres"
fi

if nc -z 127.0.0.1 54329 2>/dev/null; then
  echo "Postgres already listening on 54329"
  exit 0
fi

if [[ ! -d "$PGDIR/data" ]]; then
  echo "Initializing data directory…"
  "$BIN/initdb" -D "$PGDIR/data" -U postgres --auth=trust --locale=C --encoding=UTF8
  cat >> "$PGDIR/data/postgresql.conf" <<'CONF'
listen_addresses = '127.0.0.1'
port = 54329
CONF
fi

echo "Starting Postgres on 127.0.0.1:54329…"
"$BIN/pg_ctl" -D "$PGDIR/data" -l "$PGDIR/postgres.log" -o "-p 54329" start
sleep 1
"$BIN/createdb" -h 127.0.0.1 -p 54329 -U postgres trackrex 2>/dev/null || true
echo "READY" > "$PGDIR/ready.flag"
echo "Postgres ready: postgres://postgres@127.0.0.1:54329/trackrex"
echo "Stop with: $BIN/pg_ctl -D $PGDIR/data stop"

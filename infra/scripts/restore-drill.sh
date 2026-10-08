#!/usr/bin/env bash
# Proves a backup can actually be restored: dumps the database, restores it into a scratch database, and checks that
# data, row-level security and the partitioned tables came back. Run it regularly; a backup nobody has restored is a hope.
# Usage: DATABASE_URL=postgres://postgres:...@host:5432/trackrex infra/scripts/restore-drill.sh
set -euo pipefail
SRC="${DATABASE_URL:?Set DATABASE_URL to the owner connection string of the database to test}"
BASE="${SRC%/*}"
SCRATCH="restore_drill_$(date +%s)"
DUMP="$(mktemp -t trackrex-dump-XXXXXX.pgdump)"
trap 'psql "$BASE/postgres" -qc "drop database if exists $SCRATCH" >/dev/null 2>&1 || true; rm -f "$DUMP"' EXIT

echo "dumping..."
pg_dump --format=custom --no-owner --file "$DUMP" "$SRC"
echo "restoring into $SCRATCH..."
psql "$BASE/postgres" -qc "create database $SCRATCH"
pg_restore --no-owner --dbname "$BASE/$SCRATCH" "$DUMP"

q() { psql "$BASE/$SCRATCH" -Atc "$1"; }
src_q() { psql "$SRC" -Atc "$1"; }
fail() { echo "FAILED: $1" >&2; exit 1; }

for t in platform.tenants public.employees public.punches public.audit_log platform.invoices; do
  a="$(src_q "select count(*) from $t")"; b="$(q "select count(*) from $t")"
  [ "$a" = "$b" ] || fail "$t has $a rows in the source and $b after restore"
  echo "  $t: $b rows"
done
forced="$(q "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relrowsecurity and c.relforcerowsecurity and n.nspname in ('public','platform')")"
expected="$(src_q "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relrowsecurity and c.relforcerowsecurity and n.nspname in ('public','platform')")"
[ "$forced" = "$expected" ] || fail "forced row-level security on $forced tables after restore, expected $expected"
echo "  forced row-level security on $forced tables"
parts="$(q "select count(*) from pg_inherits i join pg_class p on p.oid = i.inhparent where p.relname in ('punches','audit_log','location_pings')")"
[ "$parts" -gt 0 ] || fail "partitions did not come back"
echo "  $parts partitions"
echo "restore drill passed"

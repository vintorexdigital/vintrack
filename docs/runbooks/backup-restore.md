# Backup and restore

## What to back up
- PostgreSQL: everything business-critical, including invoices, audit logs and partitions. Use `pg_dump --format=custom` nightly at minimum, and WAL archiving if you need point-in-time recovery (the compose file does not set that up).
- The `api_files` volume: selfie images. It is not in the database.
- Redis holds only queues and schedules (BullMQ); losing it loses nothing permanent, the worker re-registers its schedules at start.
- Secrets (`.env`): in your secret manager, not in the backup.

## Restore drill
`infra/scripts/restore-drill.sh` dumps the database named by `DATABASE_URL`, restores it into a scratch database, and fails unless row counts for key tables match, forced row-level security is on the same number of tables, and the partitions are back. Run it on a schedule and after any schema change that touches partitioning or policies. It restores into the same Postgres server; for a true disaster drill, restore onto a fresh host from your off-site copy.

## Recovering
1. Stop `api` and `worker`.
2. Restore the dump into an empty database as the owner role (`pg_restore --no-owner`), then make sure the runtime roles exist with their grants (run migrations `up`; they are idempotent about roles).
3. Restore the `api_files` volume.
4. Start `api` and `worker`. Check `/health`, sign in, open a recent attendance day and a selfie.
Expect to lose whatever happened since the last backup. Mobile and desktop apps keep unsent punches and activity on the device and send them (idempotently) after recovery, within the seven-day offline limit.

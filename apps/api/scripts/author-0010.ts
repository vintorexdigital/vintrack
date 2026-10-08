/** One-off authoring tool: writes migrations/0010_productivity.{up,down}.sql. */
import { writeFileSync } from 'node:fs';
import { appClassifications } from '@trackrex/schemas';
import { entitySql } from '../src/shared/crud/entity-sql.js';

const s = entitySql(appClassifications, new Set(['app_classes']));
const extras = `
-- Desktop activity, one row per employee, minute and application. Partitioned by month.
create table activity_buckets (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  employee_id uuid not null,
  start_at timestamptz not null,
  seconds integer not null check (seconds > 0),
  active_seconds integer not null check (active_seconds >= 0),
  idle_seconds integer not null check (idle_seconds >= 0),
  app text not null,
  domain text,
  url text,
  title text,
  device_id text,
  received_at timestamptz not null default now(),
  primary key (id, start_at)
) partition by range (start_at);
create unique index activity_buckets_dedupe on activity_buckets (tenant_id, employee_id, start_at, app);
create index activity_buckets_employee_time on activity_buckets (tenant_id, employee_id, start_at desc);
create table activity_buckets_default partition of activity_buckets default;
grant select, insert, delete on activity_buckets_default to trackrex_app, trackrex_worker;
select ensure_monthly_partitions('activity_buckets', 1, 3);
alter table activity_buckets enable row level security;
alter table activity_buckets force row level security;
create policy tenant_isolation on activity_buckets using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, delete on activity_buckets to trackrex_app, trackrex_worker;

create or replace function maintain_partitions(months_ahead int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform ensure_audit_partitions(1, months_ahead);
  perform ensure_monthly_partitions('punches', 1, months_ahead);
  perform ensure_monthly_partitions('feed_events', 1, months_ahead);
  perform ensure_monthly_partitions('location_pings', 1, months_ahead);
  perform ensure_monthly_partitions('activity_buckets', 1, months_ahead);
end $$;
`;
const downExtras = `
create or replace function maintain_partitions(months_ahead int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform ensure_audit_partitions(1, months_ahead);
  perform ensure_monthly_partitions('punches', 1, months_ahead);
  perform ensure_monthly_partitions('feed_events', 1, months_ahead);
  perform ensure_monthly_partitions('location_pings', 1, months_ahead);
end $$;
drop table if exists activity_buckets cascade;`;
writeFileSync('migrations/0010_productivity.up.sql', ['-- App classifications and desktop activity.', s.create, s.fks, extras].filter(Boolean).join('\n\n') + '\n');
writeFileSync('migrations/0010_productivity.down.sql', [s.down, downExtras].join('\n') + '\n');
console.log('wrote 0010');

/** One-off authoring tool: writes the entity part of migrations/0018_report_builder.{up,down}.sql (schedules and snapshots are hand-written after it). */
import { writeFileSync } from 'node:fs';
import { dashboards, savedReports } from '@trackrex/schemas';
import { entitySql } from '../src/shared/crud/entity-sql.js';

const known = new Set(['saved_reports', 'dashboards']);
const parts = [savedReports, dashboards].map((k) => entitySql(k, known));
const rls = (t: string, grants = 'select, insert, update, delete') => `alter table ${t} enable row level security;
alter table ${t} force row level security;
create policy tenant_isolation on ${t} using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant ${grants} on ${t} to trackrex_app, trackrex_worker;`;
const extra = `
-- Reports sent to their owner on a schedule. A run stores a snapshot of the result as the owner saw it.
create table report_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  report_id uuid not null,
  owner_user_id uuid not null,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly')),
  weekday int not null default 1 check (weekday between 0 and 6),
  day_of_month int not null default 1 check (day_of_month between 1 and 28),
  hour int not null default 8 check (hour between 0 and 23),
  enabled boolean not null default true,
  next_run_at timestamptz not null,
  last_run_at timestamptz,
  last_status text,
  created_at timestamptz not null default now(),
  unique (tenant_id, report_id, owner_user_id),
  foreign key (tenant_id, report_id) references saved_reports (tenant_id, id) deferrable initially deferred
);
create index report_schedules_due on report_schedules (next_run_at) where enabled;
${rls('report_schedules')}

create table report_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  schedule_id uuid,
  report_id uuid,
  owner_user_id uuid not null,
  name text not null,
  range_from date,
  range_to date,
  columns jsonb not null,
  rows jsonb not null,
  truncated boolean not null default false,
  created_at timestamptz not null default now()
);
create index report_snapshots_owner on report_snapshots (tenant_id, owner_user_id, created_at desc);
${rls('report_snapshots', 'select, insert, delete')}
`;
writeFileSync('migrations/0018_report_builder.up.sql', ['-- Saved reports, dashboards, schedules and snapshots.', ...parts.map((p) => p.create), ...parts.map((p) => p.fks), extra].join('\n\n') + '\n');
writeFileSync('migrations/0018_report_builder.down.sql', ['drop table if exists report_snapshots;', 'drop table if exists report_schedules;', ...[...parts].reverse().map((p) => p.down)].join('\n') + '\n');
console.log('wrote 0018');

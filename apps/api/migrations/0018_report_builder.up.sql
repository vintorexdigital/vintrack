-- Saved reports, dashboards, schedules and snapshots.

create table saved_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null,
  description text,
  visibility text default 'private' check (visibility in ('private', 'company')),
  definition jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  delete_reason text,
  version integer not null default 1,
  unique (tenant_id, id)
);
create index saved_reports_tenant_live on saved_reports (tenant_id) where deleted_at is null;
create index saved_reports_name_sort on saved_reports (tenant_id, name, id);
create index saved_reports_name_trgm on saved_reports using gin (lower(name) gin_trgm_ops);
alter table saved_reports enable row level security;
alter table saved_reports force row level security;
create policy tenant_isolation on saved_reports using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on saved_reports to trackrex_app, trackrex_worker;

create table dashboards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null,
  description text,
  visibility text default 'private' check (visibility in ('private', 'company')),
  widgets jsonb,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  deleted_at timestamptz,
  deleted_by uuid,
  delete_reason text,
  version integer not null default 1,
  unique (tenant_id, id)
);
create index dashboards_tenant_live on dashboards (tenant_id) where deleted_at is null;
create index dashboards_name_sort on dashboards (tenant_id, name, id);
create index dashboards_name_trgm on dashboards using gin (lower(name) gin_trgm_ops);
alter table dashboards enable row level security;
alter table dashboards force row level security;
create policy tenant_isolation on dashboards using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on dashboards to trackrex_app, trackrex_worker;






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
alter table report_schedules enable row level security;
alter table report_schedules force row level security;
create policy tenant_isolation on report_schedules using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on report_schedules to trackrex_app, trackrex_worker;

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
alter table report_snapshots enable row level security;
alter table report_snapshots force row level security;
create policy tenant_isolation on report_snapshots using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, delete on report_snapshots to trackrex_app, trackrex_worker;


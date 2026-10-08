-- App classifications and desktop activity.

create table app_classes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null,
  kind text default 'app' check (kind in ('app', 'domain')),
  app_class text not null default 'neutral' check (app_class in ('productive', 'unproductive', 'neutral')),
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
create index app_classes_tenant_live on app_classes (tenant_id) where deleted_at is null;
create unique index app_classes_name_uq on app_classes (tenant_id, lower(name)) where deleted_at is null and name is not null;
create index app_classes_name_trgm on app_classes using gin (lower(name) gin_trgm_ops);
create index app_classes_app_class_sort on app_classes (tenant_id, app_class, id);
alter table app_classes enable row level security;
alter table app_classes force row level security;
create policy tenant_isolation on app_classes using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on app_classes to trackrex_app, trackrex_worker;


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


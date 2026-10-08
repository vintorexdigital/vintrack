-- Geo-fences and device binding.

create table geo_fences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null,
  fence_type text not null default 'circle' check (fence_type in ('circle', 'polygon')),
  latitude double precision,
  longitude double precision,
  radius_meters double precision default 150,
  polygon jsonb,
  address text,
  work_location_id uuid,
  status text default 'active' check (status in ('active', 'inactive')),
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
create index geo_fences_tenant_live on geo_fences (tenant_id) where deleted_at is null;
create unique index geo_fences_name_uq on geo_fences (tenant_id, lower(name)) where deleted_at is null and name is not null;
create index geo_fences_name_trgm on geo_fences using gin (lower(name) gin_trgm_ops);
create index geo_fences_address_trgm on geo_fences using gin (lower(address) gin_trgm_ops);
create index geo_fences_work_location_id_ref on geo_fences (tenant_id, work_location_id) where work_location_id is not null;
create index geo_fences_status_sort on geo_fences (tenant_id, status, id);
alter table geo_fences enable row level security;
alter table geo_fences force row level security;
create policy tenant_isolation on geo_fences using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on geo_fences to trackrex_app, trackrex_worker;

alter table geo_fences add constraint geo_fences_work_location_id_fk foreign key (tenant_id, work_location_id) references work_locations (tenant_id, id) deferrable initially deferred;


alter table punches add column if not exists fence_matched boolean;

create table devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  employee_id uuid not null,
  device_id text not null,
  platform text not null check (platform in ('android','ios','windows','macos','web')),
  model text,
  app_version text,
  bound_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  foreign key (tenant_id, employee_id) references employees (tenant_id, id)
);
create unique index devices_one_active on devices (tenant_id, employee_id, platform) where revoked_at is null;
create index devices_lookup on devices (tenant_id, device_id);
alter table devices enable row level security;
alter table devices force row level security;
create policy tenant_isolation on devices using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on devices to trackrex_app, trackrex_worker;


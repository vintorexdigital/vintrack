-- Envelope encryption. Each company has data keys (DEKs) that are stored only wrapped by the master key held in the
-- key service. Sensitive location data is sealed with the company's DEK before it reaches these tables.

create table tenant_keys (
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  version int not null,
  wrapped_dek text not null,
  kms_key_id text not null,
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  primary key (tenant_id, version)
);
alter table tenant_keys enable row level security;
alter table tenant_keys force row level security;
create policy tenant_isolation on tenant_keys using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update on tenant_keys to trackrex_app, trackrex_worker;

-- Location points and the live position may now hold coordinates sealed instead of in the clear.
alter table location_pings alter column latitude drop not null;
alter table location_pings alter column longitude drop not null;
alter table location_pings add column sealed text;
alter table location_pings add constraint location_pings_has_position check ((latitude is not null and longitude is not null) or sealed is not null);

alter table live_locations alter column latitude drop not null;
alter table live_locations alter column longitude drop not null;
alter table live_locations add column sealed text;
alter table live_locations add constraint live_locations_has_position check ((latitude is not null and longitude is not null) or sealed is not null);

-- Home location lives here, sealed. employees.home_latitude/home_longitude are legacy and are emptied by the
-- seal-legacy-locations job.
create table employee_private (
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  employee_id uuid not null,
  home_sealed text,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, employee_id),
  foreign key (tenant_id, employee_id) references employees (tenant_id, id) deferrable initially deferred
);
alter table employee_private enable row level security;
alter table employee_private force row level security;
create policy tenant_isolation on employee_private using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on employee_private to trackrex_app, trackrex_worker;

-- The seal-legacy-locations job rewrites old plaintext points as sealed ones.
grant update (latitude, longitude, sealed) on location_pings to trackrex_app, trackrex_worker;

-- Customers, contacts, tasks, location ingest.

create table customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  code text,
  name text not null,
  customer_type text default 'business' check (customer_type in ('business', 'individual', 'distributor', 'retailer', 'other')),
  phone text,
  email text,
  address text,
  city text,
  latitude double precision,
  longitude double precision,
  geo_fence_id uuid,
  account_owner_id uuid,
  notes text,
  status text default 'active' check (status in ('prospect', 'active', 'inactive')),
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
create index customers_tenant_live on customers (tenant_id) where deleted_at is null;
create unique index customers_code_uq on customers (tenant_id, code) where code is not null;
create index customers_name_sort on customers (tenant_id, name, id);
create index customers_name_trgm on customers using gin (lower(name) gin_trgm_ops);
create index customers_phone_trgm on customers using gin (lower(phone) gin_trgm_ops);
create index customers_email_trgm on customers using gin (lower(email) gin_trgm_ops);
create index customers_address_trgm on customers using gin (lower(address) gin_trgm_ops);
create index customers_city_trgm on customers using gin (lower(city) gin_trgm_ops);
create index customers_account_owner_id_ref on customers (tenant_id, account_owner_id) where account_owner_id is not null;
create index customers_status_sort on customers (tenant_id, status, id);
alter table customers enable row level security;
alter table customers force row level security;
create policy tenant_isolation on customers using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on customers to trackrex_app, trackrex_worker;

create table contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  customer_id uuid not null,
  name text not null,
  designation text,
  phone text,
  email text,
  is_primary boolean default false,
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
create index contacts_tenant_live on contacts (tenant_id) where deleted_at is null;
create index contacts_customer_id_ref on contacts (tenant_id, customer_id) where customer_id is not null;
create index contacts_name_sort on contacts (tenant_id, name, id);
create index contacts_name_trgm on contacts using gin (lower(name) gin_trgm_ops);
create index contacts_phone_trgm on contacts using gin (lower(phone) gin_trgm_ops);
create index contacts_email_trgm on contacts using gin (lower(email) gin_trgm_ops);
alter table contacts enable row level security;
alter table contacts force row level security;
create policy tenant_isolation on contacts using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on contacts to trackrex_app, trackrex_worker;

create table tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  code text,
  title text not null,
  task_type text default 'visit' check (task_type in ('visit', 'call', 'delivery', 'collection', 'survey', 'other')),
  customer_id uuid,
  assignee_id uuid not null,
  due_at timestamptz,
  priority text default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  description text,
  status text default 'open' check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  check_in_latitude double precision,
  check_in_longitude double precision,
  check_out_latitude double precision,
  check_out_longitude double precision,
  check_in_distance_m double precision,
  outcome text,
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
create index tasks_tenant_live on tasks (tenant_id) where deleted_at is null;
create unique index tasks_code_uq on tasks (tenant_id, code) where code is not null;
create index tasks_title_trgm on tasks using gin (lower(title) gin_trgm_ops);
create index tasks_customer_id_ref on tasks (tenant_id, customer_id) where customer_id is not null;
create index tasks_assignee_id_ref on tasks (tenant_id, assignee_id) where assignee_id is not null;
create index tasks_due_at_sort on tasks (tenant_id, due_at, id);
create index tasks_priority_sort on tasks (tenant_id, priority, id);
create index tasks_status_sort on tasks (tenant_id, status, id);
create index tasks_completed_at_sort on tasks (tenant_id, completed_at, id);
alter table tasks enable row level security;
alter table tasks force row level security;
create policy tenant_isolation on tasks using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on tasks to trackrex_app, trackrex_worker;

alter table customers add constraint customers_geo_fence_id_fk foreign key (tenant_id, geo_fence_id) references geo_fences (tenant_id, id) deferrable initially deferred;
alter table customers add constraint customers_account_owner_id_fk foreign key (tenant_id, account_owner_id) references employees (tenant_id, id) deferrable initially deferred;

alter table contacts add constraint contacts_customer_id_fk foreign key (tenant_id, customer_id) references customers (tenant_id, id) deferrable initially deferred;

alter table tasks add constraint tasks_customer_id_fk foreign key (tenant_id, customer_id) references customers (tenant_id, id) deferrable initially deferred;
alter table tasks add constraint tasks_assignee_id_fk foreign key (tenant_id, assignee_id) references employees (tenant_id, id) deferrable initially deferred;


-- Raw location points. Partitioned by month; a retention job drops old data per tenant setting.
create table location_pings (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  employee_id uuid not null,
  at timestamptz not null,
  latitude double precision not null,
  longitude double precision not null,
  accuracy real,
  speed real,
  heading real,
  battery smallint,
  provider text,
  mock boolean not null default false,
  device_id text,
  received_at timestamptz not null default now(),
  primary key (id, at)
) partition by range (at);
create unique index location_pings_dedupe on location_pings (tenant_id, employee_id, at);
create index location_pings_employee_at on location_pings (tenant_id, employee_id, at desc);
create table location_pings_default partition of location_pings default;
grant select, insert, delete on location_pings_default to trackrex_app, trackrex_worker;
select ensure_monthly_partitions('location_pings', 1, 3);
alter table location_pings enable row level security;
alter table location_pings force row level security;
create policy tenant_isolation on location_pings using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, delete on location_pings to trackrex_app, trackrex_worker;

-- Latest known position per employee, for the live map. One row each, upserted on ingest.
create table live_locations (
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  employee_id uuid not null,
  at timestamptz not null,
  latitude double precision not null,
  longitude double precision not null,
  accuracy real,
  battery smallint,
  moving boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, employee_id),
  foreign key (tenant_id, employee_id) references employees (tenant_id, id)
);
alter table live_locations enable row level security;
alter table live_locations force row level security;
create policy tenant_isolation on live_locations using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on live_locations to trackrex_app, trackrex_worker;

create or replace function maintain_partitions(months_ahead int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform ensure_audit_partitions(1, months_ahead);
  perform ensure_monthly_partitions('punches', 1, months_ahead);
  perform ensure_monthly_partitions('feed_events', 1, months_ahead);
  perform ensure_monthly_partitions('location_pings', 1, months_ahead);
end $$;


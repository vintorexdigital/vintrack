-- Organization objects and employees, generated from packages/schemas entity definitions.

-- work_locations
create table work_locations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null,
  address text,
  latitude double precision,
  longitude double precision,
  radius_meters double precision default 200,
  timezone text default 'Asia/Kolkata',
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
create index work_locations_tenant_live on work_locations (tenant_id) where deleted_at is null;
create unique index work_locations_name_uq on work_locations (tenant_id, lower(name)) where deleted_at is null and name is not null;
create index work_locations_name_trgm on work_locations using gin (lower(name) gin_trgm_ops);
create index work_locations_address_trgm on work_locations using gin (lower(address) gin_trgm_ops);
create index work_locations_status_sort on work_locations (tenant_id, status, id);
alter table work_locations enable row level security;
alter table work_locations force row level security;
create policy tenant_isolation on work_locations using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on work_locations to trackrex_app, trackrex_worker;

-- business_units
create table business_units (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null,
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
create index business_units_tenant_live on business_units (tenant_id) where deleted_at is null;
create unique index business_units_name_uq on business_units (tenant_id, lower(name)) where deleted_at is null and name is not null;
create index business_units_name_trgm on business_units using gin (lower(name) gin_trgm_ops);
create index business_units_status_sort on business_units (tenant_id, status, id);
alter table business_units enable row level security;
alter table business_units force row level security;
create policy tenant_isolation on business_units using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on business_units to trackrex_app, trackrex_worker;

-- cost_centers
create table cost_centers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null,
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
create index cost_centers_tenant_live on cost_centers (tenant_id) where deleted_at is null;
create unique index cost_centers_name_uq on cost_centers (tenant_id, lower(name)) where deleted_at is null and name is not null;
create index cost_centers_name_trgm on cost_centers using gin (lower(name) gin_trgm_ops);
create index cost_centers_status_sort on cost_centers (tenant_id, status, id);
alter table cost_centers enable row level security;
alter table cost_centers force row level security;
create policy tenant_isolation on cost_centers using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on cost_centers to trackrex_app, trackrex_worker;

-- employee_types
create table employee_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null,
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
create index employee_types_tenant_live on employee_types (tenant_id) where deleted_at is null;
create unique index employee_types_name_uq on employee_types (tenant_id, lower(name)) where deleted_at is null and name is not null;
create index employee_types_name_trgm on employee_types using gin (lower(name) gin_trgm_ops);
create index employee_types_status_sort on employee_types (tenant_id, status, id);
alter table employee_types enable row level security;
alter table employee_types force row level security;
create policy tenant_isolation on employee_types using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on employee_types to trackrex_app, trackrex_worker;

-- employment_types
create table employment_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null,
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
create index employment_types_tenant_live on employment_types (tenant_id) where deleted_at is null;
create unique index employment_types_name_uq on employment_types (tenant_id, lower(name)) where deleted_at is null and name is not null;
create index employment_types_name_trgm on employment_types using gin (lower(name) gin_trgm_ops);
create index employment_types_status_sort on employment_types (tenant_id, status, id);
alter table employment_types enable row level security;
alter table employment_types force row level security;
create policy tenant_isolation on employment_types using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on employment_types to trackrex_app, trackrex_worker;

-- departments
create table departments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null,
  parent_id uuid,
  head_id uuid,
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
create index departments_tenant_live on departments (tenant_id) where deleted_at is null;
create unique index departments_name_uq on departments (tenant_id, lower(name)) where deleted_at is null and name is not null;
create index departments_name_trgm on departments using gin (lower(name) gin_trgm_ops);
create index departments_parent_id_ref on departments (tenant_id, parent_id) where parent_id is not null;
create index departments_head_id_ref on departments (tenant_id, head_id) where head_id is not null;
create index departments_status_sort on departments (tenant_id, status, id);
alter table departments enable row level security;
alter table departments force row level security;
create policy tenant_isolation on departments using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on departments to trackrex_app, trackrex_worker;

-- designations
create table designations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null,
  department_id uuid,
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
create index designations_tenant_live on designations (tenant_id) where deleted_at is null;
create unique index designations_name_uq on designations (tenant_id, lower(name)) where deleted_at is null and name is not null;
create index designations_name_trgm on designations using gin (lower(name) gin_trgm_ops);
create index designations_department_id_ref on designations (tenant_id, department_id) where department_id is not null;
create index designations_status_sort on designations (tenant_id, status, id);
alter table designations enable row level security;
alter table designations force row level security;
create policy tenant_isolation on designations using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on designations to trackrex_app, trackrex_worker;

-- teams
create table teams (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null,
  lead_id uuid,
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
create index teams_tenant_live on teams (tenant_id) where deleted_at is null;
create unique index teams_name_uq on teams (tenant_id, lower(name)) where deleted_at is null and name is not null;
create index teams_name_trgm on teams using gin (lower(name) gin_trgm_ops);
create index teams_lead_id_ref on teams (tenant_id, lead_id) where lead_id is not null;
create index teams_status_sort on teams (tenant_id, status, id);
alter table teams enable row level security;
alter table teams force row level security;
create policy tenant_isolation on teams using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on teams to trackrex_app, trackrex_worker;

-- employees
create table employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  code text,
  first_name text not null,
  last_name text,
  display_name text not null,
  gender text check (gender in ('female', 'male', 'other', 'undisclosed')),
  date_of_birth date,
  work_email text,
  personal_email text,
  mobile text,
  date_of_joining date not null,
  date_of_exit date,
  status text default 'active' check (status in ('invited', 'active', 'suspended', 'exited')),
  reporting_manager_id uuid,
  functional_manager_id uuid,
  department_id uuid,
  designation_id uuid,
  work_location_id uuid,
  business_unit_id uuid,
  cost_center_id uuid,
  employee_type_id uuid,
  employment_type_id uuid,
  shift_id uuid,
  leave_profile_id uuid,
  license_bundle_id uuid,
  home_latitude double precision,
  home_longitude double precision,
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
create index employees_tenant_live on employees (tenant_id) where deleted_at is null;
create unique index employees_code_uq on employees (tenant_id, code) where code is not null;
create unique index employees_mobile_uq on employees (tenant_id, mobile) where deleted_at is null and mobile is not null;
create unique index employees_work_email_uq on employees (tenant_id, lower(work_email)) where deleted_at is null and work_email is not null;
create index employees_first_name_trgm on employees using gin (lower(first_name) gin_trgm_ops);
create index employees_last_name_trgm on employees using gin (lower(last_name) gin_trgm_ops);
create index employees_display_name_sort on employees (tenant_id, display_name, id);
create index employees_display_name_trgm on employees using gin (lower(display_name) gin_trgm_ops);
create index employees_work_email_trgm on employees using gin (lower(work_email) gin_trgm_ops);
create index employees_mobile_trgm on employees using gin (lower(mobile) gin_trgm_ops);
create index employees_date_of_joining_sort on employees (tenant_id, date_of_joining, id);
create index employees_status_sort on employees (tenant_id, status, id);
create index employees_reporting_manager_id_ref on employees (tenant_id, reporting_manager_id) where reporting_manager_id is not null;
create index employees_department_id_ref on employees (tenant_id, department_id) where department_id is not null;
create index employees_designation_id_ref on employees (tenant_id, designation_id) where designation_id is not null;
create index employees_work_location_id_ref on employees (tenant_id, work_location_id) where work_location_id is not null;
create index employees_employee_type_id_ref on employees (tenant_id, employee_type_id) where employee_type_id is not null;
create index employees_shift_id_ref on employees (tenant_id, shift_id) where shift_id is not null;
create index employees_leave_profile_id_ref on employees (tenant_id, leave_profile_id) where leave_profile_id is not null;
create index employees_license_bundle_id_ref on employees (tenant_id, license_bundle_id) where license_bundle_id is not null;
alter table employees enable row level security;
alter table employees force row level security;
create policy tenant_isolation on employees using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on employees to trackrex_app, trackrex_worker;

-- same-tenant foreign keys

alter table departments add constraint departments_parent_id_fk foreign key (tenant_id, parent_id) references departments (tenant_id, id) deferrable initially deferred;
alter table departments add constraint departments_head_id_fk foreign key (tenant_id, head_id) references employees (tenant_id, id) deferrable initially deferred;

alter table designations add constraint designations_department_id_fk foreign key (tenant_id, department_id) references departments (tenant_id, id) deferrable initially deferred;

alter table teams add constraint teams_lead_id_fk foreign key (tenant_id, lead_id) references employees (tenant_id, id) deferrable initially deferred;

alter table employees add constraint employees_reporting_manager_id_fk foreign key (tenant_id, reporting_manager_id) references employees (tenant_id, id) deferrable initially deferred;
alter table employees add constraint employees_functional_manager_id_fk foreign key (tenant_id, functional_manager_id) references employees (tenant_id, id) deferrable initially deferred;
alter table employees add constraint employees_department_id_fk foreign key (tenant_id, department_id) references departments (tenant_id, id) deferrable initially deferred;
alter table employees add constraint employees_designation_id_fk foreign key (tenant_id, designation_id) references designations (tenant_id, id) deferrable initially deferred;
alter table employees add constraint employees_work_location_id_fk foreign key (tenant_id, work_location_id) references work_locations (tenant_id, id) deferrable initially deferred;
alter table employees add constraint employees_business_unit_id_fk foreign key (tenant_id, business_unit_id) references business_units (tenant_id, id) deferrable initially deferred;
alter table employees add constraint employees_cost_center_id_fk foreign key (tenant_id, cost_center_id) references cost_centers (tenant_id, id) deferrable initially deferred;
alter table employees add constraint employees_employee_type_id_fk foreign key (tenant_id, employee_type_id) references employee_types (tenant_id, id) deferrable initially deferred;
alter table employees add constraint employees_employment_type_id_fk foreign key (tenant_id, employment_type_id) references employment_types (tenant_id, id) deferrable initially deferred;


alter table employees add constraint employees_exit_after_join
  check (date_of_exit is null or date_of_exit >= date_of_joining);

create table team_members (
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  team_id uuid not null,
  employee_id uuid not null,
  role text not null default 'member' check (role in ('lead','member')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, team_id, employee_id),
  foreign key (tenant_id, team_id) references teams (tenant_id, id) on delete cascade,
  foreign key (tenant_id, employee_id) references employees (tenant_id, id) on delete cascade
);
create index team_members_employee on team_members (tenant_id, employee_id);
alter table team_members enable row level security;
alter table team_members force row level security;
create policy tenant_isolation on team_members using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on team_members to trackrex_app, trackrex_worker;

-- Data-scope helpers used by the ScopeResolver. They run with invoker rights, so RLS still applies.
create function reportee_ids(manager uuid) returns setof uuid language sql stable as $$
  with recursive r as (
    select id from employees where reporting_manager_id = manager and deleted_at is null
    union
    select e.id from employees e join r on e.reporting_manager_id = r.id where e.deleted_at is null
  ) select id from r $$;

create function direct_reportee_ids(manager uuid) returns setof uuid language sql stable as $$
  select id from employees where reporting_manager_id = manager and deleted_at is null $$;

create function team_scope_ids(emp uuid) returns setof uuid language sql stable as $$
  select tm.employee_id from team_members tm where tm.team_id in (
    select team_id from team_members where employee_id = emp
    union select id from teams where lead_id = emp and deleted_at is null
  )
  union select emp $$;

create function department_scope_ids(emp uuid) returns setof uuid language sql stable as $$
  select e.id from employees e where e.deleted_at is null and e.department_id in (
    select department_id from employees where id = emp and department_id is not null
    union select id from departments where head_id = emp and deleted_at is null
  )
  union select emp $$;

create function location_scope_ids(emp uuid) returns setof uuid language sql stable as $$
  select e.id from employees e where e.deleted_at is null and e.work_location_id in (
    select work_location_id from employees where id = emp and work_location_id is not null
  )
  union select emp $$;


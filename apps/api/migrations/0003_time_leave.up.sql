-- Time, attendance and leave: generated entity tables plus hand-written operational tables.

-- leave_profiles
create table leave_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null,
  half_day_allowed boolean default true,
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
create index leave_profiles_tenant_live on leave_profiles (tenant_id) where deleted_at is null;
create unique index leave_profiles_name_uq on leave_profiles (tenant_id, lower(name)) where deleted_at is null and name is not null;
create index leave_profiles_name_trgm on leave_profiles using gin (lower(name) gin_trgm_ops);
create index leave_profiles_status_sort on leave_profiles (tenant_id, status, id);
alter table leave_profiles enable row level security;
alter table leave_profiles force row level security;
create policy tenant_isolation on leave_profiles using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on leave_profiles to trackrex_app, trackrex_worker;

-- shifts
create table shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null,
  timezone text not null default 'Asia/Kolkata',
  start_time time not null,
  max_punch_in_time time,
  working_minutes double precision not null default 540,
  break_allowance_minutes double precision default 60,
  continuous_idle_minutes double precision default 5,
  rules jsonb,
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
create index shifts_tenant_live on shifts (tenant_id) where deleted_at is null;
create unique index shifts_name_uq on shifts (tenant_id, lower(name)) where deleted_at is null and name is not null;
create index shifts_name_trgm on shifts using gin (lower(name) gin_trgm_ops);
create index shifts_start_time_sort on shifts (tenant_id, start_time, id);
create index shifts_status_sort on shifts (tenant_id, status, id);
alter table shifts enable row level security;
alter table shifts force row level security;
create policy tenant_isolation on shifts using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on shifts to trackrex_app, trackrex_worker;

-- break_types
create table break_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null,
  paid boolean default false,
  allowance_minutes double precision default 30,
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
create index break_types_tenant_live on break_types (tenant_id) where deleted_at is null;
create unique index break_types_name_uq on break_types (tenant_id, lower(name)) where deleted_at is null and name is not null;
create index break_types_name_trgm on break_types using gin (lower(name) gin_trgm_ops);
create index break_types_status_sort on break_types (tenant_id, status, id);
alter table break_types enable row level security;
alter table break_types force row level security;
create policy tenant_isolation on break_types using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on break_types to trackrex_app, trackrex_worker;

-- attendance_policies
create table attendance_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null,
  start_date date not null,
  description text,
  shift_ids uuid[],
  rules jsonb,
  state text default 'draft' check (state in ('draft', 'published')),
  revision double precision default 1,
  previous_id uuid,
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
create index attendance_policies_tenant_live on attendance_policies (tenant_id) where deleted_at is null;
create index attendance_policies_name_sort on attendance_policies (tenant_id, name, id);
create index attendance_policies_name_trgm on attendance_policies using gin (lower(name) gin_trgm_ops);
create index attendance_policies_start_date_sort on attendance_policies (tenant_id, start_date, id);
create index attendance_policies_state_sort on attendance_policies (tenant_id, state, id);
alter table attendance_policies enable row level security;
alter table attendance_policies force row level security;
create policy tenant_isolation on attendance_policies using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on attendance_policies to trackrex_app, trackrex_worker;

-- holidays
create table holidays (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  optional boolean default false,
  leave_profile_ids uuid[],
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
create index holidays_tenant_live on holidays (tenant_id) where deleted_at is null;
create index holidays_name_sort on holidays (tenant_id, name, id);
create index holidays_name_trgm on holidays using gin (lower(name) gin_trgm_ops);
create index holidays_start_date_sort on holidays (tenant_id, start_date, id);
create index holidays_end_date_sort on holidays (tenant_id, end_date, id);
alter table holidays enable row level security;
alter table holidays force row level security;
create policy tenant_isolation on holidays using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on holidays to trackrex_app, trackrex_worker;

-- non_working_rules
create table non_working_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null,
  weekday text not null check (weekday in ('0', '1', '2', '3', '4', '5', '6')),
  weeks text[],
  leave_profile_id uuid,
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
create index non_working_rules_tenant_live on non_working_rules (tenant_id) where deleted_at is null;
create index non_working_rules_name_sort on non_working_rules (tenant_id, name, id);
create index non_working_rules_name_trgm on non_working_rules using gin (lower(name) gin_trgm_ops);
create index non_working_rules_leave_profile_id_ref on non_working_rules (tenant_id, leave_profile_id) where leave_profile_id is not null;
alter table non_working_rules enable row level security;
alter table non_working_rules force row level security;
create policy tenant_isolation on non_working_rules using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on non_working_rules to trackrex_app, trackrex_worker;

-- leave_types
create table leave_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null,
  code text not null,
  color text default '#0F5E73',
  paid boolean default true,
  lop_deduction boolean default false,
  description text,
  leave_profile_ids uuid[],
  entitlement jsonb not null,
  restrictions jsonb,
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
create index leave_types_tenant_live on leave_types (tenant_id) where deleted_at is null;
create unique index leave_types_name_uq on leave_types (tenant_id, lower(name)) where deleted_at is null and name is not null;
create unique index leave_types_code_uq on leave_types (tenant_id, lower(code)) where deleted_at is null and code is not null;
create index leave_types_name_trgm on leave_types using gin (lower(name) gin_trgm_ops);
create index leave_types_status_sort on leave_types (tenant_id, status, id);
alter table leave_types enable row level security;
alter table leave_types force row level security;
create policy tenant_isolation on leave_types using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on leave_types to trackrex_app, trackrex_worker;

-- leave_requests
create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  code text,
  employee_id uuid not null,
  leave_type_id uuid not null,
  duration text default 'full' check (duration in ('full', 'first_half', 'second_half')),
  from_date date not null,
  to_date date not null,
  days double precision,
  reason text,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  action_by uuid,
  action_at timestamptz,
  action_comment text,
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
create index leave_requests_tenant_live on leave_requests (tenant_id) where deleted_at is null;
create unique index leave_requests_code_uq on leave_requests (tenant_id, code) where code is not null;
create index leave_requests_employee_id_ref on leave_requests (tenant_id, employee_id) where employee_id is not null;
create index leave_requests_leave_type_id_ref on leave_requests (tenant_id, leave_type_id) where leave_type_id is not null;
create index leave_requests_from_date_sort on leave_requests (tenant_id, from_date, id);
create index leave_requests_to_date_sort on leave_requests (tenant_id, to_date, id);
create index leave_requests_status_sort on leave_requests (tenant_id, status, id);
alter table leave_requests enable row level security;
alter table leave_requests force row level security;
create policy tenant_isolation on leave_requests using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on leave_requests to trackrex_app, trackrex_worker;

-- regularizations
create table regularizations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  employee_id uuid not null,
  date date not null,
  current_code text,
  requested_code text not null check (requested_code in ('P', 'HP', 'AB')),
  reason text not null,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  action_by uuid,
  action_at timestamptz,
  action_comment text,
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
create index regularizations_tenant_live on regularizations (tenant_id) where deleted_at is null;
create index regularizations_employee_id_ref on regularizations (tenant_id, employee_id) where employee_id is not null;
create index regularizations_date_sort on regularizations (tenant_id, date, id);
create index regularizations_status_sort on regularizations (tenant_id, status, id);
alter table regularizations enable row level security;
alter table regularizations force row level security;
create policy tenant_isolation on regularizations using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on regularizations to trackrex_app, trackrex_worker;

-- same-tenant foreign keys

alter table attendance_policies add constraint attendance_policies_previous_id_fk foreign key (tenant_id, previous_id) references attendance_policies (tenant_id, id) deferrable initially deferred;

alter table non_working_rules add constraint non_working_rules_leave_profile_id_fk foreign key (tenant_id, leave_profile_id) references leave_profiles (tenant_id, id) deferrable initially deferred;

alter table leave_requests add constraint leave_requests_employee_id_fk foreign key (tenant_id, employee_id) references employees (tenant_id, id) deferrable initially deferred;
alter table leave_requests add constraint leave_requests_leave_type_id_fk foreign key (tenant_id, leave_type_id) references leave_types (tenant_id, id) deferrable initially deferred;
alter table leave_requests add constraint leave_requests_action_by_fk foreign key (tenant_id, action_by) references employees (tenant_id, id) deferrable initially deferred;

alter table regularizations add constraint regularizations_employee_id_fk foreign key (tenant_id, employee_id) references employees (tenant_id, id) deferrable initially deferred;
alter table regularizations add constraint regularizations_action_by_fk foreign key (tenant_id, action_by) references employees (tenant_id, id) deferrable initially deferred;


alter table employees add constraint employees_shift_fk foreign key (tenant_id, shift_id) references shifts (tenant_id, id) deferrable initially deferred;
alter table employees add constraint employees_leave_profile_fk foreign key (tenant_id, leave_profile_id) references leave_profiles (tenant_id, id) deferrable initially deferred;
alter table non_working_rules add constraint non_working_weekday_chk check (weekday in ('0','1','2','3','4','5','6'));
alter table leave_requests add constraint leave_requests_range_chk check (to_date >= from_date);
create index leave_requests_employee_dates on leave_requests (tenant_id, employee_id, from_date, to_date) where deleted_at is null;
create index regularizations_employee_date on regularizations (tenant_id, employee_id, date) where deleted_at is null;

create function ensure_monthly_partitions(parent text, months_back int, months_ahead int) returns void
language plpgsql as $$
declare m date; p text;
begin
  for i in -months_back..months_ahead loop
    m := (date_trunc('month', now()) + make_interval(months => i))::date;
    p := parent || '_' || to_char(m, 'YYYYMM');
    if to_regclass('public.' || p) is null then
      execute format('create table %I partition of %I for values from (%L) to (%L)', p, parent, m, (m + interval '1 month')::date);
      execute format('grant select, insert on %I to trackrex_app, trackrex_worker', p);
    end if;
  end loop;
end $$;

create table shift_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  employee_id uuid not null,
  shift_id uuid not null,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  created_by uuid,
  foreign key (tenant_id, employee_id) references employees (tenant_id, id),
  foreign key (tenant_id, shift_id) references shifts (tenant_id, id),
  check (effective_to is null or effective_to >= effective_from),
  exclude using gist (tenant_id with =, employee_id with =, daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&)
);
create index shift_assignments_shift on shift_assignments (tenant_id, shift_id);
alter table shift_assignments enable row level security;
alter table shift_assignments force row level security;
create policy tenant_isolation on shift_assignments using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on shift_assignments to trackrex_app, trackrex_worker;

create table punches (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  employee_id uuid not null,
  type text not null check (type in ('in','out')),
  at timestamptz not null,
  attendance_date date not null,
  source text not null check (source in ('mobile','desktop','web','system','admin')),
  shift_id uuid,
  device_id text,
  ip text,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  address text,
  fence_id uuid,
  selfie_key text,
  comment text,
  mock_location boolean not null default false,
  offline boolean not null default false,
  client_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  primary key (id, at)
) partition by range (at);
create index punches_employee_at on punches (tenant_id, employee_id, at desc);
create index punches_date on punches (tenant_id, attendance_date, employee_id);
create index punches_at_brin on punches using brin (at);
create table punches_default partition of punches default;
grant select, insert on punches_default to trackrex_app, trackrex_worker;
select ensure_monthly_partitions('punches', 2, 3);
alter table punches enable row level security;
alter table punches force row level security;
create policy tenant_isolation on punches using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert on punches to trackrex_app, trackrex_worker;

create table breaks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  employee_id uuid not null,
  break_type_id uuid,
  attendance_date date not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  source text not null default 'web' check (source in ('mobile','desktop','web','system','admin')),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, employee_id) references employees (tenant_id, id),
  foreign key (tenant_id, break_type_id) references break_types (tenant_id, id),
  check (ended_at is null or ended_at >= started_at)
);
create index breaks_employee_date on breaks (tenant_id, employee_id, attendance_date);
create unique index breaks_one_open on breaks (tenant_id, employee_id) where ended_at is null;
alter table breaks enable row level security;
alter table breaks force row level security;
create policy tenant_isolation on breaks using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on breaks to trackrex_app, trackrex_worker;

create table attendance_days (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  employee_id uuid not null,
  date date not null,
  shift_id uuid,
  first_in timestamptz,
  last_out timestamptz,
  worked_minutes integer not null default 0,
  break_minutes integer not null default 0,
  late_minutes integer not null default 0,
  early_out_minutes integer not null default 0,
  overtime_minutes integer not null default 0,
  status_code text not null,
  secondary_code text,
  present_units numeric(3,1) not null default 0,
  absent_units numeric(3,1) not null default 0,
  leave_units numeric(3,1) not null default 0,
  deduction_units numeric(3,1) not null default 0,
  late_mark boolean not null default false,
  early_mark boolean not null default false,
  flags text[] not null default '{}',
  explanation text[] not null default '{}',
  paid_leave boolean not null default false,
  override_code text check (override_code in ('OA','ONW','OH','P','AB','HP')),
  override_by uuid,
  override_reason text,
  override_at timestamptz,
  locked boolean not null default false,
  policy_id uuid,
  computed_at timestamptz not null default now(),
  version integer not null default 1,
  unique (tenant_id, employee_id, date),
  foreign key (tenant_id, employee_id) references employees (tenant_id, id)
);
create index attendance_days_date on attendance_days (tenant_id, date, employee_id);
alter table attendance_days enable row level security;
alter table attendance_days force row level security;
create policy tenant_isolation on attendance_days using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on attendance_days to trackrex_app, trackrex_worker;

create table leave_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  employee_id uuid not null,
  leave_type_id uuid not null,
  session_start date not null,
  date date not null,
  days numeric(6,2) not null check (days >= 0),
  kind text not null check (kind in ('accrual','carry_forward','adjustment','taken','lapse','comp_off')),
  expires_on date,
  request_id uuid,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid,
  foreign key (tenant_id, employee_id) references employees (tenant_id, id),
  foreign key (tenant_id, leave_type_id) references leave_types (tenant_id, id)
);
create index leave_ledger_lookup on leave_ledger (tenant_id, employee_id, leave_type_id, session_start);
create unique index leave_ledger_request_once on leave_ledger (tenant_id, request_id, kind) where request_id is not null and kind = 'taken';
alter table leave_ledger enable row level security;
alter table leave_ledger force row level security;
create policy tenant_isolation on leave_ledger using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, delete on leave_ledger to trackrex_app, trackrex_worker;


/** One-off authoring tool: writes migrations/0003_time_leave.{up,down}.sql. */
import { writeFileSync } from 'node:fs';
import { attendancePolicies, breakTypes, holidays, leaveProfiles, leaveRequests, leaveTypes, nonWorkingRules, regularizations, shifts } from '@trackrex/schemas';
import { entitySql } from '../src/shared/crud/entity-sql.js';

const kits = [leaveProfiles, shifts, breakTypes, attendancePolicies, holidays, nonWorkingRules, leaveTypes, leaveRequests, regularizations];
const known = new Set([...kits.map((k) => k.def.key.replace(/-/g, '_')), 'employees', 'work_locations', 'departments']);
const sqls = kits.map((k) => entitySql(k, known));

const rls = (t: string, write = 'select, insert, update, delete') =>
  `alter table ${t} enable row level security;\nalter table ${t} force row level security;\ncreate policy tenant_isolation on ${t} using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());\ngrant ${write} on ${t} to trackrex_app, trackrex_worker;`;

const extras = `
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
${rls('shift_assignments')}

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
${rls('breaks')}

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
${rls('attendance_days')}

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
${rls('leave_ledger', 'select, insert, delete')}
`;

const up = ['-- Time, attendance and leave: generated entity tables plus hand-written operational tables.', ...sqls.map((s) => `-- ${s.table}\n${s.create}`), '-- same-tenant foreign keys', ...sqls.map((s) => s.fks).filter(Boolean), extras].join('\n\n');
const down = [
  'alter table employees drop constraint if exists employees_shift_fk, drop constraint if exists employees_leave_profile_fk;',
  'drop table if exists leave_ledger, attendance_days, breaks, punches, shift_assignments cascade;',
  'drop function if exists ensure_monthly_partitions(text, int, int);',
  ...[...sqls].reverse().map((s) => s.down),
].join('\n');
writeFileSync('migrations/0003_time_leave.up.sql', up + '\n');
writeFileSync('migrations/0003_time_leave.down.sql', down + '\n');
console.log('wrote 0003');

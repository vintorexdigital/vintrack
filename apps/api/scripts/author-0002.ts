/** One-off authoring tool: writes migrations/0002_org_people.{up,down}.sql from entity definitions. */
import { writeFileSync } from 'node:fs';
import { departments, designations, teams, workLocations, businessUnits, costCenters, employeeTypes, employmentTypes, employees } from '@trackrex/schemas';
import { entitySql } from '../src/shared/crud/entity-sql.js';

const kits = [workLocations, businessUnits, costCenters, employeeTypes, employmentTypes, departments, designations, teams, employees];
const known = new Set(kits.map((k) => k.def.key.replace(/-/g, '_')));
const sqls = kits.map((k) => entitySql(k, known));

const extras = `
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
`;

const up = [
  '-- Organization objects and employees, generated from packages/schemas entity definitions.',
  ...sqls.map((s) => `-- ${s.table}\n${s.create}`),
  '-- same-tenant foreign keys',
  ...sqls.map((s) => s.fks).filter(Boolean),
  extras,
].join('\n\n');
const down = [
  'drop function if exists location_scope_ids(uuid), department_scope_ids(uuid), team_scope_ids(uuid), direct_reportee_ids(uuid), reportee_ids(uuid);',
  'drop table if exists team_members cascade;',
  ...[...sqls].reverse().map((s) => s.down),
].join('\n');
writeFileSync('migrations/0002_org_people.up.sql', up + '\n');
writeFileSync('migrations/0002_org_people.down.sql', down + '\n');
console.log('wrote 0002');

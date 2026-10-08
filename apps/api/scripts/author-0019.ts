/** One-off authoring tool: writes migrations/0019_hr_suite and 0020_helpdesk (entity tables from the kits, plus hand-written tables). */
import { writeFileSync } from 'node:fs';
import { assets, onboardingTemplates, salaryStructures, tickets } from '@trackrex/schemas';
import { entitySql } from '../src/shared/crud/entity-sql.js';

const rls = (t: string, grants = 'select, insert, update, delete') => `alter table ${t} enable row level security;
alter table ${t} force row level security;
create policy tenant_isolation on ${t} using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant ${grants} on ${t} to trackrex_app, trackrex_worker;`;

{
  const known = new Set(['employees', 'salary_structures', 'onboarding_templates']);
  const parts = [salaryStructures, onboardingTemplates].map((k) => entitySql(k, known));
  const extra = `
-- A payroll cycle and the payslips in it. Draft runs can be redone; finalizing locks the attendance days behind them.
create table payroll_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  cycle_start date not null,
  cycle_end date not null,
  label text not null,
  status text not null default 'draft' check (status in ('draft', 'finalized', 'paid')),
  employees int not null default 0,
  gross numeric(14,2) not null default 0,
  deductions numeric(14,2) not null default 0,
  net numeric(14,2) not null default 0,
  employer_cost numeric(14,2) not null default 0,
  created_by uuid,
  finalized_at timestamptz,
  finalized_by uuid,
  paid_at timestamptz,
  payment_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, cycle_start),
  unique (tenant_id, id)
);
${rls('payroll_runs', 'select, insert, update')}

create table payslips (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  run_id uuid not null references payroll_runs (id) on delete cascade,
  employee_id uuid not null,
  structure_id uuid,
  earnings jsonb not null,
  deductions jsonb not null,
  employer jsonb not null default '[]'::jsonb,
  gross numeric(14,2) not null,
  total_deductions numeric(14,2) not null,
  net numeric(14,2) not null,
  payable_days numeric(6,2) not null,
  cycle_days int not null,
  lop_days numeric(6,2) not null default 0,
  warnings text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (run_id, employee_id),
  foreign key (tenant_id, employee_id) references employees (tenant_id, id)
);
create index payslips_employee on payslips (tenant_id, employee_id, created_at desc);
${rls('payslips')}

-- Checklists for people joining or leaving.
create table onboarding_cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  employee_id uuid not null,
  template_id uuid,
  template_name text not null,
  kind text not null,
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  created_by uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (tenant_id, employee_id) references employees (tenant_id, id)
);
create index onboarding_cases_employee on onboarding_cases (tenant_id, employee_id, created_at desc);
${rls('onboarding_cases')}

create table onboarding_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  case_id uuid not null references onboarding_cases (id) on delete cascade,
  position int not null,
  title text not null,
  who text not null,
  assignee_employee_id uuid,
  due_date date,
  done_at timestamptz,
  done_by uuid,
  note text
);
create index onboarding_items_case on onboarding_items (case_id, position);
create index onboarding_items_assignee on onboarding_items (tenant_id, assignee_employee_id) where done_at is null;
${rls('onboarding_items')}
`;
  writeFileSync('migrations/0019_hr_suite.up.sql', ['-- HR suite: salary structures, payroll runs and payslips, onboarding and exit checklists.', ...parts.map((p) => p.create), ...parts.map((p) => p.fks), extra].join('\n\n') + '\n');
  writeFileSync('migrations/0019_hr_suite.down.sql', ['drop table if exists onboarding_items;', 'drop table if exists onboarding_cases;', 'drop table if exists payslips;', 'drop table if exists payroll_runs;', ...[...parts].reverse().map((p) => p.down)].join('\n') + '\n');
}

{
  const known = new Set(['employees', 'tickets', 'assets']);
  const parts = [tickets, assets].map((k) => entitySql(k, known));
  const extra = `
-- The conversation on a ticket. Internal notes are for the people working on it, not the person who asked.
create table ticket_comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  ticket_id uuid not null,
  author_user_id uuid not null,
  author_employee_id uuid,
  body text not null,
  internal boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (tenant_id, ticket_id) references tickets (tenant_id, id) deferrable initially deferred
);
create index ticket_comments_ticket on ticket_comments (tenant_id, ticket_id, created_at);
${rls('ticket_comments', 'select, insert')}

-- Which service-level deadlines have already been reported as missed, so each is reported once.
create table ticket_sla (
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  ticket_id uuid not null,
  response_breached_at timestamptz,
  resolution_breached_at timestamptz,
  primary key (tenant_id, ticket_id),
  foreign key (tenant_id, ticket_id) references tickets (tenant_id, id) deferrable initially deferred
);
${rls('ticket_sla')}

create table asset_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  asset_id uuid not null,
  employee_id uuid not null,
  assigned_at timestamptz not null default now(),
  assigned_by uuid,
  assign_note text,
  returned_at timestamptz,
  returned_by uuid,
  return_condition text check (return_condition in ('good', 'needs_repair', 'lost')),
  return_note text,
  foreign key (tenant_id, asset_id) references assets (tenant_id, id) deferrable initially deferred,
  foreign key (tenant_id, employee_id) references employees (tenant_id, id)
);
create index asset_assignments_asset on asset_assignments (tenant_id, asset_id, assigned_at desc);
create index asset_assignments_open on asset_assignments (tenant_id, employee_id) where returned_at is null;
${rls('asset_assignments', 'select, insert, update')}
`;
  writeFileSync('migrations/0020_helpdesk.up.sql', ['-- Help desk and assets.', ...parts.map((p) => p.create), ...parts.map((p) => p.fks), extra].join('\n\n') + '\n');
  writeFileSync('migrations/0020_helpdesk.down.sql', ['drop table if exists asset_assignments;', 'drop table if exists ticket_sla;', 'drop table if exists ticket_comments;', ...[...parts].reverse().map((p) => p.down)].join('\n') + '\n');
}
console.log('wrote 0019 and 0020');

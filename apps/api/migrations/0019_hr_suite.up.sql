-- HR suite: salary structures, payroll runs and payslips, onboarding and exit checklists.

create table salary_structures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  employee_id uuid not null,
  effective_from date not null,
  basic double precision not null,
  hra double precision default 0,
  special_allowance double precision default 0,
  other_allowance double precision default 0,
  pf_enabled boolean default true,
  esi_enabled boolean default false,
  professional_tax double precision default 0,
  other_deductions double precision default 0,
  notes text,
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
create index salary_structures_tenant_live on salary_structures (tenant_id) where deleted_at is null;
create index salary_structures_employee_id_ref on salary_structures (tenant_id, employee_id) where employee_id is not null;
create index salary_structures_effective_from_sort on salary_structures (tenant_id, effective_from, id);
alter table salary_structures enable row level security;
alter table salary_structures force row level security;
create policy tenant_isolation on salary_structures using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on salary_structures to trackrex_app, trackrex_worker;

create table onboarding_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null,
  kind text default 'joining' check (kind in ('joining', 'exit')),
  status text default 'active' check (status in ('active', 'archived')),
  items jsonb not null,
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
create index onboarding_templates_tenant_live on onboarding_templates (tenant_id) where deleted_at is null;
create index onboarding_templates_name_sort on onboarding_templates (tenant_id, name, id);
create index onboarding_templates_name_trgm on onboarding_templates using gin (lower(name) gin_trgm_ops);
alter table onboarding_templates enable row level security;
alter table onboarding_templates force row level security;
create policy tenant_isolation on onboarding_templates using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on onboarding_templates to trackrex_app, trackrex_worker;

alter table salary_structures add constraint salary_structures_employee_id_fk foreign key (tenant_id, employee_id) references employees (tenant_id, id) deferrable initially deferred;




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
alter table payroll_runs enable row level security;
alter table payroll_runs force row level security;
create policy tenant_isolation on payroll_runs using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update on payroll_runs to trackrex_app, trackrex_worker;

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
alter table payslips enable row level security;
alter table payslips force row level security;
create policy tenant_isolation on payslips using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on payslips to trackrex_app, trackrex_worker;

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
alter table onboarding_cases enable row level security;
alter table onboarding_cases force row level security;
create policy tenant_isolation on onboarding_cases using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on onboarding_cases to trackrex_app, trackrex_worker;

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
alter table onboarding_items enable row level security;
alter table onboarding_items force row level security;
create policy tenant_isolation on onboarding_items using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on onboarding_items to trackrex_app, trackrex_worker;


-- Workflows, their runs and approvals, and multi-level approval progress.

create table workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null,
  description text,
  status text default 'draft' check (status in ('draft', 'active', 'paused')),
  trigger text not null check (trigger in ('leave.requested', 'leave.approved', 'leave.rejected', 'regularization.requested', 'regularization.approved', 'regularization.rejected', 'expense.submitted', 'expense.approved', 'expense.rejected', 'expense.paid', 'task.assigned', 'task.completed', 'task.cancelled', 'lead.assigned', 'lead.stage_changed', 'lead.converted', 'punch.in', 'punch.out', 'punch.auto_out', 'employee.created', 'employee.exited', 'ticket.created', 'ticket.resolved', 'ticket.sla_breached', 'payslip.published')),
  conditions jsonb,
  steps jsonb not null,
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
create index workflows_tenant_live on workflows (tenant_id) where deleted_at is null;
create index workflows_name_sort on workflows (tenant_id, name, id);
create index workflows_name_trgm on workflows using gin (lower(name) gin_trgm_ops);
alter table workflows enable row level security;
alter table workflows force row level security;
create policy tenant_isolation on workflows using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on workflows to trackrex_app, trackrex_worker;




-- One row per time a workflow fired for an event. The unique key makes a re-delivered event harmless.
create table workflow_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  workflow_id uuid not null,
  workflow_name text not null,
  event_id bigint not null,
  trigger text not null,
  steps jsonb not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'running' check (status in ('running', 'waiting', 'completed', 'failed', 'rejected')),
  step_index int not null default 0,
  resume_at timestamptz,
  error text,
  log jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, workflow_id, event_id)
);
create index workflow_runs_recent on workflow_runs (tenant_id, created_at desc);
create index workflow_runs_due on workflow_runs (resume_at) where status = 'waiting' and resume_at is not null;
alter table workflow_runs enable row level security;
alter table workflow_runs force row level security;
create policy tenant_isolation on workflow_runs using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on workflow_runs to trackrex_app, trackrex_worker;

-- A person asked to decide by an approval step. Any one of the listed people may decide.
create table workflow_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  run_id uuid not null references workflow_runs (id) on delete cascade,
  step_index int not null,
  title text not null,
  body text,
  approver_user_ids uuid[] not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid,
  decided_at timestamptz,
  comment text,
  created_at timestamptz not null default now(),
  unique (run_id, step_index)
);
create index workflow_approvals_pending on workflow_approvals using gin (approver_user_ids) where status = 'pending';
alter table workflow_approvals enable row level security;
alter table workflow_approvals force row level security;
create policy tenant_isolation on workflow_approvals using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on workflow_approvals to trackrex_app, trackrex_worker;

-- Built-in multi-level approval of leave, regularizations and expenses: how many levels a request needs, and who decided each.
create table approval_progress (
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  subject_type text not null check (subject_type in ('leave', 'regularization', 'expense')),
  subject_id uuid not null,
  levels_required int not null check (levels_required between 1 and 3),
  created_at timestamptz not null default now(),
  primary key (tenant_id, subject_type, subject_id)
);
alter table approval_progress enable row level security;
alter table approval_progress force row level security;
create policy tenant_isolation on approval_progress using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on approval_progress to trackrex_app, trackrex_worker;

create table approval_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  subject_type text not null,
  subject_id uuid not null,
  level int not null,
  decision text not null check (decision in ('approved', 'rejected')),
  decided_by_user uuid,
  decided_by_employee uuid,
  override boolean not null default false,
  comment text,
  decided_at timestamptz not null default now(),
  unique (tenant_id, subject_type, subject_id, level)
);
alter table approval_steps enable row level security;
alter table approval_steps force row level security;
create policy tenant_isolation on approval_steps using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert on approval_steps to trackrex_app, trackrex_worker;


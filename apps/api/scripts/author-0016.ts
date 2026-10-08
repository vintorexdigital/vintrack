/** One-off authoring tool: writes the entity part of migrations/0016_workflows.{up,down}.sql (runs and approvals are hand-written after it). */
import { writeFileSync } from 'node:fs';
import { workflows } from '@trackrex/schemas';
import { entitySql } from '../src/shared/crud/entity-sql.js';

const p = entitySql(workflows, new Set(['workflows']));
const rls = (t: string, grants = 'select, insert, update, delete') => `alter table ${t} enable row level security;
alter table ${t} force row level security;
create policy tenant_isolation on ${t} using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant ${grants} on ${t} to trackrex_app, trackrex_worker;`;
const extra = `
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
${rls('workflow_runs')}

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
${rls('workflow_approvals')}

-- Built-in multi-level approval of leave, regularizations and expenses: how many levels a request needs, and who decided each.
create table approval_progress (
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  subject_type text not null check (subject_type in ('leave', 'regularization', 'expense')),
  subject_id uuid not null,
  levels_required int not null check (levels_required between 1 and 3),
  created_at timestamptz not null default now(),
  primary key (tenant_id, subject_type, subject_id)
);
${rls('approval_progress')}

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
${rls('approval_steps', 'select, insert')}
`;
writeFileSync('migrations/0016_workflows.up.sql', ['-- Workflows, their runs and approvals, and multi-level approval progress.', p.create, p.fks, extra].join('\n\n') + '\n');
writeFileSync('migrations/0016_workflows.down.sql', ['drop table if exists approval_steps;', 'drop table if exists approval_progress;', 'drop table if exists workflow_approvals;', 'drop table if exists workflow_runs;', p.down].join('\n') + '\n');
console.log('wrote 0016');

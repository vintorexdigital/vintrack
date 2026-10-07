/** One-off authoring tool: writes the entity part of migrations/0015_task_forms.{up,down}.sql (the response table is hand-written after it). */
import { writeFileSync } from 'node:fs';
import { formTemplates } from '@trackrex/schemas';
import { entitySql } from '../src/shared/crud/entity-sql.js';

const p = entitySql(formTemplates, new Set(['form_templates']));
const extra = `
-- One form per task: a frozen copy of the questions as they were when it was attached, and the answers.
create table task_forms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  task_id uuid not null,
  template_id uuid,
  template_name text not null,
  questions jsonb not null,
  required_to_complete boolean not null default true,
  answers jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  attached_by uuid,
  submitted_by uuid,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, task_id),
  foreign key (tenant_id, task_id) references tasks (tenant_id, id) deferrable initially deferred
);
alter table task_forms enable row level security;
alter table task_forms force row level security;
create policy tenant_isolation on task_forms using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on task_forms to trackrex_app, trackrex_worker;
`;
writeFileSync('migrations/0015_task_forms.up.sql', ['-- Task forms: templates built by admins and answered on tasks.', p.create, p.fks, extra].join('\n\n') + '\n');
writeFileSync('migrations/0015_task_forms.down.sql', ['drop table if exists task_forms;', p.down].join('\n') + '\n');
console.log('wrote 0015');

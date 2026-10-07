-- Task forms: templates built by admins and answered on tasks.

create table form_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  name text not null,
  description text,
  status text default 'active' check (status in ('active', 'archived')),
  task_types text[],
  required_to_complete boolean default true,
  questions jsonb not null,
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
create index form_templates_tenant_live on form_templates (tenant_id) where deleted_at is null;
create index form_templates_name_sort on form_templates (tenant_id, name, id);
create index form_templates_name_trgm on form_templates using gin (lower(name) gin_trgm_ops);
alter table form_templates enable row level security;
alter table form_templates force row level security;
create policy tenant_isolation on form_templates using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on form_templates to trackrex_app, trackrex_worker;




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


-- Help desk and assets.

create table tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  code text,
  subject text not null,
  description text,
  requester_id uuid not null,
  category text not null default 'it' check (category in ('it', 'hr', 'admin', 'facilities', 'finance', 'other')),
  priority text default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text default 'open' check (status in ('open', 'in_progress', 'waiting', 'resolved', 'closed')),
  assignee_id uuid,
  first_response_due_at timestamptz,
  resolution_due_at timestamptz,
  first_responded_at timestamptz,
  resolved_at timestamptz,
  rating double precision,
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
create index tickets_tenant_live on tickets (tenant_id) where deleted_at is null;
create unique index tickets_code_uq on tickets (tenant_id, code) where code is not null;
create index tickets_subject_trgm on tickets using gin (lower(subject) gin_trgm_ops);
create index tickets_requester_id_ref on tickets (tenant_id, requester_id) where requester_id is not null;
create index tickets_priority_sort on tickets (tenant_id, priority, id);
create index tickets_assignee_id_ref on tickets (tenant_id, assignee_id) where assignee_id is not null;
create index tickets_resolution_due_at_sort on tickets (tenant_id, resolution_due_at, id);
alter table tickets enable row level security;
alter table tickets force row level security;
create policy tenant_isolation on tickets using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on tickets to trackrex_app, trackrex_worker;

create table assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  code text,
  name text not null,
  category text not null default 'laptop' check (category in ('laptop', 'phone', 'vehicle', 'id_card', 'furniture', 'other')),
  serial text,
  purchase_date date,
  cost double precision,
  status text default 'in_stock' check (status in ('in_stock', 'assigned', 'repair', 'retired')),
  assigned_to_id uuid,
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
create index assets_tenant_live on assets (tenant_id) where deleted_at is null;
create unique index assets_code_uq on assets (tenant_id, code) where code is not null;
create index assets_name_sort on assets (tenant_id, name, id);
create index assets_name_trgm on assets using gin (lower(name) gin_trgm_ops);
create index assets_serial_trgm on assets using gin (lower(serial) gin_trgm_ops);
create index assets_assigned_to_id_ref on assets (tenant_id, assigned_to_id) where assigned_to_id is not null;
alter table assets enable row level security;
alter table assets force row level security;
create policy tenant_isolation on assets using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on assets to trackrex_app, trackrex_worker;

alter table tickets add constraint tickets_requester_id_fk foreign key (tenant_id, requester_id) references employees (tenant_id, id) deferrable initially deferred;
alter table tickets add constraint tickets_assignee_id_fk foreign key (tenant_id, assignee_id) references employees (tenant_id, id) deferrable initially deferred;

alter table assets add constraint assets_assigned_to_id_fk foreign key (tenant_id, assigned_to_id) references employees (tenant_id, id) deferrable initially deferred;


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
alter table ticket_comments enable row level security;
alter table ticket_comments force row level security;
create policy tenant_isolation on ticket_comments using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert on ticket_comments to trackrex_app, trackrex_worker;

-- Which service-level deadlines have already been reported as missed, so each is reported once.
create table ticket_sla (
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  ticket_id uuid not null,
  response_breached_at timestamptz,
  resolution_breached_at timestamptz,
  primary key (tenant_id, ticket_id),
  foreign key (tenant_id, ticket_id) references tickets (tenant_id, id) deferrable initially deferred
);
alter table ticket_sla enable row level security;
alter table ticket_sla force row level security;
create policy tenant_isolation on ticket_sla using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on ticket_sla to trackrex_app, trackrex_worker;

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
alter table asset_assignments enable row level security;
alter table asset_assignments force row level security;
create policy tenant_isolation on asset_assignments using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update on asset_assignments to trackrex_app, trackrex_worker;


-- Leads and the call log.

create table leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  code text,
  name text not null,
  company_name text,
  phone text,
  email text,
  source text default 'manual' check (source in ('manual', 'web_form', 'referral', 'campaign', 'walk_in', 'other')),
  stage text default 'new' check (stage in ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost')),
  owner_id uuid not null,
  value double precision,
  next_follow_up_at timestamptz,
  lost_reason text,
  converted_customer_id uuid,
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
create index leads_tenant_live on leads (tenant_id) where deleted_at is null;
create unique index leads_code_uq on leads (tenant_id, code) where code is not null;
create index leads_name_trgm on leads using gin (lower(name) gin_trgm_ops);
create index leads_company_name_trgm on leads using gin (lower(company_name) gin_trgm_ops);
create index leads_phone_trgm on leads using gin (lower(phone) gin_trgm_ops);
create index leads_email_trgm on leads using gin (lower(email) gin_trgm_ops);
create index leads_stage_sort on leads (tenant_id, stage, id);
create index leads_owner_id_ref on leads (tenant_id, owner_id) where owner_id is not null;
create index leads_value_sort on leads (tenant_id, value, id);
create index leads_next_follow_up_at_sort on leads (tenant_id, next_follow_up_at, id);
alter table leads enable row level security;
alter table leads force row level security;
create policy tenant_isolation on leads using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on leads to trackrex_app, trackrex_worker;

create table call_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  employee_id uuid not null,
  direction text not null default 'outgoing' check (direction in ('outgoing', 'incoming', 'missed')),
  phone text not null,
  started_at timestamptz not null,
  duration_seconds double precision default 0,
  outcome text default 'connected' check (outcome in ('connected', 'no_answer', 'busy', 'voicemail', 'wrong_number')),
  customer_id uuid,
  lead_id uuid,
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
create index call_logs_tenant_live on call_logs (tenant_id) where deleted_at is null;
create index call_logs_employee_id_ref on call_logs (tenant_id, employee_id) where employee_id is not null;
create index call_logs_phone_trgm on call_logs using gin (lower(phone) gin_trgm_ops);
create index call_logs_started_at_sort on call_logs (tenant_id, started_at, id);
create index call_logs_customer_id_ref on call_logs (tenant_id, customer_id) where customer_id is not null;
create index call_logs_lead_id_ref on call_logs (tenant_id, lead_id) where lead_id is not null;
alter table call_logs enable row level security;
alter table call_logs force row level security;
create policy tenant_isolation on call_logs using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on call_logs to trackrex_app, trackrex_worker;

alter table leads add constraint leads_owner_id_fk foreign key (tenant_id, owner_id) references employees (tenant_id, id) deferrable initially deferred;
alter table leads add constraint leads_converted_customer_id_fk foreign key (tenant_id, converted_customer_id) references customers (tenant_id, id) deferrable initially deferred;

alter table call_logs add constraint call_logs_employee_id_fk foreign key (tenant_id, employee_id) references employees (tenant_id, id) deferrable initially deferred;
alter table call_logs add constraint call_logs_customer_id_fk foreign key (tenant_id, customer_id) references customers (tenant_id, id) deferrable initially deferred;
alter table call_logs add constraint call_logs_lead_id_fk foreign key (tenant_id, lead_id) references leads (tenant_id, id) deferrable initially deferred;

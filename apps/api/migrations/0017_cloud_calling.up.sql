-- Calls placed through Trackrex: the employee's phone is rung first, then the customer is connected.
create table call_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  employee_id uuid not null,
  customer_id uuid,
  lead_id uuid,
  agent_number text not null,
  customer_number text not null,
  status text not null default 'queued' check (status in ('queued', 'ringing_agent', 'ringing_customer', 'in_progress', 'completed', 'no_answer', 'busy', 'failed')),
  provider text not null,
  provider_call_id text,
  recording_requested boolean not null default false,
  recording_key text,
  recording_seconds int,
  recording_removed boolean not null default false,
  started_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  duration_seconds int not null default 0,
  call_log_id uuid,
  error text,
  created_by uuid,
  foreign key (tenant_id, employee_id) references employees (tenant_id, id)
);
create unique index call_sessions_provider_call on call_sessions (provider_call_id) where provider_call_id is not null;
create index call_sessions_employee on call_sessions (tenant_id, employee_id, started_at desc);
create index call_sessions_customer on call_sessions (tenant_id, customer_id, started_at desc) where customer_id is not null;
create index call_sessions_lead on call_sessions (tenant_id, lead_id, started_at desc) where lead_id is not null;
alter table call_sessions enable row level security;
alter table call_sessions force row level security;
create policy tenant_isolation on call_sessions using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update on call_sessions to trackrex_app, trackrex_worker;

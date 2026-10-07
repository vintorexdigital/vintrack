-- SMS, WhatsApp and push: per-person opt-ins, registered push devices, and a log of every message the system sent.
alter table notification_prefs add column sms boolean not null default false;
alter table notification_prefs add column whatsapp boolean not null default false;
alter table notification_prefs add column push boolean not null default true;

create table push_devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  user_id uuid not null,
  token text not null,
  platform text not null check (platform in ('ios', 'android', 'web')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (tenant_id, user_id, token)
);
create index push_devices_user on push_devices (tenant_id, user_id) where revoked_at is null;
alter table push_devices enable row level security;
alter table push_devices force row level security;
create policy tenant_isolation on push_devices using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on push_devices to trackrex_app, trackrex_worker;

create table message_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  user_id uuid,
  channel text not null check (channel in ('email', 'sms', 'whatsapp', 'push')),
  to_address text not null,
  template text not null,
  subject text,
  body text not null,
  status text not null check (status in ('sent', 'failed')),
  provider text not null,
  provider_id text,
  error text,
  event_id bigint,
  created_at timestamptz not null default now()
);
create index message_log_recent on message_log (tenant_id, created_at desc);
alter table message_log enable row level security;
alter table message_log force row level security;
create policy tenant_isolation on message_log using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, delete on message_log to trackrex_app, trackrex_worker;

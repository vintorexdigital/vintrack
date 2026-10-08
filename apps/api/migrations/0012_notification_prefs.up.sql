-- Per-person notification preferences. No row means the defaults: email on.
create table notification_prefs (
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  user_id uuid not null,
  email boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
alter table notification_prefs enable row level security;
alter table notification_prefs force row level security;
create policy tenant_isolation on notification_prefs using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on notification_prefs to trackrex_app, trackrex_worker;

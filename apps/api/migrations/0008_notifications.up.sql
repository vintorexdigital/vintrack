-- In-app notifications, one row per recipient, created by the outbox relay.
create table notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  user_id uuid not null,
  type text not null,
  title text not null,
  body text,
  link text,
  event_id bigint,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create unique index notifications_once_per_event on notifications (tenant_id, user_id, event_id, type) where event_id is not null;
create index notifications_inbox on notifications (tenant_id, user_id, created_at desc);
create index notifications_unread on notifications (tenant_id, user_id) where read_at is null;
alter table notifications enable row level security;
alter table notifications force row level security;
create policy tenant_isolation on notifications using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on notifications to trackrex_app, trackrex_worker;

-- Activity feed projected from outbox events.
create table feed_events (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null,
  at timestamptz not null,
  type text not null,
  employee_id uuid,
  actor_user_id uuid,
  platform text check (platform in ('android','ios','desktop','web','system')),
  entity text,
  entity_id text,
  meta jsonb not null default '{}',
  primary key (id, at)
) partition by range (at);
create index feed_events_at on feed_events (tenant_id, at desc);
create index feed_events_employee on feed_events (tenant_id, employee_id, at desc);
create table feed_events_default partition of feed_events default;
grant select, insert on feed_events_default to trackrex_app, trackrex_worker;
select ensure_monthly_partitions('feed_events', 2, 3);
alter table feed_events enable row level security;
alter table feed_events force row level security;
create policy tenant_isolation on feed_events using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert on feed_events to trackrex_app, trackrex_worker;
-- the outbox relay marks events processed
grant update (processed_at, attempts, last_error) on outbox to trackrex_app, trackrex_worker;

-- Partition upkeep is DDL, so it runs as the owner through a SECURITY DEFINER function the worker can call.
create function maintain_partitions(months_ahead int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform ensure_audit_partitions(1, months_ahead);
  perform ensure_monthly_partitions('punches', 1, months_ahead);
  perform ensure_monthly_partitions('feed_events', 1, months_ahead);
end $$;
revoke all on function maintain_partitions(int) from public;
grant execute on function maintain_partitions(int) to trackrex_app, trackrex_worker;

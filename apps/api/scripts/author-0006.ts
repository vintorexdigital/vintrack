/** One-off authoring tool: writes migrations/0006_field_ops.{up,down}.sql. */
import { writeFileSync } from 'node:fs';
import { contacts, customers, tasks } from '@trackrex/schemas';
import { entitySql } from '../src/shared/crud/entity-sql.js';

const known = new Set(['employees', 'geo_fences', 'customers', 'contacts', 'tasks']);
const parts = [customers, contacts, tasks].map((k) => entitySql(k, known));
const extras = `
-- Raw location points. Partitioned by month; a retention job drops old data per tenant setting.
create table location_pings (
  id uuid not null default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  employee_id uuid not null,
  at timestamptz not null,
  latitude double precision not null,
  longitude double precision not null,
  accuracy real,
  speed real,
  heading real,
  battery smallint,
  provider text,
  mock boolean not null default false,
  device_id text,
  received_at timestamptz not null default now(),
  primary key (id, at)
) partition by range (at);
create unique index location_pings_dedupe on location_pings (tenant_id, employee_id, at);
create index location_pings_employee_at on location_pings (tenant_id, employee_id, at desc);
create table location_pings_default partition of location_pings default;
grant select, insert, delete on location_pings_default to trackrex_app, trackrex_worker;
select ensure_monthly_partitions('location_pings', 1, 3);
alter table location_pings enable row level security;
alter table location_pings force row level security;
create policy tenant_isolation on location_pings using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, delete on location_pings to trackrex_app, trackrex_worker;

-- Latest known position per employee, for the live map. One row each, upserted on ingest.
create table live_locations (
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  employee_id uuid not null,
  at timestamptz not null,
  latitude double precision not null,
  longitude double precision not null,
  accuracy real,
  battery smallint,
  moving boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, employee_id),
  foreign key (tenant_id, employee_id) references employees (tenant_id, id)
);
alter table live_locations enable row level security;
alter table live_locations force row level security;
create policy tenant_isolation on live_locations using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on live_locations to trackrex_app, trackrex_worker;

create or replace function maintain_partitions(months_ahead int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform ensure_audit_partitions(1, months_ahead);
  perform ensure_monthly_partitions('punches', 1, months_ahead);
  perform ensure_monthly_partitions('feed_events', 1, months_ahead);
  perform ensure_monthly_partitions('location_pings', 1, months_ahead);
end $$;
`;
const downExtras = `
create or replace function maintain_partitions(months_ahead int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform ensure_audit_partitions(1, months_ahead);
  perform ensure_monthly_partitions('punches', 1, months_ahead);
  perform ensure_monthly_partitions('feed_events', 1, months_ahead);
end $$;
drop table if exists live_locations cascade;
drop table if exists location_pings cascade;`;
writeFileSync('migrations/0006_field_ops.up.sql', ['-- Customers, contacts, tasks, location ingest.', ...parts.map((p) => p.create), ...parts.map((p) => p.fks), extras].join('\n\n') + '\n');
writeFileSync('migrations/0006_field_ops.down.sql', [...[...parts].reverse().map((p) => p.down), downExtras].join('\n') + '\n');
console.log('wrote 0006');

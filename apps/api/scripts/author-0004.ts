/** One-off authoring tool: writes migrations/0004_geo_devices.{up,down}.sql. */
import { writeFileSync } from 'node:fs';
import { geoFences } from '@trackrex/schemas';
import { entitySql } from '../src/shared/crud/entity-sql.js';

const s = entitySql(geoFences, new Set(['work_locations', 'geo_fences']));
const extras = `
alter table punches add column if not exists fence_matched boolean;

create table devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references platform.tenants(id) on delete cascade,
  employee_id uuid not null,
  device_id text not null,
  platform text not null check (platform in ('android','ios','windows','macos','web')),
  model text,
  app_version text,
  bound_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  foreign key (tenant_id, employee_id) references employees (tenant_id, id)
);
create unique index devices_one_active on devices (tenant_id, employee_id, platform) where revoked_at is null;
create index devices_lookup on devices (tenant_id, device_id);
alter table devices enable row level security;
alter table devices force row level security;
create policy tenant_isolation on devices using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());
grant select, insert, update, delete on devices to trackrex_app, trackrex_worker;
`;
writeFileSync('migrations/0004_geo_devices.up.sql', ['-- Geo-fences and device binding.', s.create, s.fks, extras].join('\n\n') + '\n');
writeFileSync('migrations/0004_geo_devices.down.sql', ['drop table if exists devices cascade;', 'alter table punches drop column if exists fence_matched;', s.down].join('\n') + '\n');
console.log('wrote 0004');

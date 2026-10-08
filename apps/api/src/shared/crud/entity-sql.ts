import type { EntityKit, FieldDef } from '@trackrex/schemas';

export const snake = (s: string): string => s.replace(/([A-Z])/g, '_$1').replace(/-/g, '_').toLowerCase();
export const camel = (s: string): string => s.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

export const tableNameFor = (kit: EntityKit): string => snake(kit.def.key);

const SQL_TYPE: Record<string, string> = {
  text: 'text', textarea: 'text', email: 'text', phone: 'text', color: 'text', select: 'text',
  number: 'double precision', boolean: 'boolean', date: 'date', time: 'time', datetime: 'timestamptz',
  multiselect: 'text[]', ref: 'uuid', multiref: 'uuid[]', json: 'jsonb',
};

export const sqlType = (d: FieldDef): string => SQL_TYPE[d.kind]!;

const lit = (v: unknown): string => (typeof v === 'string' ? `'${v.replace(/'/g, "''")}'` : String(v));

function columnSql(key: string, d: FieldDef): string {
  const parts = [`  ${snake(key)} ${sqlType(d)}`];
  if (d.required) parts.push('not null');
  if (d.default !== undefined && d.kind !== 'json') parts.push(`default ${lit(d.default)}`);
  if (d.kind === 'select' && d.options) {
    parts.push(`check (${snake(key)} in (${d.options.map((o) => lit(o.value)).join(', ')}))`);
  }
  return parts.join(' ');
}

export interface EntitySql {
  table: string;
  create: string;
  fks: string;
  down: string;
}

/**
 * Deterministic DDL for a CRUD entity: standard columns, typed fields, composite same-tenant
 * foreign keys, trigram search indexes, keyset-sort indexes and the tenant isolation policy.
 * Migrations embed this output; a test fails if they drift from the entity definition.
 */
export function entitySql(kit: EntityKit, known: ReadonlySet<string>): EntitySql {
  const table = tableNameFor(kit);
  const fields = Object.entries(kit.def.fields);
  const cols = [
    '  id uuid primary key default gen_random_uuid()',
    '  tenant_id uuid not null references platform.tenants(id) on delete cascade',
    ...(kit.def.codePrefix ? ['  code text'] : []),
    ...fields.map(([k, d]) => columnSql(k, d)),
    '  created_at timestamptz not null default now()',
    '  created_by uuid',
    '  updated_at timestamptz not null default now()',
    '  updated_by uuid',
    '  deleted_at timestamptz',
    '  deleted_by uuid',
    '  delete_reason text',
    '  version integer not null default 1',
    '  unique (tenant_id, id)',
  ];
  const idx: string[] = [`create index ${table}_tenant_live on ${table} (tenant_id) where deleted_at is null;`];
  if (kit.def.codePrefix) idx.push(`create unique index ${table}_code_uq on ${table} (tenant_id, code) where code is not null;`);
  for (const u of kit.def.unique ?? []) {
    const c = snake(u);
    const expr = kit.def.fields[u]!.kind === 'text' || kit.def.fields[u]!.kind === 'email' ? `lower(${c})` : c;
    idx.push(`create unique index ${table}_${c}_uq on ${table} (tenant_id, ${expr}) where deleted_at is null and ${c} is not null;`);
  }
  for (const [k, d] of fields) {
    if (d.sort && !(kit.def.unique ?? []).includes(k)) idx.push(`create index ${table}_${snake(k)}_sort on ${table} (tenant_id, ${snake(k)}, id);`);
    if (d.search) idx.push(`create index ${table}_${snake(k)}_trgm on ${table} using gin (lower(${snake(k)}) gin_trgm_ops);`);
    if (d.kind === 'ref' && d.filter) idx.push(`create index ${table}_${snake(k)}_ref on ${table} (tenant_id, ${snake(k)}) where ${snake(k)} is not null;`);
  }
  const create = [
    `create table ${table} (\n${cols.join(',\n')}\n);`,
    ...idx,
    `alter table ${table} enable row level security;`,
    `alter table ${table} force row level security;`,
    `create policy tenant_isolation on ${table} using (tenant_id = app_tenant_id()) with check (tenant_id = app_tenant_id());`,
    `grant select, insert, update, delete on ${table} to trackrex_app, trackrex_worker;`,
  ].join('\n');

  const fks = fields
    .filter(([, d]) => d.kind === 'ref' && d.ref && known.has(snake(d.ref.entity)))
    .map(([k, d]) => {
      const target = snake(d.ref!.entity);
      return `alter table ${table} add constraint ${table}_${snake(k)}_fk foreign key (tenant_id, ${snake(k)}) references ${target} (tenant_id, id) deferrable initially deferred;`;
    })
    .join('\n');

  return { table, create, fks, down: `drop table if exists ${table} cascade;` };
}

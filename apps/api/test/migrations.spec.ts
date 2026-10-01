import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { getTableColumns } from 'drizzle-orm';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { ALL_KITS } from '@trackrex/schemas';
import { MIGRATIONS_DIR, readMigrations } from '../src/core/database/migrator.js';
import { entitySql, tableNameFor } from '../src/shared/crud/entity-sql.js';
import { tableFromKit } from '../src/shared/crud/table-from-kit.js';

describe('migrations', () => {
  const all = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.up.sql')).map((f) => readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')).join('\n');

  it('come in up and down pairs', () => {
    const files = readdirSync(MIGRATIONS_DIR);
    for (const m of readMigrations()) {
      expect(files).toContain(`${m.name}.up.sql`);
      expect(files).toContain(`${m.name}.down.sql`);
      expect(m.down.trim().length).toBeGreaterThan(0);
    }
  });

  it.each(ALL_KITS.map((k) => [k.def.key, k] as const))('%s: committed SQL still matches the entity definition', (_key, kit) => {
    const known = new Set(ALL_KITS.map((k) => tableNameFor(k)));
    expect(all).toContain(entitySql(kit, known).create);
  });

  it.each(ALL_KITS.map((k) => [k.def.key, k] as const))('%s: the Drizzle table maps to real database columns', async (_key, kit) => {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      const rows = (await client.query(`select column_name from information_schema.columns where table_schema = 'public' and table_name = $1`, [tableNameFor(kit)])).rows as { column_name: string }[];
      const db = new Set(rows.map((r) => r.column_name));
      for (const col of Object.values(getTableColumns(tableFromKit(kit))) as { name: string }[]) expect(db.has(col.name), `${tableNameFor(kit)}.${col.name}`).toBe(true);
    } finally {
      await client.end();
    }
  });

  it('every tenant table has row level security forced and a tenant policy', async () => {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      const res = await client.query(`
        select c.relname, c.relrowsecurity, c.relforcerowsecurity, exists (select 1 from pg_policy p where p.polrelid = c.oid) as has_policy
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r','p') and c.relname not like '\\_%' and c.relname not in ('audit_log_default')
          and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped)
          and not c.relispartition`);
      expect(res.rows.length).toBeGreaterThan(15);
      for (const r of res.rows as { relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean; has_policy: boolean }[]) {
        expect(r.relrowsecurity && r.relforcerowsecurity && r.has_policy, `${r.relname} must have forced RLS and a policy`).toBe(true);
      }
    } finally {
      await client.end();
    }
  });
});

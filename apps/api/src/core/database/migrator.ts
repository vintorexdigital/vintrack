import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
/** Next to the source in development; images set MIGRATIONS_DIR because the bundle lives elsewhere. */
export const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? path.resolve(here, '../../../migrations');

export interface MigrationFile {
  name: string;
  up: string;
  down: string;
}

export function readMigrations(dir = MIGRATIONS_DIR): MigrationFile[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.up.sql'))
    .sort()
    .map((f) => {
      const name = f.replace(/\.up\.sql$/, '');
      return { name, up: readFileSync(path.join(dir, f), 'utf8'), down: readFileSync(path.join(dir, `${name}.down.sql`), 'utf8') };
    });
}

/** Apply or roll back paired SQL migrations, each in its own transaction. */
export async function migrate(databaseUrl: string, direction: 'up' | 'down', steps = Infinity): Promise<string[]> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const done: string[] = [];
  try {
    await client.query(`create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())`);
    const applied = new Set((await client.query<{ name: string }>('select name from public._migrations')).rows.map((r) => r.name));
    const all = readMigrations();
    const queue = direction === 'up' ? all.filter((m) => !applied.has(m.name)) : all.filter((m) => applied.has(m.name)).reverse();
    for (const m of queue.slice(0, steps)) {
      await client.query('begin');
      try {
        await client.query(direction === 'up' ? m.up : m.down);
        if (direction === 'up') await client.query('insert into public._migrations (name) values ($1)', [m.name]);
        else await client.query('delete from public._migrations where name = $1', [m.name]);
        await client.query('commit');
        done.push(m.name);
      } catch (e) {
        await client.query('rollback');
        throw new Error(`Migration ${m.name} (${direction}) failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await client.end();
  }
  return done;
}

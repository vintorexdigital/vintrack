import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { CONFIG, type Config } from '../config.js';
import { als, currentStore, type Store, type Tx } from '../context.js';

// Keep dates and numbers as plain strings or numbers on the wire.
pg.types.setTypeParser(1082, (v) => v); // date -> 'YYYY-MM-DD'
pg.types.setTypeParser(1083, (v) => v.slice(0, 5)); // time -> 'HH:mm'
pg.types.setTypeParser(1114, (v) => new Date(v + 'Z').toISOString());
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString());
pg.types.setTypeParser(20, (v) => Number(v)); // bigint
pg.types.setTypeParser(1700, (v) => Number(v)); // numeric

export type PlatformDb = NodePgDatabase<Record<string, never>>;

@Injectable()
export class Db implements OnModuleDestroy {
  readonly appPool: pg.Pool;
  readonly platformPool: pg.Pool;
  readonly workerPool: pg.Pool;
  /** Platform-schema reads and writes outside a tenant transaction (sign-in, provisioning lookups). */
  readonly app: PlatformDb;
  /** The platform console role: cannot touch tenant tables. */
  readonly platform: PlatformDb;

  constructor(@Inject(CONFIG) cfg: Config) {
    this.appPool = new pg.Pool({ connectionString: cfg.DATABASE_APP_URL, max: 20 });
    this.platformPool = new pg.Pool({ connectionString: cfg.DATABASE_PLATFORM_URL, max: 10 });
    this.workerPool = new pg.Pool({ connectionString: cfg.DATABASE_WORKER_URL, max: 10 });
    for (const p of [this.appPool, this.platformPool, this.workerPool]) p.on('error', () => undefined);
    this.app = drizzle(this.appPool);
    this.platform = drizzle(this.platformPool);
  }

  /** The transaction of the current request or job. RLS context is already set on it. */
  get q(): Tx {
    const s = currentStore();
    if (!s.tx) throw new Error('No tenant transaction is open for this request.');
    return s.tx;
  }

  get hasTx(): boolean {
    return !!als.getStore()?.tx;
  }

  /**
   * Run `fn` in a transaction scoped to one tenant. `set_config(..., true)` makes the settings
   * transaction-local, so a pooled connection can never leak one tenant's context into another.
   */
  async inTenant<T>(
    store: Store,
    tenantId: string,
    who: { userId?: string | undefined; employeeId?: string | null | undefined },
    fn: () => Promise<T>,
  ): Promise<T> {
    if (store.tx) return fn(); // already inside a tenant transaction
    const client = await this.appPool.connect();
    try {
      await client.query('begin');
      await client.query(
        `select set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true), set_config('app.employee_id', $3, true)`,
        [tenantId, who.userId ?? '', who.employeeId ?? ''],
      );
      store.tx = drizzle(client) as Tx;
      store.client = client;
      store.tenantId = tenantId;
      try {
        const out = await fn();
        await client.query('commit');
        return out;
      } catch (e) {
        await client.query('rollback').catch(() => undefined);
        throw e;
      }
    } finally {
      delete store.tx;
      delete store.client;
      client.release();
    }
  }

  /** Convenience for jobs, seeds and tests: open a store, then a tenant transaction. */
  runAsTenant<T>(tenantId: string, who: { userId?: string; employeeId?: string | null }, fn: () => Promise<T>, source: Store['source'] = 'system'): Promise<T> {
    const store: Store = { requestId: `job-${Date.now()}`, ip: undefined, userAgent: undefined, source };
    return als.run(store, () => this.inTenant(store, tenantId, who, fn));
  }

  async queryRows<T = Record<string, unknown>>(query: ReturnType<typeof sql>, executor: PlatformDb | Tx = this.q): Promise<T[]> {
    const res = await executor.execute(query);
    return res.rows as T[];
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.appPool.end(), this.platformPool.end(), this.workerPool.end()]);
  }
}

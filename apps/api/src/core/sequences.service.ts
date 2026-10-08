import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Db } from './database/db.service.js';
import { currentStore } from './context.js';

@Injectable()
export class SequencesService {
  constructor(private readonly db: Db) {}

  /** Next human-readable code for a key, e.g. EMP-0007. Atomic per tenant and key. */
  async next(key: string, prefix: string, padding = 4): Promise<string> {
    const tenantId = currentStore().tenantId;
    const res = await this.db.q.execute(sql`
      insert into sequences (tenant_id, key, prefix, next_value, padding)
      values (${tenantId}, ${key}, ${prefix}, 2, ${padding})
      on conflict (tenant_id, key) do update set next_value = sequences.next_value + 1
      returning prefix, padding, next_value - 1 as n`);
    const row = res.rows[0] as { prefix: string; padding: number; n: number };
    return `${row.prefix}-${String(row.n).padStart(row.padding, '0')}`;
  }
}

import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Db } from './database/db.service.js';
import { currentStore } from './context.js';

/** Domain events are written in the same transaction as the change, then relayed by the worker. */
@Injectable()
export class OutboxService {
  constructor(private readonly db: Db) {}

  async emit(type: string, payload: Record<string, unknown>): Promise<void> {
    const s = currentStore();
    await this.db.q.execute(sql`
      insert into outbox (tenant_id, type, payload, actor_user_id)
      values (${s.tenantId}, ${type}, ${JSON.stringify(payload)}::jsonb, ${s.auth?.userId ?? null})`);
  }
}

import { sql } from 'drizzle-orm';
import { Db } from '../core/database/db.service.js';

export interface OutboxEvent {
  id: number;
  tenantId: string;
  type: string;
  payload: Record<string, unknown>;
  actorUserId: string | null;
  createdAt: string;
}

export type OutboxHandler = (event: OutboxEvent) => Promise<void>;

const FEED_PLATFORM: Record<string, string> = { mobile: 'android', desktop: 'desktop', web: 'web', admin: 'web', system: 'system' };

/** Turn domain events into feed entries. Webhooks and notifications register more handlers later. */
export function feedProjection(db: Db): OutboxHandler {
  const FEED_TYPES = new Set(['punch.in', 'punch.out', 'punch.auto_out', 'leave.requested', 'leave.approved', 'leave.rejected', 'leave.cancelled', 'regularization.requested', 'regularization.approved', 'regularization.rejected', 'employee.exited', 'task.assigned', 'task.started', 'task.completed', 'task.cancelled', 'expense.submitted', 'expense.approved', 'expense.rejected', 'expense.paid', 'lead.assigned', 'lead.stage_changed', 'lead.converted']);
  return async (e) => {
    if (!FEED_TYPES.has(e.type)) return;
    const p = e.payload;
    const employeeId = (p.employeeId as string | undefined) ?? (p.id as string | undefined) ?? null;
    const platform = e.type === 'punch.auto_out' ? 'system' : FEED_PLATFORM[String(p.source ?? 'web')] ?? 'web';
    await db.q.execute(sql`
      insert into feed_events (tenant_id, at, type, employee_id, actor_user_id, platform, entity, entity_id, meta)
      values (${e.tenantId}::uuid, ${e.createdAt}::timestamptz, ${e.type}, ${employeeId}::uuid, ${e.actorUserId}::uuid, ${platform}, ${e.type.split('.')[0]}, ${(p.id as string | undefined) ?? null}, ${JSON.stringify(p)}::jsonb)`);
  };
}

/**
 * Deliver pending events for one tenant in order. Handlers must be idempotent: a crash after a
 * handler runs but before the row is marked processed delivers the event again.
 */
export async function relayTenantOutbox(db: Db, tenantId: string, handlers: OutboxHandler[], batch = 200): Promise<number> {
  return db.runAsTenant(tenantId, {}, async () => {
    const res = await db.q.execute(sql`select id, tenant_id, type, payload, actor_user_id, created_at from outbox where processed_at is null order by id limit ${batch} for update skip locked`);
    let done = 0;
    for (const r of res.rows as { id: number; tenant_id: string; type: string; payload: Record<string, unknown>; actor_user_id: string | null; created_at: string }[]) {
      const event: OutboxEvent = { id: r.id, tenantId: r.tenant_id, type: r.type, payload: r.payload, actorUserId: r.actor_user_id, createdAt: new Date(r.created_at).toISOString() };
      try {
        await db.q.execute(sql`savepoint ev`);
        for (const h of handlers) await h(event);
        await db.q.execute(sql`release savepoint ev`);
        await db.q.execute(sql`update outbox set processed_at = now() where id = ${r.id}`);
        done++;
      } catch (e) {
        await db.q.execute(sql`rollback to savepoint ev`);
        await db.q.execute(sql`update outbox set attempts = attempts + 1, last_error = ${String((e as Error).message).slice(0, 500)} where id = ${r.id}`);
      }
    }
    return done;
  });
}

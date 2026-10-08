import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Db } from './database/db.service.js';
import { currentStore } from './context.js';

export interface AuditChange {
  old?: unknown;
  new?: unknown;
}

export interface AuditEntry {
  entity: string;
  entityId?: string | undefined;
  action: string;
  changes?: Record<string, AuditChange>;
}

/** Field-level diff of two plain objects, ignoring bookkeeping columns. */
export function diffRecords(before: Record<string, unknown> | null, after: Record<string, unknown>, skip: ReadonlySet<string> = SKIP): Record<string, AuditChange> {
  const out: Record<string, AuditChange> = {};
  for (const key of new Set([...Object.keys(before ?? {}), ...Object.keys(after)])) {
    if (skip.has(key)) continue;
    const a = before?.[key];
    const b = after[key];
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) out[key] = { old: a ?? null, new: b ?? null };
  }
  return out;
}
const SKIP = new Set(['updatedAt', 'updatedBy', 'version', 'createdAt', 'createdBy', 'tenantId', 'deletedBy']);

@Injectable()
export class AuditService {
  constructor(private readonly db: Db) {}

  /** Append an audit row inside the current tenant transaction. */
  async record(entry: AuditEntry): Promise<void> {
    const s = currentStore();
    const a = s.auth;
    if (!s.tenantId) throw new Error('Audit requires a tenant context.');
    await this.db.q.execute(sql`
      insert into audit_log (tenant_id, actor_user_id, actor_membership_id, impersonator_id, source, ip, user_agent, entity, entity_id, action, changes, request_id)
      values (${s.tenantId}, ${a?.userId ?? null}, ${a?.membershipId ?? null}, ${a?.support?.staffId ?? null}, ${s.source},
              ${s.ip ?? null}, ${s.userAgent ?? null}, ${entry.entity}, ${entry.entityId ?? null}, ${entry.action},
              ${JSON.stringify(entry.changes ?? {})}::jsonb, ${s.requestId})`);
  }
}

import { Controller, Get, Module, Query } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { Db } from '../../core/database/db.service.js';
import { Authz } from '../../core/rbac.service.js';
import { decodeCursor, encodeCursor } from '@trackrex/schemas';

const query = z.object({
  entity: z.string().max(60).optional(),
  entityId: z.string().max(64).optional(),
  actor: z.string().uuid().optional(),
  action: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

/** Read side of the append-only audit log. Every configuration screen's "Audit history" tab uses this. */
@Controller('audit')
class AuditController {
  constructor(private readonly db: Db, private readonly authz: Authz) {}

  @Get()
  async list(@Query() raw: Record<string, unknown>) {
    this.authz.require('company.audit.read');
    const q = query.parse(raw);
    const cur = q.cursor ? decodeCursor(q.cursor) : null;
    const res = await this.db.q.execute(sql`
      select a.id, a.at, to_char(a.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "cursorAt", a.entity, a.entity_id as "entityId", a.action, a.changes, a.source, a.ip, a.request_id as "requestId",
             a.actor_user_id as "actorUserId", u.name as "actorName", a.impersonator_id as "impersonatorId"
      from audit_log a left join platform.users u on u.id = a.actor_user_id
      where true
        ${q.entity ? sql`and a.entity = ${q.entity}` : sql``}
        ${q.entityId ? sql`and a.entity_id = ${q.entityId}` : sql``}
        ${q.actor ? sql`and a.actor_user_id = ${q.actor}::uuid` : sql``}
        ${q.action ? sql`and a.action = ${q.action}` : sql``}
        ${cur ? sql`and (a.at, a.id) < (${cur.v[0]}::timestamptz, ${cur.id}::uuid)` : sql``}
      order by a.at desc, a.id desc limit ${q.limit + 1}`);
    const rows = res.rows as { id: string; cursorAt: string }[];
    const page = rows.slice(0, q.limit).map(({ cursorAt: _c, ...r }, i) => ({ ...r, ...(i === q.limit - 1 ? { cursorAt: _c } : {}) }));
    const last = page[page.length - 1] as { id: string; cursorAt?: string } | undefined;
    return { data: page, nextCursor: rows.length > q.limit && last ? encodeCursor([last.cursorAt], last.id) : null };
  }
}

@Module({ controllers: [AuditController] })
export class AuditModule {}

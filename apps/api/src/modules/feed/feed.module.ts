import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { decodeCursor, encodeCursor, uuid } from '@trackrex/schemas';
import { Db } from '../../core/database/db.service.js';
import { Authz, ScopeResolver } from '../../core/rbac.service.js';

const query = z.object({
  type: z.string().max(200).optional(),
  employeeId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

@Injectable()
export class FeedService {
  constructor(private readonly db: Db, private readonly authz: Authz, private readonly scope: ScopeResolver) {}

  async list(raw: Record<string, unknown>) {
    const q = query.parse(raw);
    const pred = this.scope.predicate(this.authz.require('feed.event.read'), sql`f.employee_id`);
    const cur = q.cursor ? decodeCursor(q.cursor) : null;
    const types = q.type?.split(',').filter(Boolean);
    const res = await this.db.q.execute(sql`
      select f.id, f.at, to_char(f.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as "cursorAt", f.type, f.employee_id as "employeeId", e.display_name as "employeeName", e.code as "employeeCode",
             f.platform, f.entity, f.entity_id as "entityId", f.meta
      from feed_events f left join employees e on e.id = f.employee_id
      where true ${types?.length ? sql`and f.type = any(${sql.param(types)}::text[])` : sql``} ${q.employeeId ? sql`and f.employee_id = ${q.employeeId}::uuid` : sql``}
        ${pred ? sql`and (${pred} or f.employee_id is null)` : sql``}
        ${cur ? sql`and (f.at, f.id) < (${cur.v[0]}::timestamptz, ${cur.id}::uuid)` : sql``}
      order by f.at desc, f.id desc limit ${q.limit + 1}`);
    const rows = res.rows as { id: string; cursorAt: string }[];
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return { data: page.map(({ cursorAt: _c, ...r }) => r), nextCursor: rows.length > q.limit && last ? encodeCursor([last.cursorAt], last.id) : null };
  }
}

@Controller('feed')
class FeedController {
  constructor(private readonly feed: FeedService) {}
  @Get() list(@Query() q: Record<string, unknown>) { return this.feed.list(q); }
}

@Module({ controllers: [FeedController], providers: [FeedService], exports: [FeedService] })
export class FeedModule {}

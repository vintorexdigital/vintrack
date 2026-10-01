import { sql } from 'drizzle-orm';
import type { Db } from '../../core/database/db.service.js';
import type { TenantSeeder } from '../accounts/provisioning.service.js';

type SeedCtx = Parameters<TenantSeeder>[0];

/** A starting point only. Companies change it; anything not listed counts as neutral. */
const DEFAULTS: [name: string, kind: 'app' | 'domain', cls: 'productive' | 'unproductive'][] = [
  ['excel', 'app', 'productive'], ['word', 'app', 'productive'], ['powerpoint', 'app', 'productive'], ['outlook', 'app', 'productive'], ['code', 'app', 'productive'],
  ['terminal', 'app', 'productive'], ['github.com', 'domain', 'productive'], ['docs.google.com', 'domain', 'productive'], ['sheets.google.com', 'domain', 'productive'],
  ['youtube.com', 'domain', 'unproductive'], ['facebook.com', 'domain', 'unproductive'], ['instagram.com', 'domain', 'unproductive'], ['netflix.com', 'domain', 'unproductive'], ['x.com', 'domain', 'unproductive'],
];

export async function seedProductivityDefaults(db: Db, ctx: SeedCtx): Promise<void> {
  for (const [name, kind, cls] of DEFAULTS) {
    await db.q.execute(sql`insert into app_classes (tenant_id, name, kind, app_class, created_by) values (${ctx.tenantId}::uuid, ${name}, ${kind}, ${cls}, ${ctx.ownerUserId}::uuid)`);
  }
}

import { sql } from 'drizzle-orm';
import { shiftRulesSchema } from '@trackrex/schemas';
import type { Db } from '../../core/database/db.service.js';
import type { TenantSeeder } from '../accounts/provisioning.service.js';

type SeedCtx = Parameters<TenantSeeder>[0];

/** A starting shift and break types so the first employee can punch right after setup. */
export async function seedTimeDefaults(db: Db, ctx: SeedCtx): Promise<void> {
  const q = db.q;
  const rules = shiftRulesSchema.parse({});
  await q.execute(sql`
    insert into shifts (tenant_id, name, timezone, start_time, max_punch_in_time, working_minutes, break_allowance_minutes, rules, status, created_by)
    values (${ctx.tenantId}::uuid, 'General shift', ${ctx.timezone}, '10:00', '10:15', 540, 60, ${JSON.stringify(rules)}::jsonb, 'active', ${ctx.ownerUserId}::uuid)`);
  for (const [name, paid, mins] of [['Lunch', false, 45], ['Tea', true, 15]] as const) {
    await q.execute(sql`insert into break_types (tenant_id, name, paid, allowance_minutes, created_by) values (${ctx.tenantId}::uuid, ${name}, ${paid}, ${mins}, ${ctx.ownerUserId}::uuid)`);
  }
}

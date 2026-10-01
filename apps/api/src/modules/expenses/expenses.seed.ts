import { sql } from 'drizzle-orm';
import type { Db } from '../../core/database/db.service.js';
import type { TenantSeeder } from '../accounts/provisioning.service.js';

type SeedCtx = Parameters<TenantSeeder>[0];

const DEFAULTS: { name: string; noteRequired?: boolean }[] = [
  { name: 'Travel' }, { name: 'Fuel' }, { name: 'Meals' }, { name: 'Accommodation' }, { name: 'Office supplies' }, { name: 'Client entertainment', noteRequired: true }, { name: 'Other', noteRequired: true },
];

export async function seedExpenseDefaults(db: Db, ctx: SeedCtx): Promise<void> {
  for (const c of DEFAULTS) {
    await db.q.execute(sql`insert into expense_categories (tenant_id, name, note_required, status, created_by) values (${ctx.tenantId}::uuid, ${c.name}, ${c.noteRequired ?? false}, 'active', ${ctx.ownerUserId}::uuid)`);
  }
}

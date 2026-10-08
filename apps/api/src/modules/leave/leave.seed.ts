import { sql } from 'drizzle-orm';
import { entitlementSchema, restrictionsSchema } from '@trackrex/schemas';
import type { Db } from '../../core/database/db.service.js';
import type { TenantSeeder } from '../accounts/provisioning.service.js';

type SeedCtx = Parameters<TenantSeeder>[0];

/** Fixed-date public holidays per country. State and festival lists are added in the onboarding wizard. */
const FIXED_HOLIDAYS: Record<string, { name: string; md: string }[]> = {
  IN: [
    { name: 'New Year\'s Day', md: '01-01' }, { name: 'Republic Day', md: '01-26' }, { name: 'May Day', md: '05-01' },
    { name: 'Independence Day', md: '08-15' }, { name: 'Gandhi Jayanti', md: '10-02' }, { name: 'Christmas', md: '12-25' },
  ],
  US: [
    { name: 'New Year\'s Day', md: '01-01' }, { name: 'Independence Day', md: '07-04' }, { name: 'Christmas', md: '12-25' },
  ],
};

export async function seedLeaveDefaults(db: Db, ctx: SeedCtx): Promise<void> {
  const q = db.q;
  const profile = (await q.execute(sql`insert into leave_profiles (tenant_id, name, half_day_allowed, created_by) values (${ctx.tenantId}::uuid, 'Default', true, ${ctx.ownerUserId}::uuid) returning id`)).rows[0] as { id: string };
  const tier = (totalDays: number, o: Record<string, unknown> = {}) => ({ tiers: [{ minYearsExperience: 0, effectiveAfterMonths: 0, creditTiming: 'start', accrual: 'monthly', totalDays, proration: 'daily', ...o }] });
  const types: { name: string; code: string; color: string; paid: boolean; lop: boolean; ent: unknown; res?: Record<string, unknown> }[] = [
    { name: 'Casual leave', code: 'CL', color: '#2B6CB0', paid: true, lop: false, ent: tier(12) },
    { name: 'Sick leave', code: 'SL', color: '#B8501F', paid: true, lop: false, ent: tier(6, { accrual: 'flat' }), res: { attachmentRequiredAfterDays: 2 } },
    { name: 'Earned leave', code: 'EL', color: '#1B7F45', paid: true, lop: false, ent: tier(15, { carryForward: { maxDays: 30 } }), res: { minNoticeDays: 3 } },
    { name: 'Loss of pay', code: 'LOP', color: '#6B7580', paid: false, lop: true, ent: tier(366, { accrual: 'flat' }), res: { exceedBalance: 'allow' } },
  ];
  for (const t of types) {
    await q.execute(sql`
      insert into leave_types (tenant_id, name, code, color, paid, lop_deduction, entitlement, restrictions, leave_profile_ids, status, created_by)
      values (${ctx.tenantId}::uuid, ${t.name}, ${t.code}, ${t.color}, ${t.paid}, ${t.lop}, ${JSON.stringify(entitlementSchema.parse(t.ent))}::jsonb,
              ${JSON.stringify(restrictionsSchema.parse(t.res ?? {}))}::jsonb, ${sql.param([profile.id])}::uuid[], 'active', ${ctx.ownerUserId}::uuid)`);
  }
  await q.execute(sql`insert into non_working_rules (tenant_id, name, weekday, weeks, leave_profile_id, created_by) values (${ctx.tenantId}::uuid, 'Sundays', '0', null, ${profile.id}::uuid, ${ctx.ownerUserId}::uuid)`);
  const year = new Date().getUTCFullYear();
  for (const h of FIXED_HOLIDAYS[ctx.country] ?? []) {
    await q.execute(sql`insert into holidays (tenant_id, name, start_date, end_date, optional, leave_profile_ids, created_by) values (${ctx.tenantId}::uuid, ${h.name}, ${`${year}-${h.md}`}::date, ${`${year}-${h.md}`}::date, false, ${sql.param([profile.id])}::uuid[], ${ctx.ownerUserId}::uuid)`);
  }
}

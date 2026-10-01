import { Injectable, Logger } from '@nestjs/common';
import { and, inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { localParts, addDays } from '@trackrex/rules';
import { tenants } from '../core/auth/platform.tables.js';
import { Db } from '../core/database/db.service.js';
import { AttendanceEngine } from '../modules/attendance/attendance-engine.service.js';
import { PunchesService } from '../modules/attendance/punches.service.js';
import { BillingService } from '../modules/billing/billing.service.js';
import { TrackingService } from '../modules/field/tracking.service.js';
import { notificationProjection } from '../modules/notifications/notifications.module.js';
import { feedProjection, relayTenantOutbox, type OutboxHandler } from './outbox-relay.js';

export const JOB_NAMES = ['outbox-relay', 'auto-punch-out', 'finalize-days', 'maintain-partitions', 'purge-recycle-bins', 'expire-trials', 'purge-location-history', 'generate-invoices', 'run-dunning'] as const;
export type JobName = (typeof JOB_NAMES)[number];

/** Recycle bins are purged this many days after deletion. */
export const PURGE_DAYS = 30;
const PURGE_TABLES = ['employees', 'departments', 'designations', 'teams', 'work_locations', 'business_units', 'cost_centers', 'employee_types', 'employment_types', 'shifts', 'break_types', 'holidays', 'non_working_rules', 'leave_profiles', 'leave_types', 'leave_requests', 'regularizations', 'geo_fences', 'customers', 'contacts', 'tasks', 'expense_categories', 'expenses'];

/** Each job visits every live company inside its own tenant transaction, so RLS applies to jobs too. */
@Injectable()
export class JobsService {
  private readonly log = new Logger('Jobs');
  private readonly handlers: OutboxHandler[];

  constructor(private readonly db: Db, private readonly engine: AttendanceEngine, private readonly punches: PunchesService, private readonly tracking: TrackingService, private readonly billing: BillingService) {
    this.handlers = [feedProjection(db), notificationProjection(db)];
  }

  registerHandler(h: OutboxHandler): void {
    this.handlers.push(h);
  }

  async liveTenants(): Promise<{ id: string; timezone: string }[]> {
    return this.db.app.select({ id: tenants.id, timezone: tenants.timezone }).from(tenants).where(and(inArray(tenants.status, ['trial', 'active', 'past_due'])));
  }

  async run(name: JobName, now = Date.now()): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    if (name === 'maintain-partitions') return this.maintainPartitions();
    if (name === 'expire-trials') return this.expireTrials(now);
    if (name === 'generate-invoices') return this.billing.runInvoicing(now);
    if (name === 'run-dunning') return this.billing.runDunning(now);
    for (const t of await this.liveTenants()) {
      try {
        out[t.id] = await this.runForTenant(name, t, now);
      } catch (e) {
        this.log.error(`${name} failed for ${t.id}: ${(e as Error).message}`);
        out[t.id] = -1;
      }
    }
    return out;
  }

  private async runForTenant(name: JobName, t: { id: string; timezone: string }, now: number): Promise<number> {
    switch (name) {
      case 'outbox-relay':
        return relayTenantOutbox(this.db, t.id, this.handlers);
      case 'auto-punch-out':
        return this.db.runAsTenant(t.id, {}, () => this.punches.autoPunchOut(now));
      case 'finalize-days':
        return this.finalizeDays(t, now);
      case 'purge-recycle-bins':
        return this.purge(t.id);
      case 'purge-location-history':
        return this.db.runAsTenant(t.id, {}, () => this.tracking.purgeOld());
      default:
        return 0;
    }
  }

  /** Recompute yesterday and today for every active employee, so each day is final shortly after local midnight. */
  async finalizeDays(t: { id: string; timezone: string }, now: number): Promise<number> {
    const today = localParts(now, t.timezone).date;
    const dates = [addDays(today, -1), today];
    return this.db.runAsTenant(t.id, {}, async () => {
      const emps = await this.db.q.execute(sql`select id from employees where deleted_at is null and status in ('active','invited') and date_of_joining <= ${today}::date`);
      let n = 0;
      for (const e of emps.rows as { id: string }[]) for (const d of dates) if (await this.engine.recomputeDay(e.id, d, now)) n++;
      return n;
    });
  }

  async purge(tenantId: string, days = PURGE_DAYS): Promise<number> {
    return this.db.runAsTenant(tenantId, {}, async () => {
      let n = 0;
      for (const table of PURGE_TABLES) {
        const res = await this.db.q.execute(sql`delete from ${sql.identifier(table)} where deleted_at < now() - make_interval(days => ${days})`).catch(() => null);
        n += res?.rowCount ?? 0;
      }
      return n;
    });
  }

  /** Keep monthly partitions ready three months ahead (a SECURITY DEFINER function does the DDL). */
  async maintainPartitions(): Promise<Record<string, number>> {
    await this.db.app.execute(sql`select maintain_partitions(3)`);
    return { ok: 1 };
  }

  /** Trials past their end date become past due, then the dunning flow takes over. */
  async expireTrials(now: number): Promise<Record<string, number>> {
    const res = await this.db.app.execute(sql`update platform.tenants set status = 'past_due', past_due_since = now(), updated_at = now() where status = 'trial' and trial_ends_at < ${new Date(now).toISOString()}::timestamptz and not is_demo returning id`);
    return { expired: res.rowCount ?? 0 };
  }
}

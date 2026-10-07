import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, inArray } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { localParts, addDays } from '@trackrex/rules';
import { tenants } from '../core/auth/platform.tables.js';
import { CONFIG, type Config } from '../core/config.js';
import { Db } from '../core/database/db.service.js';
import { EnvelopeService } from '../core/crypto/envelope.service.js';
import { writeHome } from '../core/crypto/home-location.js';
import { MESSAGING, type MessagingProvider } from '../shared/providers/messaging/messaging.provider.js';
import { AttendanceEngine } from '../modules/attendance/attendance-engine.service.js';
import { PunchesService } from '../modules/attendance/punches.service.js';
import { BillingService } from '../modules/billing/billing.service.js';
import { TrackingService } from '../modules/field/tracking.service.js';
import { notificationProjection } from '../modules/notifications/notifications.module.js';
import { feedProjection, relayTenantOutbox, type OutboxHandler } from './outbox-relay.js';

export const JOB_NAMES = ['outbox-relay', 'auto-punch-out', 'finalize-days', 'maintain-partitions', 'purge-recycle-bins', 'expire-trials', 'purge-location-history', 'generate-invoices', 'run-dunning', 'seal-legacy-locations', 'rewrap-keys'] as const;
export type JobName = (typeof JOB_NAMES)[number];

/** Recycle bins are purged this many days after deletion. */
export const PURGE_DAYS = 30;
const PURGE_TABLES = ['employees', 'departments', 'designations', 'teams', 'work_locations', 'business_units', 'cost_centers', 'employee_types', 'employment_types', 'shifts', 'break_types', 'holidays', 'non_working_rules', 'leave_profiles', 'leave_types', 'leave_requests', 'regularizations', 'geo_fences', 'customers', 'contacts', 'tasks', 'expense_categories', 'expenses', 'leads', 'call_logs'];

/** Each job visits every live company inside its own tenant transaction, so RLS applies to jobs too. */
@Injectable()
export class JobsService {
  private readonly log = new Logger('Jobs');
  private readonly handlers: OutboxHandler[];

  constructor(private readonly db: Db, private readonly engine: AttendanceEngine, private readonly punches: PunchesService, private readonly tracking: TrackingService, private readonly billing: BillingService, @Inject(MESSAGING) messaging: MessagingProvider, @Inject(CONFIG) cfg: Config, private readonly envelope: EnvelopeService) {
    this.handlers = [feedProjection(db), notificationProjection(db, { messaging, origin: cfg.WEB_ORIGIN })];
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
      case 'seal-legacy-locations':
        return this.db.runAsTenant(t.id, {}, () => this.sealLegacy());
      case 'rewrap-keys':
        return this.envelope.rewrapAll(t.id);
      case 'purge-location-history':
        return this.db.runAsTenant(t.id, {}, () => this.tracking.purgeOld());
      default:
        return 0;
    }
  }

  /** Moves plaintext location data written before sealing was on into sealed form. Does nothing when sealing is off. */
  private async sealLegacy(): Promise<number> {
    if (!this.envelope.enabled) return 0;
    const emps = (await this.db.q.execute(sql`select id, home_latitude, home_longitude from employees where home_latitude is not null and home_longitude is not null`)).rows as { id: string; home_latitude: number; home_longitude: number }[];
    for (const e of emps) await writeHome(this.db, this.envelope, e.id, { lat: e.home_latitude, lng: e.home_longitude });
    return emps.length + (await this.tracking.sealLegacy());
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
      // Sent-message records keep personal contact details; they are kept for 90 days.
      n += (await this.db.q.execute(sql`delete from message_log where created_at < now() - interval '90 days'`)).rowCount ?? 0;
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

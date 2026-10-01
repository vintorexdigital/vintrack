import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import {
  addDays, addMonths, carryForward, computeAccruals, diffDays, leaveBalance, selectTier, parseDate, fmtDate,
  type LedgerEntry,
} from '@trackrex/rules';
import { entitlementSchema, type Entitlement } from '@trackrex/schemas';
import { Db } from '../../core/database/db.service.js';
import { SettingsService } from '../../core/settings.service.js';

export interface LeaveSession {
  start: string;
  end: string;
}

export interface TypeBalance {
  leaveTypeId: string;
  code: string;
  name: string;
  color: string;
  paid: boolean;
  session: LeaveSession;
  accrued: number;
  taken: number;
  expired: number;
  balance: number;
  pending: number;
  available: number;
  yearAccrual: number;
}

interface TypeRow { id: string; code: string; name: string; color: string | null; paid: boolean; entitlement: unknown; leave_profile_ids: string[] | null }

/** Leave sessions, accruals and balances. Accruals are computed from rules; only real events are stored. */
@Injectable()
export class LeaveEngine {
  constructor(private readonly db: Db, private readonly settings: SettingsService) {}

  async sessionFor(date: string): Promise<LeaveSession> {
    const mmdd = await this.settings.get<string>('leave.session_start', '01-01');
    const { y } = parseDate(date);
    const [mm, dd] = mmdd.split('-').map(Number);
    let start = fmtDate(y, mm!, dd!);
    if (date < start) start = fmtDate(y - 1, mm!, dd!);
    return { start, end: addDays(addMonths(start, 12), -1) };
  }

  async typesFor(profileId: string | null): Promise<TypeRow[]> {
    const res = await this.db.q.execute(sql`
      select id, code, name, color, paid, entitlement, leave_profile_ids from leave_types
      where deleted_at is null and status = 'active' and (leave_profile_ids is null or leave_profile_ids = '{}' or ${profileId}::uuid = any(leave_profile_ids))
      order by name`);
    return res.rows as unknown as TypeRow[];
  }

  private async typeBalance(emp: { id: string; joinDate: string }, t: TypeRow, session: LeaveSession, asOf: string, depth: number): Promise<TypeBalance> {
    const ent: Entitlement = entitlementSchema.parse(t.entitlement);
    const years = Math.max(0, diffDays(session.start, emp.joinDate)) / 365.25;
    const tier = selectTier(ent.tiers, years) ?? ent.tiers[0]!;
    const entries: LedgerEntry[] = computeAccruals({ sessionStart: session.start, sessionEnd: session.end, joinDate: emp.joinDate, tier });

    const stored = await this.db.q.execute(sql`
      select date, days, kind, expires_on from leave_ledger where employee_id = ${emp.id}::uuid and leave_type_id = ${t.id}::uuid and session_start = ${session.start}::date`);
    const rows = stored.rows as { date: string; days: string; kind: LedgerEntry['kind']; expires_on: string | null }[];
    // Approved leave reserves balance as soon as it is approved, even when its dates are still ahead.
    for (const r of rows) entries.push({ date: r.kind === 'taken' && r.date > asOf ? asOf : r.date, days: Number(r.days), kind: r.kind, ...(r.expires_on ? { expiresOn: r.expires_on } : {}) });

    if (depth > 0 && emp.joinDate < session.start && !rows.some((r) => r.kind === 'carry_forward') && tier.carryForward) {
      const prevEnd = addDays(session.start, -1);
      const prevStart = addDays(addMonths(session.start, -12), 0);
      const prev = await this.typeBalance(emp, t, { start: prevStart, end: prevEnd }, prevEnd, depth - 1);
      const { carried } = carryForward(prev.balance, tier);
      if (carried > 0) entries.push({ date: session.start, days: carried, kind: 'carry_forward', ...(tier.carryForward.expiryDays ? { expiresOn: addDays(session.start, tier.carryForward.expiryDays) } : {}) });
    }
    const b = leaveBalance(entries, asOf);
    const pend = await this.db.q.execute(sql`
      select coalesce(sum(days), 0)::float as n from leave_requests
      where employee_id = ${emp.id}::uuid and leave_type_id = ${t.id}::uuid and status = 'pending' and deleted_at is null and from_date >= ${session.start}::date and from_date <= ${session.end}::date`);
    const pending = (pend.rows[0] as { n: number }).n;
    return {
      leaveTypeId: t.id, code: t.code, name: t.name, color: t.color ?? '#0F5E73', paid: t.paid, session, accrued: b.credited, taken: b.taken, expired: b.expired,
      balance: b.balance, pending, available: Math.round((b.balance - pending) * 100) / 100, yearAccrual: tier.totalDays,
    };
  }

  async balances(employeeId: string, asOf: string): Promise<TypeBalance[]> {
    const empRes = await this.db.q.execute(sql`select id, date_of_joining, leave_profile_id from employees where id = ${employeeId}::uuid and deleted_at is null`);
    const e = empRes.rows[0] as { id: string; date_of_joining: string; leave_profile_id: string | null } | undefined;
    if (!e) return [];
    const session = await this.sessionFor(asOf);
    const types = await this.typesFor(e.leave_profile_id);
    const out: TypeBalance[] = [];
    for (const t of types) out.push(await this.typeBalance({ id: e.id, joinDate: e.date_of_joining }, t, session, asOf, 2));
    return out;
  }

  async balanceFor(employeeId: string, leaveTypeId: string, asOf: string): Promise<TypeBalance | null> {
    return (await this.balances(employeeId, asOf)).find((b) => b.leaveTypeId === leaveTypeId) ?? null;
  }
}

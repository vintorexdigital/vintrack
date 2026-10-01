import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import {
  attendanceCycle, attendanceDateFor, shiftWindow, computeDayFacts, enumerateDates, evaluatePolicy, resolveBaseStatus,
  type DayContext, type NonWorkingRule, type PolicyRule,
} from '@trackrex/rules';
import { Db } from '../../core/database/db.service.js';
import { SettingsService } from '../../core/settings.service.js';
import { ShiftResolver } from '../time/shift-resolver.service.js';
import { POLICIES_SERVICE, PoliciesService } from '../time/policies.service.js';

export interface AttendanceDay {
  employeeId: string;
  date: string;
  shiftId: string | null;
  firstIn: string | null;
  lastOut: string | null;
  workedMinutes: number;
  breakMinutes: number;
  lateMinutes: number;
  earlyOutMinutes: number;
  overtimeMinutes: number;
  statusCode: string;
  secondaryCode: string | null;
  presentUnits: number;
  absentUnits: number;
  leaveUnits: number;
  deductionUnits: number;
  lateMark: boolean;
  earlyMark: boolean;
  flags: string[];
  explanation: string[];
  paidLeave: boolean;
  overrideCode: string | null;
  locked: boolean;
  policyId: string | null;
  /** The day is not over and nothing has happened yet, so no absence is recorded. */
  inProgress?: boolean;
}

interface EmpRow { id: string; date_of_joining: string; date_of_exit: string | null; leave_profile_id: string | null; status: string }

/**
 * The attendance engine: gathers punches, breaks, leave, holidays, overrides and the effective policy
 * for one employee-day, runs the pure rules from packages/rules, and stores the explained outcome.
 */
@Injectable()
export class AttendanceEngine {
  constructor(
    private readonly db: Db,
    private readonly shifts: ShiftResolver,
    private readonly settings: SettingsService,
    @Inject(POLICIES_SERVICE) private readonly policies: PoliciesService,
  ) {}

  async monthStartDay(): Promise<number> {
    return this.settings.get<number>('attendance.month_start_day', 1);
  }

  /** Non-working rules and holidays that apply to a leave profile. */
  async calendarFor(profileId: string | null, from: string, to: string): Promise<{ holidays: Set<string>; nonWorking: NonWorkingRule[] }> {
    const hol = await this.db.q.execute(sql`
      select start_date, end_date from holidays
      where deleted_at is null and optional = false and end_date >= ${from}::date and start_date <= ${to}::date
        and (leave_profile_ids is null or leave_profile_ids = '{}' or ${profileId}::uuid = any(leave_profile_ids))`);
    const holidays = new Set<string>();
    for (const h of hol.rows as { start_date: string; end_date: string }[]) for (const d of enumerateDates(h.start_date, h.end_date)) holidays.add(d);
    const nw = await this.db.q.execute(sql`
      select weekday, weeks from non_working_rules where deleted_at is null and (leave_profile_id is null or leave_profile_id = ${profileId}::uuid)`);
    const nonWorking = (nw.rows as { weekday: string; weeks: string[] | null }[]).map((r) => ({ weekday: Number(r.weekday), ...(r.weeks?.length ? { weeks: r.weeks.map(Number) } : {}) }));
    return { holidays, nonWorking };
  }

  /** Recompute and store one day. Locked days (payroll closed) are returned unchanged. */
  async recomputeDay(employeeId: string, date: string, now = Date.now()): Promise<AttendanceDay | null> {
    const empRes = await this.db.q.execute(sql`select id, date_of_joining, date_of_exit, leave_profile_id, status from employees where id = ${employeeId}::uuid`);
    const emp = empRes.rows[0] as unknown as EmpRow | undefined;
    if (!emp) return null;

    const existingRes = await this.db.q.execute(sql`select * from attendance_days where employee_id = ${employeeId}::uuid and date = ${date}::date`);
    const existing = existingRes.rows[0] as { locked: boolean; override_code: string | null; override_by: string | null; override_reason: string | null; override_at: string | null } | undefined;
    if (existing?.locked) return this.mapRow(existingRes.rows[0]!);

    const shift = await this.shifts.forDate(employeeId, date);
    const punchRes = await this.db.q.execute(sql`select type, at from punches where employee_id = ${employeeId}::uuid and attendance_date = ${date}::date order by at`);
    const punches = (punchRes.rows as { type: 'in' | 'out'; at: string }[]).map((p) => ({ type: p.type, at: new Date(p.at).getTime() }));
    const breakRes = await this.db.q.execute(sql`select started_at, ended_at from breaks where employee_id = ${employeeId}::uuid and attendance_date = ${date}::date and ended_at is not null`);
    const breaks = (breakRes.rows as { started_at: string; ended_at: string }[]).map((b) => ({ start: new Date(b.started_at).getTime(), end: new Date(b.ended_at).getTime() }));

    const cal = await this.calendarFor(emp.leave_profile_id, date, date);
    const leaveRes = await this.db.q.execute(sql`
      select r.status, r.duration, t.paid from leave_requests r join leave_types t on t.id = r.leave_type_id and t.tenant_id = r.tenant_id
      where r.employee_id = ${employeeId}::uuid and r.deleted_at is null and r.status in ('approved','pending') and r.from_date <= ${date}::date and r.to_date >= ${date}::date
      order by (r.status = 'approved') desc limit 1`);
    const lv = leaveRes.rows[0] as { status: 'approved' | 'pending'; duration: string; paid: boolean } | undefined;
    const regRes = await this.db.q.execute(sql`select 1 from regularizations where employee_id = ${employeeId}::uuid and date = ${date}::date and status = 'pending' and deleted_at is null limit 1`);

    const ctx: DayContext = {
      date, joinDate: emp.date_of_joining, exitDate: emp.date_of_exit, holiday: cal.holidays.has(date), nonWorkingRules: cal.nonWorking,
      hasPunches: punches.length > 0, pendingRegularization: regRes.rows.length > 0,
      ...(lv ? { leave: { status: lv.status, paid: lv.paid, ...(lv.duration !== 'full' ? { half: lv.duration === 'first_half' ? ('first' as const) : ('second' as const) } : {}) } } : {}),
      ...(existing?.override_code ? { override: { code: existing.override_code as 'OA' | 'ONW' | 'OH' | 'P' | 'AB' | 'HP' } } : {}),
    };
    const base = resolveBaseStatus(ctx);

    // A day that has not finished and has no activity is not an absence yet: nothing is stored until it is over.
    if (shift && base.code === 'AB' && !punches.length) {
      const current = attendanceDateFor(now, shift.timing);
      if (date > current || (date === current && now < shiftWindow(date, shift.timing).end)) {
        await this.db.q.execute(sql`delete from attendance_days where employee_id = ${employeeId}::uuid and date = ${date}::date and not locked and override_code is null`);
        return {
          employeeId, date, shiftId: shift.id, firstIn: null, lastOut: null, workedMinutes: 0, breakMinutes: 0, lateMinutes: 0, earlyOutMinutes: 0, overtimeMinutes: 0,
          statusCode: 'AB', secondaryCode: null, presentUnits: 0, absentUnits: 0, leaveUnits: 0, deductionUnits: 0, lateMark: false, earlyMark: false, flags: ['in_progress'],
          explanation: ['The day is not over yet, so no absence is recorded.'], paidLeave: false, overrideCode: null, locked: false, policyId: null, inProgress: true,
        };
      }
    }

    const facts = shift
      ? computeDayFacts(date, punches, shift.timing, breaks, now)
      : { date, firstIn: punches[0]?.at ?? null, lastOut: null, workedMinutes: 0, breakMinutes: 0, lateMinutes: 0, earlyOutMinutes: 0, missingPunchOut: false, overtimeMinutes: 0, sessions: [] };

    let policyId: string | null = null;
    let rules: PolicyRule[] = [];
    if (shift) {
      const eff = await this.policies.effectiveFor(shift.id, date);
      if (eff) {
        policyId = eff.id;
        rules = eff.rules;
      }
    }
    const cycle = attendanceCycle(date, await this.monthStartDay());
    const marks = await this.db.q.execute(sql`
      select count(*) filter (where late_mark)::int as late, count(*) filter (where early_mark)::int as early
      from attendance_days where employee_id = ${employeeId}::uuid and date >= ${cycle.start}::date and date < ${date}::date`);
    const m = marks.rows[0] as { late: number; early: number };
    const out = evaluatePolicy(base, facts, rules, { lateMarksBefore: m.late, earlyMarksBefore: m.early });

    const row = {
      shiftId: shift?.id ?? null,
      firstIn: facts.firstIn ? new Date(facts.firstIn).toISOString() : null,
      lastOut: facts.lastOut ? new Date(facts.lastOut).toISOString() : null,
      worked: facts.workedMinutes, brk: facts.breakMinutes, late: facts.lateMinutes, early: facts.earlyOutMinutes,
      ot: out.overtimeMinutes || 0,
    };
    const paidLeave = lv?.paid ?? false;
    const res = await this.db.q.execute(sql`
      insert into attendance_days (tenant_id, employee_id, date, shift_id, first_in, last_out, worked_minutes, break_minutes, late_minutes, early_out_minutes, overtime_minutes,
        status_code, secondary_code, present_units, absent_units, leave_units, deduction_units, late_mark, early_mark, flags, explanation, paid_leave, policy_id, computed_at)
      values (app_tenant_id(), ${employeeId}::uuid, ${date}::date, ${row.shiftId}::uuid, ${row.firstIn}::timestamptz, ${row.lastOut}::timestamptz, ${row.worked}, ${row.brk}, ${row.late}, ${row.early}, ${row.ot},
        ${out.code}, ${out.secondary ?? null}, ${out.presentUnits}, ${out.absentUnits}, ${out.leaveUnits}, ${out.deductionUnits}, ${out.lateMark}, ${out.earlyMark},
        ${sql.param(out.flags)}::text[], ${sql.param(out.explanation)}::text[], ${paidLeave}, ${policyId}::uuid, now())
      on conflict (tenant_id, employee_id, date) do update set
        shift_id = excluded.shift_id, first_in = excluded.first_in, last_out = excluded.last_out, worked_minutes = excluded.worked_minutes,
        break_minutes = excluded.break_minutes, late_minutes = excluded.late_minutes, early_out_minutes = excluded.early_out_minutes,
        overtime_minutes = excluded.overtime_minutes, status_code = excluded.status_code, secondary_code = excluded.secondary_code,
        present_units = excluded.present_units, absent_units = excluded.absent_units, leave_units = excluded.leave_units,
        deduction_units = excluded.deduction_units, late_mark = excluded.late_mark, early_mark = excluded.early_mark, flags = excluded.flags,
        explanation = excluded.explanation, paid_leave = excluded.paid_leave, policy_id = excluded.policy_id, computed_at = now(), version = attendance_days.version + 1
      returning *`);
    return this.mapRow(res.rows[0]!);
  }

  /** Fill in and recompute every day in a range for an employee, from their joining date to today at most. */
  async recomputeRange(employeeId: string, from: string, to: string, now = Date.now()): Promise<number> {
    const today = new Date(now).toISOString().slice(0, 10);
    let n = 0;
    for (const d of enumerateDates(from, to > today ? today : to)) {
      if (await this.recomputeDay(employeeId, d, now)) n++;
    }
    return n;
  }

  mapRow(r: Record<string, unknown>): AttendanceDay {
    const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
    return {
      employeeId: r.employee_id as string, date: r.date as string, shiftId: (r.shift_id as string) ?? null,
      firstIn: iso(r.first_in), lastOut: iso(r.last_out), workedMinutes: r.worked_minutes as number, breakMinutes: r.break_minutes as number,
      lateMinutes: r.late_minutes as number, earlyOutMinutes: r.early_out_minutes as number, overtimeMinutes: r.overtime_minutes as number,
      statusCode: r.status_code as string, secondaryCode: (r.secondary_code as string) ?? null,
      presentUnits: Number(r.present_units), absentUnits: Number(r.absent_units), leaveUnits: Number(r.leave_units), deductionUnits: Number(r.deduction_units),
      lateMark: r.late_mark as boolean, earlyMark: r.early_mark as boolean, flags: (r.flags as string[]) ?? [], explanation: (r.explanation as string[]) ?? [],
      paidLeave: !!r.paid_leave, overrideCode: (r.override_code as string) ?? null, locked: !!r.locked, policyId: (r.policy_id as string) ?? null,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { ATTENDANCE_CODES, addDays, attendanceCycle, enumerateDates, summarizeRegister, weekday, type RegisterCell } from '@trackrex/rules';
import { dayOverrideBody, registerQuery, rerunBody } from '@trackrex/schemas';
import { currentAuth } from '../../core/context.js';
import { conflict, forbidden, notFound, unprocessable } from '../../core/errors.js';
import { Db } from '../../core/database/db.service.js';
import { AuditService } from '../../core/audit.service.js';
import { Authz, ScopeResolver } from '../../core/rbac.service.js';
import { AttendanceEngine, type AttendanceDay } from './attendance-engine.service.js';

const OVERRIDE_MAP: Record<string, string> = { P: 'P', HP: 'HP', AB: 'AB', ONW: 'ONW', OH: 'OH' };

@Injectable()
export class AttendanceService {
  constructor(private readonly db: Db, private readonly authz: Authz, private readonly scope: ScopeResolver, private readonly audit: AuditService, private readonly engine: AttendanceEngine) {}

  private async assertInScope(permission: string, employeeId: string): Promise<void> {
    const pred = this.scope.predicate(this.authz.require(permission), sql`e.id`);
    const res = await this.db.q.execute(sql`select 1 from employees e where e.id = ${employeeId}::uuid and e.deleted_at is null ${pred ? sql`and ${pred}` : sql``}`);
    if (!res.rows.length) throw notFound('Employee');
  }

  async day(employeeId: string, date: string) {
    await this.assertInScope('attendance.day.read', employeeId);
    const day = (await this.engine.recomputeDay(employeeId, date)) as AttendanceDay | null;
    if (!day) throw notFound('Employee');
    const punches = await this.db.q.execute(sql`select id, type, at, source, latitude, longitude, accuracy, address, selfie_key as "selfieKey", comment, mock_location as "mockLocation", offline from punches where employee_id = ${employeeId}::uuid and attendance_date = ${date}::date order by at`);
    const breaks = await this.db.q.execute(sql`select b.id, b.started_at as "startedAt", b.ended_at as "endedAt", t.name from breaks b left join break_types t on t.id = b.break_type_id where b.employee_id = ${employeeId}::uuid and b.attendance_date = ${date}::date order by b.started_at`);
    const ov = await this.db.q.execute(sql`select override_reason as "reason", override_at as "at", override_by as "by" from attendance_days where employee_id = ${employeeId}::uuid and date = ${date}::date`);
    return { day, punches: punches.rows, breaks: breaks.rows, override: day.overrideCode ? ov.rows[0] : null };
  }

  async list(q: { from: string; to: string; employeeId?: string }) {
    const pred = this.scope.predicate(this.authz.require('attendance.day.read'), sql`d.employee_id`);
    const res = await this.db.q.execute(sql`
      select d.* from attendance_days d where d.date >= ${q.from}::date and d.date <= ${q.to}::date
        ${q.employeeId ? sql`and d.employee_id = ${q.employeeId}::uuid` : sql``} ${pred ? sql`and ${pred}` : sql``}
      order by d.date, d.employee_id limit 2000`);
    return res.rows.map((r) => this.engine.mapRow(r));
  }

  async setOverride(employeeId: string, date: string, body: unknown) {
    const b = dayOverrideBody.parse(body);
    await this.assertInScope('attendance.day.override', employeeId);
    await this.engine.recomputeDay(employeeId, date); // make sure a row exists
    const locked = await this.db.q.execute(sql`select locked from attendance_days where employee_id = ${employeeId}::uuid and date = ${date}::date`);
    if ((locked.rows[0] as { locked: boolean }).locked) throw conflict('day_locked', 'Payroll for this cycle is closed, so this day cannot be changed.');
    const before = await this.db.q.execute(sql`select status_code from attendance_days where employee_id = ${employeeId}::uuid and date = ${date}::date`);
    await this.db.q.execute(sql`update attendance_days set override_code = ${OVERRIDE_MAP[b.code]}, override_by = app_user_id(), override_reason = ${b.reason}, override_at = now() where employee_id = ${employeeId}::uuid and date = ${date}::date`);
    const day = await this.engine.recomputeDay(employeeId, date);
    await this.audit.record({ entity: 'attendance-days', entityId: `${employeeId}:${date}`, action: 'overridden', changes: { statusCode: { old: (before.rows[0] as { status_code: string }).status_code, new: day!.statusCode }, reason: { new: b.reason } } });
    return day;
  }

  async clearOverride(employeeId: string, date: string) {
    await this.assertInScope('attendance.day.override', employeeId);
    const res = await this.db.q.execute(sql`update attendance_days set override_code = null, override_by = null, override_reason = null, override_at = null where employee_id = ${employeeId}::uuid and date = ${date}::date and not locked and override_code is not null returning 1`);
    if (!res.rows.length) throw notFound('Override');
    const day = await this.engine.recomputeDay(employeeId, date);
    await this.audit.record({ entity: 'attendance-days', entityId: `${employeeId}:${date}`, action: 'override_removed' });
    return day;
  }

  /**
   * Re-run attendance policies for a date range. A dry run executes inside a savepoint and rolls back,
   * so the preview shows exactly which days would change without touching anything.
   */
  async rerun(body: unknown) {
    this.authz.require('attendance.policy.rerun');
    const b = rerunBody.parse(body);
    if (b.to < b.from) throw unprocessable('The end date is before the start date.');
    if (enumerateDates(b.from, b.to).length > 62) throw unprocessable('Re-run at most 62 days at a time.');
    const emps = await this.db.q.execute(sql`select id from employees where deleted_at is null ${b.employeeIds?.length ? sql`and id = any(${sql.param(b.employeeIds)}::uuid[])` : sql``} order by id limit 2000`);
    const ids = (emps.rows as { id: string }[]).map((r) => r.id);
    const snapshot = async () => {
      const res = await this.db.q.execute(sql`select employee_id, date, status_code, deduction_units, late_mark from attendance_days where employee_id = any(${sql.param(ids)}::uuid[]) and date >= ${b.from}::date and date <= ${b.to}::date`);
      return new Map((res.rows as { employee_id: string; date: string; status_code: string; deduction_units: string; late_mark: boolean }[]).map((r) => [`${r.employee_id}:${r.date}`, { code: r.status_code, deduction: Number(r.deduction_units), lateMark: r.late_mark }]));
    };
    const before = await snapshot();
    if (b.dryRun) await this.db.q.execute(sql`savepoint rerun_preview`);
    for (const id of ids) await this.engine.recomputeRange(id, b.from, b.to);
    const after = await snapshot();
    if (b.dryRun) await this.db.q.execute(sql`rollback to savepoint rerun_preview`);
    const changes: { employeeId: string; date: string; before: unknown; after: unknown }[] = [];
    for (const [k, a] of after) {
      const o = before.get(k);
      if (!o || o.code !== a.code || o.deduction !== a.deduction || o.lateMark !== a.lateMark) {
        const [employeeId, date] = k.split(':') as [string, string];
        changes.push({ employeeId, date, before: o ?? null, after: a });
      }
    }
    if (!b.dryRun) await this.audit.record({ entity: 'attendance-days', action: 'policy_rerun', changes: { range: { new: `${b.from}..${b.to}` }, changedDays: { new: changes.length } } });
    return { dryRun: b.dryRun, employees: ids.length, changed: changes.length, changes: changes.slice(0, 500) };
  }

  /* ---------- monthly register ---------- */

  async register(raw: Record<string, unknown>) {
    const q = registerQuery.parse(raw);
    const scope = this.authz.require('attendance.register.read');
    const today = new Date().toISOString().slice(0, 10);
    const cycle = attendanceCycle(q.date ?? today, await this.engine.monthStartDay());
    const pred = this.scope.predicate(scope, sql`e.id`, { directOnly: !!q.directOnly });
    const cur = q.cursor ? (JSON.parse(Buffer.from(q.cursor, 'base64url').toString()) as { n: string; id: string }) : null;
    const search = q.q ? `%${q.q.toLowerCase().replace(/[%_\\]/g, '\\$&')}%` : null;
    const emps = await this.db.q.execute(sql`
      select e.id, e.code, e.display_name as name, e.date_of_joining as "joiningDate", e.department_id as "departmentId"
      from employees e
      where e.deleted_at is null and e.date_of_joining <= ${cycle.end}::date and (e.date_of_exit is null or e.date_of_exit >= ${cycle.start}::date)
        ${q.departmentId ? sql`and e.department_id = ${q.departmentId}::uuid` : sql``}
        ${q.workLocationId ? sql`and e.work_location_id = ${q.workLocationId}::uuid` : sql``}
        ${q.teamId ? sql`and e.id in (select employee_id from team_members where team_id = ${q.teamId}::uuid)` : sql``}
        ${search ? sql`and (lower(e.display_name) like ${search} or lower(e.code) like ${search})` : sql``}
        ${pred ? sql`and ${pred}` : sql``}
        ${cur ? sql`and (e.display_name, e.id) > (${cur.n}, ${cur.id}::uuid)` : sql``}
      order by e.display_name, e.id limit ${q.limit + 1}`);
    const all = emps.rows as { id: string; code: string; name: string; joiningDate: string }[];
    const page = all.slice(0, q.limit);
    const ids = page.map((e) => e.id);
    const upTo = cycle.end > today ? today : cycle.end;

    // Past days with no stored result yet are computed now and cached; the nightly job normally does this.
    if (ids.length && upTo >= cycle.start) {
      const have = await this.db.q.execute(sql`select employee_id, count(*)::int as n from attendance_days where employee_id = any(${sql.param(ids)}::uuid[]) and date >= ${cycle.start}::date and date <= ${upTo}::date group by employee_id`);
      const counts = new Map((have.rows as { employee_id: string; n: number }[]).map((r) => [r.employee_id, r.n]));
      for (const e of page) {
        const first = e.joiningDate > cycle.start ? e.joiningDate : cycle.start;
        const expected = first > upTo ? 0 : enumerateDates(first, upTo).length;
        if ((counts.get(e.id) ?? 0) < expected) await this.engine.recomputeRange(e.id, first, upTo);
      }
    }
    const days = ids.length ? await this.db.q.execute(sql`select * from attendance_days where employee_id = any(${sql.param(ids)}::uuid[]) and date >= ${cycle.start}::date and date <= ${cycle.end}::date`) : { rows: [] };
    const byEmp = new Map<string, Map<string, AttendanceDay>>();
    for (const r of days.rows) {
      const d = this.engine.mapRow(r);
      if (!byEmp.has(d.employeeId)) byEmp.set(d.employeeId, new Map());
      byEmp.get(d.employeeId)!.set(d.date, d);
    }
    const dates = enumerateDates(cycle.start, cycle.end);
    const rows = page.map((e) => {
      const m = byEmp.get(e.id) ?? new Map<string, AttendanceDay>();
      const cells: Record<string, { code: string; secondary?: string; late?: boolean; deduction?: boolean; overridden?: boolean; locked?: boolean }> = {};
      const summaryCells: RegisterCell[] = [];
      for (const d of dates) {
        const x = m.get(d);
        if (!x) continue;
        cells[d] = { code: x.statusCode, ...(x.secondaryCode ? { secondary: x.secondaryCode } : {}), ...(x.lateMark ? { late: true } : {}), ...(x.deductionUnits > 0 ? { deduction: true } : {}), ...(x.overrideCode ? { overridden: true } : {}), ...(x.locked ? { locked: true } : {}) };
        summaryCells.push({ code: x.statusCode as RegisterCell['code'], ...(x.secondaryCode ? { secondary: x.secondaryCode as RegisterCell['code'] } : {}), deduction: x.deductionUnits > 0 });
      }
      return { employee: { id: e.id, code: e.code, name: e.name }, cells, summary: summarizeRegister(summaryCells) };
    });
    const last = page[page.length - 1];
    return {
      cycle,
      days: dates.map((d) => ({ date: d, weekday: weekday(d) })),
      rows,
      legend: Object.entries(ATTENDANCE_CODES).map(([code, v]) => ({ code, title: v.title, token: v.token })),
      nextCursor: all.length > q.limit && last ? Buffer.from(JSON.stringify({ n: last.name, id: last.id })).toString('base64url') : null,
    };
  }

  /** Payroll export: one row per employee with day codes, summary columns and payable days. */
  async registerExport(raw: Record<string, unknown>) {
    this.authz.require('attendance.register.export');
    const all: Awaited<ReturnType<AttendanceService['register']>>['rows'] = [];
    let cursor: string | undefined;
    let cycleInfo: Awaited<ReturnType<AttendanceService['register']>>['cycle'] | undefined;
    let dayList: Awaited<ReturnType<AttendanceService['register']>>['days'] = [];
    do {
      const page = await this.register({ ...raw, limit: 200, ...(cursor ? { cursor } : {}) });
      all.push(...page.rows);
      cycleInfo = page.cycle;
      dayList = page.days;
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    const payableRes = await this.db.q.execute(sql`
      select employee_id, sum(present_units + case when paid_leave then leave_units else 0 end + case when status_code in ('H','NW','ONW','OH') then 1 else 0 end - deduction_units)::float as payable,
             sum(overtime_minutes)::int as ot
      from attendance_days where date >= ${cycleInfo!.start}::date and date <= ${cycleInfo!.end}::date group by employee_id`);
    const pay = new Map((payableRes.rows as { employee_id: string; payable: number; ot: number }[]).map((r) => [r.employee_id, r]));
    return { cycle: cycleInfo!, days: dayList, rows: all.map((r) => ({ ...r, payableDays: Math.max(0, Math.round((pay.get(r.employee.id)?.payable ?? 0) * 100) / 100), overtimeMinutes: pay.get(r.employee.id)?.ot ?? 0 })) };
  }

  /** Lock a cycle's days after payroll closes. Overrides and re-runs are refused afterwards. */
  async lockCycle(from: string, to: string, locked: boolean) {
    this.authz.require('attendance.policy.rerun');
    if (!currentAuth().isOwner && !this.authz.has('company.settings.update')) throw forbidden('Only admins can lock a payroll cycle.');
    const res = await this.db.q.execute(sql`update attendance_days set locked = ${locked} where date >= ${from}::date and date <= ${to}::date`);
    await this.audit.record({ entity: 'attendance-days', action: locked ? 'cycle_locked' : 'cycle_unlocked', changes: { range: { new: `${from}..${to}` }, days: { new: res.rowCount ?? 0 } } });
    return { days: res.rowCount ?? 0, locked };
  }
}

export { addDays };

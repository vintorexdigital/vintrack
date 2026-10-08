import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { countLeaveDays, enumerateDates, validateLeaveRequest } from '@trackrex/rules';
import { restrictionsSchema } from '@trackrex/schemas';
import { ApprovalChain } from '../../core/approval-chain.js';
import { currentAuth } from '../../core/context.js';
import { conflict, forbidden, unprocessable } from '../../core/errors.js';
import { Db } from '../../core/database/db.service.js';
import { CrudService, type CrudDeps } from '../../shared/crud/crud.service.js';
import type { Row } from '../../shared/crud/crud.repository.js';
import { AttendanceEngine } from '../attendance/attendance-engine.service.js';
import { LeaveEngine } from './leave-engine.service.js';

export const LEAVE_REQUESTS_SERVICE = 'CRUD_SERVICE:leave-requests';
const actionBody = z.object({ comment: z.string().trim().max(500).optional() });

@Injectable()
export class LeaveRequestsService extends CrudService {
  constructor(@Inject('CRUD_DEPS') deps: CrudDeps, private readonly pg: Db, private readonly leave: LeaveEngine, private readonly attendance: AttendanceEngine, private readonly chain: ApprovalChain) {
    super(deps);
  }

  private async assertScope(permission: string, employeeId: string): Promise<void> {
    const pred = this.scope.predicate(this.authz.require(permission), sql`e.id`);
    const ok = await this.pg.q.execute(sql`select 1 from employees e where e.id = ${employeeId}::uuid and e.deleted_at is null ${pred ? sql`and ${pred}` : sql``}`);
    if (!ok.rows.length) throw forbidden('That employee is outside your scope.', 'out_of_scope');
  }

  /** Everything a leave application is checked against, before a row is written. */
  protected override async beforeCreate(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const auth = currentAuth();
    const employeeId = String(input.employeeId ?? auth.employeeId ?? '');
    if (!employeeId) throw forbidden('Your account is not linked to an employee record.', 'no_employee');
    if (employeeId !== auth.employeeId) await this.assertScope('leave.request.approve', employeeId);
    else this.authz.require('leave.request.create');

    const empRes = await this.pg.q.execute(sql`select e.gender, e.leave_profile_id, e.date_of_joining, p.half_day_allowed from employees e left join leave_profiles p on p.id = e.leave_profile_id where e.id = ${employeeId}::uuid and e.deleted_at is null and e.status = 'active'`);
    const emp = empRes.rows[0] as { gender: string | null; leave_profile_id: string | null; date_of_joining: string; half_day_allowed: boolean | null } | undefined;
    if (!emp) throw unprocessable('Only active employees can apply for leave.', undefined, 'employee_inactive');

    const typeRes = await this.pg.q.execute(sql`select id, code, name, restrictions, leave_profile_ids, status from leave_types where id = ${String(input.leaveTypeId)}::uuid and deleted_at is null`);
    const type = typeRes.rows[0] as { id: string; code: string; name: string; restrictions: unknown; leave_profile_ids: string[] | null; status: string } | undefined;
    if (!type || type.status !== 'active') throw unprocessable('That leave type is not available.', [{ path: 'leaveTypeId', message: 'Not available' }]);
    if (type.leave_profile_ids?.length && (!emp.leave_profile_id || !type.leave_profile_ids.includes(emp.leave_profile_id))) {
      throw unprocessable('That leave type is not part of your leave profile.', [{ path: 'leaveTypeId', message: 'Not in your leave profile' }]);
    }
    const restrictions = restrictionsSchema.parse(type.restrictions ?? {});
    const duration = String(input.duration ?? 'full') as 'full' | 'first_half' | 'second_half';
    if (duration !== 'full' && emp.half_day_allowed === false) throw unprocessable('Half-day leave is not allowed for your leave profile.', [{ path: 'duration', message: 'Not allowed' }], 'half_day_not_allowed');

    const from = String(input.fromDate);
    const to = String(input.toDate);
    if (to < from) throw unprocessable('The end date is before the start date.', [{ path: 'toDate', message: 'Must not be before the start date' }]);
    if (enumerateDates(from, to).length > 366) throw unprocessable('Choose a shorter range.');
    const cal = await this.attendance.calendarFor(emp.leave_profile_id, from, to);
    const counted = countLeaveDays({ from, to, duration, holidays: cal.holidays, nonWorking: cal.nonWorking, sandwich: restrictions.sandwich });
    if (counted.days === 0) throw unprocessable('Those dates are all holidays or non-working days.', [{ path: 'fromDate', message: 'No working days selected' }], 'no_working_days');

    const today = new Date().toISOString().slice(0, 10);
    const bal = await this.leave.balanceFor(employeeId, type.id, from);
    const sessionStart = (await this.leave.sessionFor(from)).start;
    const apps = await this.pg.q.execute(sql`select count(*)::int as n from leave_requests where employee_id = ${employeeId}::uuid and leave_type_id = ${type.id}::uuid and status in ('pending','approved') and deleted_at is null and from_date >= ${sessionStart}::date`);
    const existing = await this.pg.q.execute(sql`select r.from_date, r.to_date, r.status, t.code from leave_requests r join leave_types t on t.id = r.leave_type_id where r.employee_id = ${employeeId}::uuid and r.deleted_at is null and r.status in ('pending','approved') and r.from_date <= ${to}::date and r.to_date >= ${from}::date`);
    const violations = validateLeaveRequest(
      { from, to, duration, days: counted.days, ...(input.reason ? { reason: String(input.reason) } : {}), typeCode: type.code },
      { ...restrictions, genders: restrictions.genders, ...(restrictions.attachmentRequiredAfterDays === undefined ? {} : {}), cannotCombineWith: restrictions.cannotCombineWith },
      {
        today, balance: bal?.available ?? 0, yearAccrual: bal?.yearAccrual ?? 0, ...(emp.gender ? { gender: emp.gender } : {}),
        applicationsInPeriod: (apps.rows[0] as { n: number }).n,
        existing: (existing.rows as { from_date: string; to_date: string; status: string; code: string }[]).map((r) => ({ from: r.from_date, to: r.to_date, status: r.status, typeCode: r.code })),
      },
    ).filter((v) => v.code !== 'attachment_required');
    if (violations.length) throw unprocessable(violations[0]!.message, violations.map((v) => ({ path: 'fromDate', message: v.message, code: v.code })), violations[0]!.code);

    return { ...input, employeeId, duration, days: counted.days, status: restrictions.autoApprove ? 'approved' : 'pending', ...(restrictions.autoApprove ? { actionAt: new Date().toISOString() } : {}) };
  }

  protected override async afterCreate(row: Row): Promise<void> {
    await this.outbox.emit('leave.requested', { id: row.id, employeeId: row.employeeId, from: row.fromDate, to: row.toDate });
    if (row.status === 'approved') await this.onApproved(row);
    else await this.recomputeRange(row);
  }

  private async recomputeRange(row: Row): Promise<void> {
    for (const d of enumerateDates(String(row.fromDate), String(row.toDate))) {
      if (d <= new Date().toISOString().slice(0, 10)) await this.attendance.recomputeDay(String(row.employeeId), d);
    }
  }

  private async onApproved(row: Row): Promise<void> {
    const session = await this.leave.sessionFor(String(row.fromDate));
    await this.pg.q.execute(sql`
      insert into leave_ledger (tenant_id, employee_id, leave_type_id, session_start, date, days, kind, request_id, created_by)
      values (app_tenant_id(), ${String(row.employeeId)}::uuid, ${String(row.leaveTypeId)}::uuid, ${session.start}::date, ${String(row.fromDate)}::date, ${Number(row.days)}, 'taken', ${row.id}::uuid, app_user_id())
      on conflict (tenant_id, request_id, kind) where request_id is not null and kind = 'taken' do nothing`);
    await this.recomputeRange(row);
    await this.outbox.emit('leave.approved', { id: row.id, employeeId: row.employeeId });
  }

  /** Leave requests are decided or cancelled, not edited. */
  override async update(id: string): Promise<Row> {
    await this.get(id); // unknown or foreign ids are 404 before anything else
    throw conflict('not_editable', 'Leave requests cannot be edited. Cancel and apply again.');
  }

  private async decide(id: string, status: 'approved' | 'rejected', comment?: string): Promise<Row> {
    const scope = this.authz.require('leave.request.approve');
    const row = await this.get(id);
    await this.assertScope('leave.request.approve', String(row.employeeId));
    if (row.status !== 'pending') throw conflict('already_actioned', `This request is already ${row.status}.`);
    const auth = currentAuth();
    if (row.employeeId === auth.employeeId && !auth.isOwner) throw forbidden('You cannot approve your own leave.', 'self_approval');
    if (status === 'rejected' && !comment?.trim()) throw unprocessable('Add a comment when rejecting.', [{ path: 'comment', message: 'Required' }]);
    if (status === 'approved') {
      // With more than one approval level, only the last approval finishes the request; earlier ones pass it up the reporting line.
      const step = await this.chain.approve({ subject: 'leave', subjectId: id, employeeId: String(row.employeeId), comment, scope });
      if (!step.final) {
        await this.audit.record({ entity: 'leave-requests', entityId: id, action: 'approval_level', changes: { level: { old: step.level - 1, new: step.level }, of: { new: step.levels } } });
        return { ...row, approval: step } as Row;
      }
    } else await this.chain.reject({ subject: 'leave', subjectId: id, employeeId: String(row.employeeId), comment });
    const after = await this.repo.update(id, { status, actionBy: auth.employeeId ?? null, actionAt: new Date().toISOString(), actionComment: comment ?? null, updatedBy: auth.userId });
    await this.audit.record({ entity: 'leave-requests', entityId: id, action: status, changes: { status: { old: 'pending', new: status }, comment: { new: comment ?? null } } });
    if (status === 'approved') await this.onApproved(after!);
    else {
      await this.recomputeRange(after!);
      await this.outbox.emit('leave.rejected', { id, employeeId: row.employeeId });
    }
    return after!;
  }

  approve(id: string, body: unknown) { return this.decide(id, 'approved', actionBody.parse(body ?? {}).comment); }
  reject(id: string, body: unknown) { return this.decide(id, 'rejected', actionBody.parse(body ?? {}).comment); }

  async cancel(id: string): Promise<Row> {
    const row = await this.get(id);
    const auth = currentAuth();
    const isOwner = row.employeeId === auth.employeeId;
    if (!isOwner) {
      this.authz.require('leave.request.cancel');
      await this.assertScope('leave.request.cancel', String(row.employeeId));
    }
    if (row.status === 'cancelled' || row.status === 'rejected') throw conflict('already_actioned', `This request is already ${row.status}.`);
    const today = new Date().toISOString().slice(0, 10);
    if (row.status === 'approved' && isOwner && String(row.fromDate) < today && !this.authz.has('leave.request.approve')) {
      throw forbidden('Leave that has started can only be cancelled by a manager.', 'cancel_started');
    }
    const after = await this.repo.update(id, { status: 'cancelled', actionAt: new Date().toISOString(), updatedBy: auth.userId });
    await this.pg.q.execute(sql`delete from leave_ledger where request_id = ${id}::uuid and kind = 'taken'`);
    await this.recomputeRange(after!);
    await this.audit.record({ entity: 'leave-requests', entityId: id, action: 'cancelled', changes: { status: { old: row.status, new: 'cancelled' } } });
    await this.outbox.emit('leave.cancelled', { id, employeeId: row.employeeId });
    return after!;
  }
}

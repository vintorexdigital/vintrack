import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { regularizationActionBody, bulkRegularizationBody } from '@trackrex/schemas';
import { currentAuth, currentStore } from '../../core/context.js';
import { conflict, forbidden, unprocessable } from '../../core/errors.js';
import { ApprovalChain } from '../../core/approval-chain.js';
import { Db } from '../../core/database/db.service.js';
import { SettingsService } from '../../core/settings.service.js';
import { CrudService, type CrudDeps } from '../../shared/crud/crud.service.js';
import type { Row } from '../../shared/crud/crud.repository.js';
import { ShiftResolver } from '../time/shift-resolver.service.js';
import { AttendanceEngine } from './attendance-engine.service.js';

export const REGULARIZATIONS_SERVICE = 'CRUD_SERVICE:regularizations';

@Injectable()
export class RegularizationsService extends CrudService {
  constructor(@Inject('CRUD_DEPS') deps: CrudDeps, private readonly pg: Db, private readonly shifts: ShiftResolver, private readonly engine: AttendanceEngine, private readonly settings: SettingsService, private readonly chain: ApprovalChain) {
    super(deps);
  }

  protected override async beforeCreate(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const auth = currentAuth();
    const employeeId = String(input.employeeId);
    const date = String(input.date);
    if (employeeId !== auth.employeeId) {
      // HR and managers may raise a request for someone in their approval scope
      const scope = this.authz.require('attendance.regularization.approve');
      const pred = this.scope.predicate(scope, sql`e.id`);
      const ok = await this.pg.q.execute(sql`select 1 from employees e where e.id = ${employeeId}::uuid and e.deleted_at is null ${pred ? sql`and ${pred}` : sql``}`);
      if (!ok.rows.length) throw forbidden('That employee is outside your scope.', 'out_of_scope');
    } else {
      this.authz.require('attendance.regularization.create');
    }
    const today = new Date().toISOString().slice(0, 10);
    if (date > today) throw unprocessable('You cannot regularize a future date.', [{ path: 'date', message: 'Choose today or an earlier date' }]);
    const shift = await this.shifts.forDate(employeeId, date);
    if (shift && !shift.rules.regularization.enabled) throw unprocessable('Regularization is turned off for your shift.', undefined, 'regularization_disabled');
    const windowDays = Math.min(shift?.rules.regularization.daysBack ?? 7, await this.settings.get<number>('attendance.regularization_days', 7));
    const cutoff = new Date(Date.now() - windowDays * 86_400_000).toISOString().slice(0, 10);
    if (date < cutoff) throw unprocessable(`You can regularize up to ${windowDays} days back.`, [{ path: 'date', message: `Not earlier than ${cutoff}` }], 'regularization_window');
    const dup = await this.pg.q.execute(sql`select 1 from regularizations where employee_id = ${employeeId}::uuid and date = ${date}::date and status = 'pending' and deleted_at is null`);
    if (dup.rows.length) throw conflict('request_pending', 'A request for that day is already waiting for approval.');
    const day = await this.engine.recomputeDay(employeeId, date);
    if (day?.locked) throw conflict('day_locked', 'Payroll for this cycle is closed.');
    return { ...input, currentCode: day?.statusCode ?? null, status: 'pending' };
  }

  protected override async afterCreate(row: Row): Promise<void> {
    await this.engine.recomputeDay(String(row.employeeId), String(row.date));
    await this.outbox.emit('regularization.requested', { id: row.id, employeeId: row.employeeId, date: row.date });
  }

  /** Requests cannot be edited after submission except to cancel them. */
  override async update(id: string): Promise<Row> {
    await this.get(id); // unknown or foreign ids are 404 before anything else
    throw conflict('not_editable', 'Regularization requests cannot be edited. Cancel and submit a new one.');
  }

  private async resolve(id: string, decision: 'approved' | 'rejected', comment?: string): Promise<Row> {
    const scope = this.authz.require('attendance.regularization.approve');
    const row = await this.get(id);
    const pred = this.scope.predicate(scope, sql`e.id`);
    const inScope = await this.pg.q.execute(sql`select 1 from employees e where e.id = ${String(row.employeeId)}::uuid ${pred ? sql`and ${pred}` : sql``}`);
    if (!inScope.rows.length) throw forbidden('That employee is outside your approval scope.', 'out_of_scope');
    if (row.status !== 'pending') throw conflict('already_actioned', `This request is already ${row.status}.`);
    if (row.employeeId === currentAuth().employeeId && !currentAuth().isOwner) throw forbidden('You cannot approve your own request.', 'self_approval');
    if (!(await this.settings.get<boolean>('attendance.approval_message_optional', false)) && !comment?.trim() && decision === 'rejected') {
      throw unprocessable('Add a comment when rejecting.', [{ path: 'comment', message: 'Required' }]);
    }
    const locked = await this.pg.q.execute(sql`select locked from attendance_days where employee_id = ${String(row.employeeId)}::uuid and date = ${String(row.date)}::date`);
    if ((locked.rows[0] as { locked?: boolean } | undefined)?.locked) throw conflict('day_locked', 'Payroll for this cycle is closed.');
    if (decision === 'approved') {
      // With more than one approval level, only the last approval finishes the request; earlier ones pass it up the reporting line.
      const step = await this.chain.approve({ subject: 'regularization', subjectId: id, employeeId: String(row.employeeId), comment, scope });
      if (!step.final) {
        await this.audit.record({ entity: 'regularizations', entityId: id, action: 'approval_level', changes: { level: { old: step.level - 1, new: step.level }, of: { new: step.levels } } });
        return { ...row, approval: step } as Row;
      }
    } else await this.chain.reject({ subject: 'regularization', subjectId: id, employeeId: String(row.employeeId), comment });
    const after = await this.repo.update(id, { status: decision, actionBy: currentAuth().employeeId ?? null, actionAt: new Date().toISOString(), actionComment: comment ?? null, updatedBy: currentAuth().userId });
    if (decision === 'approved') {
      const code = String(row.requestedCode);
      await this.engine.recomputeDay(String(row.employeeId), String(row.date));
      await this.pg.q.execute(sql`update attendance_days set override_code = ${code}, override_by = app_user_id(), override_reason = ${`Regularization ${row.id}`}, override_at = now() where employee_id = ${String(row.employeeId)}::uuid and date = ${String(row.date)}::date`);
    }
    await this.engine.recomputeDay(String(row.employeeId), String(row.date));
    await this.audit.record({ entity: 'regularizations', entityId: id, action: decision, changes: { status: { old: 'pending', new: decision }, comment: { new: comment ?? null } } });
    await this.outbox.emit(`regularization.${decision}`, { id, employeeId: row.employeeId, date: row.date });
    void currentStore;
    return after!;
  }

  approve(id: string, body: unknown) { return this.resolve(id, 'approved', regularizationActionBody.parse(body ?? {}).comment); }
  reject(id: string, body: unknown) { return this.resolve(id, 'rejected', regularizationActionBody.parse(body ?? {}).comment); }

  async bulkApprove(body: unknown) {
    const b = bulkRegularizationBody.parse(body);
    const out: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of b.ids) {
      try {
        await this.resolve(id, 'approved', b.comment);
        out.push({ id, ok: true });
      } catch (e) {
        out.push({ id, ok: false, error: (e as Error).message });
      }
    }
    return { results: out };
  }

  async cancel(id: string): Promise<Row> {
    const row = await this.get(id);
    if (row.status !== 'pending') throw conflict('already_actioned', `This request is already ${row.status}.`);
    const auth = currentAuth();
    if (row.employeeId !== auth.employeeId && !this.authz.has('attendance.regularization.approve')) throw forbidden('Only the requester can cancel.', 'requester_only');
    const after = await this.repo.update(id, { status: 'cancelled', actionAt: new Date().toISOString(), updatedBy: auth.userId });
    await this.engine.recomputeDay(String(row.employeeId), String(row.date));
    await this.audit.record({ entity: 'regularizations', entityId: id, action: 'cancelled' });
    return after!;
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { bulkExpenseBody, expenseDecisionBody, expensePayBody } from '@trackrex/schemas';
import { currentAuth } from '../../core/context.js';
import { conflict, forbidden, unprocessable } from '../../core/errors.js';
import { Db } from '../../core/database/db.service.js';
import { SettingsService } from '../../core/settings.service.js';
import { CrudService, type CrudDeps } from '../../shared/crud/crud.service.js';
import type { Row } from '../../shared/crud/crud.repository.js';

export const EXPENSES_SERVICE = 'CRUD_SERVICE:expenses';
const WORKFLOW = ['status', 'approvedAmount', 'actionBy', 'actionAt', 'actionComment', 'paidAt', 'paymentReference', 'currency'];
const MAX_AGE_DAYS = 90;

/** Claim lifecycle: pending, then approved or rejected, then paid. Employees can cancel while pending. */
@Injectable()
export class ExpenseClaimsService extends CrudService {
  constructor(@Inject('CRUD_DEPS') deps: CrudDeps, private readonly pg: Db, private readonly settings: SettingsService) {
    super(deps);
  }

  private async assertInScope(permission: string, employeeId: string): Promise<void> {
    const pred = this.scope.predicate(this.authz.require(permission), sql`e.id`);
    const ok = await this.pg.q.execute(sql`select 1 from employees e where e.id = ${employeeId}::uuid and e.deleted_at is null ${pred ? sql`and ${pred}` : sql``}`);
    if (!ok.rows.length) throw forbidden('That employee is outside your scope.', 'out_of_scope');
  }

  private async checkCategory(categoryId: string, amount: number, description: unknown): Promise<void> {
    const r = await this.pg.q.execute(sql`select name, max_amount, note_required, status from expense_categories where id = ${categoryId}::uuid and deleted_at is null`);
    const c = r.rows[0] as { name: string; max_amount: number | null; note_required: boolean; status: string } | undefined;
    if (!c || c.status !== 'active') throw unprocessable('That category is not available.', [{ path: 'categoryId', message: 'Not available' }]);
    if (c.max_amount != null && amount > c.max_amount) throw unprocessable(`${c.name} claims are limited to ${c.max_amount} each.`, [{ path: 'amount', message: `At most ${c.max_amount}` }], 'over_limit');
    if (c.note_required && !String(description ?? '').trim()) throw unprocessable(`${c.name} claims need a description.`, [{ path: 'description', message: 'Required' }]);
  }

  protected override async beforeCreate(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const auth = currentAuth();
    const employeeId = String(input.employeeId);
    if (employeeId !== auth.employeeId) await this.assertInScope('expenses.claim.approve', employeeId);
    const date = String(input.expenseDate);
    const today = new Date().toISOString().slice(0, 10);
    if (date > today) throw unprocessable('The expense date is in the future.', [{ path: 'expenseDate', message: 'Choose today or earlier' }]);
    if (date < new Date(Date.now() - MAX_AGE_DAYS * 86_400_000).toISOString().slice(0, 10)) throw unprocessable(`Claims can be raised up to ${MAX_AGE_DAYS} days after the expense.`, [{ path: 'expenseDate', message: 'Too old' }], 'claim_too_old');
    await this.checkCategory(String(input.categoryId), Number(input.amount), input.description);
    const next = { ...input };
    for (const k of WORKFLOW) delete next[k];
    return { ...next, status: 'pending', currency: await this.settings.get<string>('expense.currency', 'INR') };
  }

  protected override async afterCreate(row: Row): Promise<void> {
    await this.outbox.emit('expense.submitted', { id: row.id, employeeId: row.employeeId, amount: row.amount, currency: row.currency });
  }

  protected override async beforeUpdate(existing: Row, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (existing.status !== 'pending') throw conflict('not_editable', `A ${String(existing.status)} claim cannot be edited.`);
    if (existing.employeeId !== currentAuth().employeeId) throw forbidden('Only the person who raised the claim can edit it.', 'requester_only');
    await this.checkCategory(String(patch.categoryId ?? existing.categoryId), Number(patch.amount ?? existing.amount), patch.description ?? existing.description);
    return patch;
  }

  private async resolve(id: string, decision: 'approved' | 'rejected', rawBody: unknown): Promise<Row> {
    const body = expenseDecisionBody.parse(rawBody ?? {});
    const row = await this.get(id);
    await this.assertInScope('expenses.claim.approve', String(row.employeeId));
    if (row.status !== 'pending') throw conflict('already_actioned', `This claim is already ${String(row.status)}.`);
    const auth = currentAuth();
    if (row.employeeId === auth.employeeId && !auth.isOwner) throw forbidden('You cannot approve your own claim.', 'self_approval');
    if (decision === 'rejected' && !body.comment?.trim()) throw unprocessable('Say why you are rejecting this claim.', [{ path: 'comment', message: 'Required' }]);
    const claimed = Number(row.amount);
    const approvedAmount = decision === 'approved' ? (body.approvedAmount ?? claimed) : 0;
    if (approvedAmount > claimed) throw unprocessable('The approved amount cannot exceed the claimed amount.', [{ path: 'approvedAmount', message: `At most ${claimed}` }]);
    const after = await this.repo.update(id, { status: decision, approvedAmount, actionBy: auth.employeeId ?? null, actionAt: new Date().toISOString(), actionComment: body.comment ?? null, updatedBy: auth.userId });
    await this.audit.record({ entity: 'expenses', entityId: id, action: decision, changes: { status: { old: 'pending', new: decision }, approvedAmount: { old: null, new: approvedAmount } } });
    await this.outbox.emit(`expense.${decision}`, { id, employeeId: row.employeeId, amount: approvedAmount });
    return after!;
  }

  approve(id: string, body: unknown) { return this.resolve(id, 'approved', body); }
  reject(id: string, body: unknown) { return this.resolve(id, 'rejected', body); }

  async bulkApprove(body: unknown) {
    const b = bulkExpenseBody.parse(body);
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of b.ids) {
      try { await this.resolve(id, 'approved', { comment: b.comment }); results.push({ id, ok: true }); } catch (e) { results.push({ id, ok: false, error: (e as Error).message }); }
    }
    return { results };
  }

  async cancel(id: string): Promise<Row> {
    const row = await this.get(id);
    if (row.status !== 'pending') throw conflict('already_actioned', `This claim is already ${String(row.status)}.`);
    const auth = currentAuth();
    if (row.employeeId !== auth.employeeId && !this.authz.has('expenses.claim.approve')) throw forbidden('Only the requester can cancel.', 'requester_only');
    const after = await this.repo.update(id, { status: 'cancelled', actionAt: new Date().toISOString(), updatedBy: auth.userId });
    await this.audit.record({ entity: 'expenses', entityId: id, action: 'cancelled' });
    return after!;
  }

  /** Reimbursement: only approved claims, only by someone with the pay permission, always for the approved amount. */
  async pay(id: string, rawBody: unknown): Promise<Row> {
    this.authz.require('expenses.claim.pay');
    const body = expensePayBody.parse(rawBody ?? {});
    const row = await this.get(id);
    if (row.status !== 'approved') throw conflict('not_approved', row.status === 'paid' ? 'This claim is already paid.' : 'Only approved claims can be paid.');
    const after = await this.repo.update(id, { status: 'paid', paidAt: new Date().toISOString(), paymentReference: body.reference ?? null, updatedBy: currentAuth().userId });
    await this.audit.record({ entity: 'expenses', entityId: id, action: 'paid', changes: { paymentReference: { old: null, new: body.reference ?? null } } });
    await this.outbox.emit('expense.paid', { id, employeeId: row.employeeId, amount: row.approvedAmount });
    return after!;
  }

  /** What the Today and approvals strips need: pending count in scope and the viewer's own reimbursements outstanding. */
  async summary(): Promise<{ pending: number; approvedUnpaid: number; approvedUnpaidAmount: number }> {
    const pred = this.scopePredicate(this.perms.read);
    const r = await this.pg.q.execute(sql`
      select count(*) filter (where status = 'pending')::int as pending, count(*) filter (where status = 'approved')::int as approved_unpaid,
             coalesce(sum(approved_amount) filter (where status = 'approved'), 0)::float as approved_amount
        from expenses where deleted_at is null ${pred ? sql`and ${pred}` : sql``}`);
    const x = r.rows[0] as { pending: number; approved_unpaid: number; approved_amount: number };
    return { pending: x.pending, approvedUnpaid: x.approved_unpaid, approvedUnpaidAmount: x.approved_amount };
  }
}

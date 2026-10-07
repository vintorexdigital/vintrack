import { RequiresModule } from '../../core/auth/decorators.js';
import { Body, Controller, HttpCode, Inject, Injectable, Module, Param, Post } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { callLogs, idParam, leadStageBody, leads } from '@trackrex/schemas';
import { currentAuth } from '../../core/context.js';
import { conflict, forbidden, notFound, unprocessable } from '../../core/errors.js';
import { Db } from '../../core/database/db.service.js';
import { CrudController } from '../../shared/crud/crud.controller.js';
import { apiPathFor, crudParts } from '../../shared/crud/crud.factory.js';
import type { Row } from '../../shared/crud/crud.repository.js';
import { CrudService, type CrudDeps } from '../../shared/crud/crud.service.js';

const LEADS_SERVICE = 'CRUD_SERVICE:leads';
const CALLS_SERVICE = 'CRUD_SERVICE:call-logs';
const WORKFLOW = ['stage', 'lostReason', 'convertedCustomerId'];

@Injectable()
export class LeadsService extends CrudService {
  constructor(@Inject('CRUD_DEPS') deps: CrudDeps, private readonly pg: Db) { super(deps); }

  private async assertEmployeeInScope(permission: string, employeeId: string): Promise<void> {
    if (employeeId === currentAuth().employeeId) return;
    const pred = this.scope.predicate(this.authz.require(permission), sql`e.id`);
    const ok = await this.pg.q.execute(sql`select 1 from employees e where e.id = ${employeeId}::uuid and e.deleted_at is null and e.status = 'active' ${pred ? sql`and ${pred}` : sql``}`);
    if (!ok.rows.length) throw forbidden('That person is outside your scope.', 'out_of_scope');
  }

  protected override async beforeCreate(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    await this.assertEmployeeInScope(this.perms.create, String(input.ownerId));
    const next = { ...input };
    for (const k of WORKFLOW) delete next[k];
    return { ...next, stage: 'new' };
  }

  protected override async beforeUpdate(existing: Row, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (existing.stage === 'won' || existing.stage === 'lost') throw conflict('lead_closed', 'A won or lost lead cannot be edited.');
    if (patch.ownerId && patch.ownerId !== existing.ownerId) await this.assertEmployeeInScope(this.perms.update, String(patch.ownerId));
    return patch;
  }

  protected override async afterCreate(row: Row): Promise<void> {
    await this.outbox.emit('lead.assigned', { id: row.id, employeeId: row.ownerId, title: row.name });
  }

  /** The lead must be inside the viewer's write scope, not just their read scope. */
  private async writable(id: string): Promise<Row> {
    const pred: SQL | undefined = this.scopePredicate(this.perms.update);
    const row = await this.repo.get(id, pred);
    if (!row) throw notFound('Lead');
    return row;
  }

  async setStage(id: string, rawBody: unknown): Promise<Row> {
    const b = leadStageBody.parse(rawBody ?? {});
    const row = await this.writable(id);
    if (row.stage === 'won' || row.stage === 'lost') throw conflict('lead_closed', `This lead is already ${String(row.stage)}.`);
    if (b.stage === 'lost' && !b.reason?.trim()) throw unprocessable('Say why the lead was lost.', [{ path: 'reason', message: 'Required' }]);
    const after = await this.repo.update(id, {
      stage: b.stage, ...(b.stage === 'lost' ? { lostReason: b.reason } : {}),
      ...(b.nextFollowUpAt !== undefined ? { nextFollowUpAt: b.nextFollowUpAt } : b.stage === 'won' || b.stage === 'lost' ? { nextFollowUpAt: null } : {}),
      updatedBy: currentAuth().userId,
    });
    await this.audit.record({ entity: 'leads', entityId: id, action: 'stage_changed', changes: { stage: { old: row.stage, new: b.stage } } });
    await this.outbox.emit('lead.stage_changed', { id, employeeId: row.ownerId, title: row.name, stage: b.stage });
    return after!;
  }

  /** Winning a lead creates the customer and its first contact, and links them. */
  async convert(id: string): Promise<{ lead: Row; customerId: string }> {
    this.authz.require('field.customer.create');
    const row = await this.writable(id);
    if (row.convertedCustomerId) throw conflict('already_converted', 'This lead is already a customer.');
    if (row.stage === 'lost') throw conflict('lead_closed', 'A lost lead cannot be converted. Reopen it by creating a new lead.');
    const auth = currentAuth();
    const code = await this.sequences.next('customers', 'CUST');
    const cust = await this.pg.q.execute(sql`
      insert into customers (tenant_id, code, name, customer_type, phone, email, account_owner_id, status, notes, created_by, updated_by)
      values (app_tenant_id(), ${code}, ${String(row.companyName ?? row.name)}, ${row.companyName ? 'business' : 'individual'}, ${(row.phone as string | null) ?? null}, ${(row.email as string | null) ?? null}, ${row.ownerId as string}::uuid, 'active', ${(row.notes as string | null) ?? null}, ${auth.userId}::uuid, ${auth.userId}::uuid) returning id`);
    const customerId = (cust.rows[0] as { id: string }).id;
    await this.pg.q.execute(sql`insert into contacts (tenant_id, customer_id, name, phone, email, is_primary, created_by, updated_by) values (app_tenant_id(), ${customerId}::uuid, ${String(row.name)}, ${(row.phone as string | null) ?? null}, ${(row.email as string | null) ?? null}, true, ${auth.userId}::uuid, ${auth.userId}::uuid)`);
    const after = await this.repo.update(id, { stage: 'won', convertedCustomerId: customerId, nextFollowUpAt: null, updatedBy: auth.userId });
    await this.audit.record({ entity: 'leads', entityId: id, action: 'converted', changes: { convertedCustomerId: { old: null, new: customerId } } });
    await this.outbox.emit('lead.converted', { id, employeeId: row.ownerId, title: row.name, customerId });
    return { lead: after!, customerId };
  }
}

@Injectable()
export class CallLogsService extends CrudService {
  constructor(@Inject('CRUD_DEPS') deps: CrudDeps, private readonly pg: Db) { super(deps); }

  protected override async beforeCreate(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const employeeId = String(input.employeeId);
    if (employeeId !== currentAuth().employeeId) {
      const pred = this.scope.predicate(this.authz.require(this.perms.update), sql`e.id`);
      const ok = await this.pg.q.execute(sql`select 1 from employees e where e.id = ${employeeId}::uuid and e.deleted_at is null ${pred ? sql`and ${pred}` : sql``}`);
      if (!ok.rows.length) throw forbidden('You can log calls only for yourself or your team.', 'out_of_scope');
    }
    if (new Date(String(input.startedAt)).getTime() > Date.now() + 5 * 60_000) throw unprocessable('The call cannot start in the future.', [{ path: 'startedAt', message: 'Choose a time that has passed' }]);
    return input;
  }
}

const leadParts = crudParts(leads, { service: LeadsService });
const callParts = crudParts(callLogs, { service: CallLogsService });

@RequiresModule('leads')
@Controller(apiPathFor(leads))
class LeadsController extends CrudController {
  constructor(@Inject(LEADS_SERVICE) protected override readonly service: LeadsService) { super(service); }
  @Post(':id/stage') @HttpCode(200) stage(@Param() p: unknown, @Body() b: unknown) { return this.service.setStage(idParam.parse(p).id, b); }
  @Post(':id/convert') @HttpCode(200) convert(@Param() p: unknown) { return this.service.convert(idParam.parse(p).id); }
}

@Module({ controllers: [LeadsController], providers: [leadParts.depsProvider, { provide: LEADS_SERVICE, useClass: LeadsService }] })
class LeadsModule {}
@Module({ controllers: [callParts.Controller], providers: [callParts.depsProvider, { provide: CALLS_SERVICE, useClass: CallLogsService }] })
class CallsModule {}

/** Lead tracking and the call log. */
@Module({ imports: [LeadsModule, CallsModule] })
export class SalesModule {}

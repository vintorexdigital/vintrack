import { Body, Controller, Get, HttpCode, Inject, Injectable, Module, Param, Post } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { SETTING_BY_KEY, assets, idParam, tickets, uuid, TICKET_PRIORITIES } from '@trackrex/schemas';
import { RequiresModule } from '../../core/auth/decorators.js';
import { currentAuth } from '../../core/context.js';
import { Db } from '../../core/database/db.service.js';
import { conflict, forbidden, unprocessable } from '../../core/errors.js';
import { SettingsService } from '../../core/settings.service.js';
import { CrudService, type CrudDeps } from '../../shared/crud/crud.service.js';
import type { Row } from '../../shared/crud/crud.repository.js';
import { CrudController } from '../../shared/crud/crud.controller.js';
import { apiPathFor, crudParts } from '../../shared/crud/crud.factory.js';

const commentBody = z.object({ body: z.string().trim().min(1, 'Write a message').max(4000), internal: z.boolean().default(false) });
const assignBody = z.object({ assigneeId: uuid.nullable() });
const statusBody = z.object({ status: z.enum(['in_progress', 'waiting', 'resolved']), message: z.string().trim().max(2000).optional() });
const rateBody = z.object({ rating: z.number().int().min(1).max(5), comment: z.string().trim().max(500).optional() });
const WORKFLOW_FIELDS = ['status', 'assigneeId', 'firstResponseDueAt', 'resolutionDueAt', 'firstRespondedAt', 'resolvedAt', 'rating'];
const HOUR = 3_600_000;
const dflt = (k: string) => (SETTING_BY_KEY.get(k)?.default as number | undefined) ?? 24;
const REOPEN_DAYS = 14;

/**
 * Tickets. Anyone can raise one for themselves; the people who work the help desk (they hold
 * `helpdesk.ticket.assign`) see the queue, reply, add internal notes, assign and resolve. Deadlines come from the
 * company's settings by priority and are checked by the `check-ticket-sla` job.
 */
@Injectable()
export class TicketsService extends CrudService {
  constructor(@Inject('CRUD_DEPS') deps: CrudDeps, private readonly pg: Db, private readonly settings: SettingsService) { super(deps); }

  private get isAgent() { return this.authz.has('helpdesk.ticket.assign'); }

  /** Most people raise tickets for themselves, so the requester defaults to the signed-in person. */
  override async create(body: unknown): Promise<Row> {
    const b = { ...((body ?? {}) as Record<string, unknown>) };
    if (!b.requesterId && currentAuth().employeeId) b.requesterId = currentAuth().employeeId;
    return super.create(b);
  }

  protected override async beforeCreate(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const auth = currentAuth();
    const requester = String(input.requesterId ?? auth.employeeId ?? '');
    if (!requester) throw forbidden('Your account is not linked to an employee record.', 'no_employee');
    if (requester !== auth.employeeId) {
      const scope = this.authz.require(this.perms.create);
      const pred = this.scope.predicate(scope, sql`e.id`);
      const ok = await this.pg.q.execute(sql`select 1 from employees e where e.id = ${requester}::uuid and e.deleted_at is null ${pred ? sql`and ${pred}` : sql``}`);
      if (!ok.rows.length) throw forbidden('You can only raise tickets for people in your scope.', 'out_of_scope');
    }
    const next: Record<string, unknown> = { ...input, requesterId: requester };
    for (const k of WORKFLOW_FIELDS) delete next[k];
    const priority = String(input.priority ?? 'normal') as (typeof TICKET_PRIORITIES)[number];
    const now = Date.now();
    const first = await this.settings.get<number>(`helpdesk.first_reply_hours.${priority}`, dflt(`helpdesk.first_reply_hours.${priority}`));
    const resolve = await this.settings.get<number>(`helpdesk.resolution_hours.${priority}`, dflt(`helpdesk.resolution_hours.${priority}`));
    return { ...next, priority, status: 'open', firstResponseDueAt: new Date(now + first * HOUR).toISOString(), resolutionDueAt: new Date(now + resolve * HOUR).toISOString() };
  }

  protected override async afterCreate(row: Row): Promise<void> {
    await this.outbox.emit('ticket.created', { id: row.id, employeeId: row.requesterId, title: row.subject, category: row.category, priority: row.priority });
  }

  protected override async beforeUpdate(existing: Row, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (existing.status === 'closed') throw conflict('ticket_closed', 'A closed ticket cannot be edited.');
    const next = { ...patch };
    for (const k of WORKFLOW_FIELDS) delete next[k];
    delete next.requesterId;
    // The person who asked may reword it until someone picks it up; after that only the help desk edits.
    if (!this.isAgent && (existing.status !== 'open' || existing.assigneeId)) throw forbidden('This ticket is being worked on. Add a comment instead.', 'ticket_in_progress');
    if (next.priority && next.priority !== existing.priority && !this.isAgent) throw forbidden('Only the help desk changes priority.', 'agents_only');
    if (next.priority && next.priority !== existing.priority) {
      const created = new Date(String(existing.createdAt)).getTime();
      const p = String(next.priority);
      next.firstResponseDueAt = existing.firstRespondedAt ? existing.firstResponseDueAt : new Date(created + (await this.settings.get<number>(`helpdesk.first_reply_hours.${p}`, dflt(`helpdesk.first_reply_hours.${p}`))) * HOUR).toISOString();
      next.resolutionDueAt = new Date(created + (await this.settings.get<number>(`helpdesk.resolution_hours.${p}`, dflt(`helpdesk.resolution_hours.${p}`))) * HOUR).toISOString();
    }
    return next;
  }

  /* ---------- the conversation ---------- */

  async comments(id: string) {
    await this.get(id);
    const r = await this.pg.q.execute(sql`
      select c.id, c.body, c.internal, c.created_at as "createdAt", u.name as "authorName", (c.author_employee_id = t.requester_id) as "fromRequester"
        from ticket_comments c join tickets t on t.id = c.ticket_id left join platform.users u on u.id = c.author_user_id
       where c.ticket_id = ${id}::uuid ${this.isAgent ? sql`` : sql`and not c.internal`} order by c.created_at`);
    return { data: r.rows };
  }

  async comment(id: string, raw: unknown) {
    const b = commentBody.parse(raw ?? {});
    const ticket = await this.get(id);
    const auth = currentAuth();
    const agent = this.isAgent;
    const isRequester = !!auth.employeeId && ticket.requesterId === auth.employeeId;
    if (!agent && !isRequester) this.authz.require('helpdesk.ticket.comment'); // managers read reportees' tickets but do not speak on them
    if (!agent && !isRequester) throw forbidden('Only the person who asked and the help desk can reply.', 'not_a_participant');
    if (b.internal && !agent) throw forbidden('Only the help desk can add internal notes.', 'agents_only');
    if (ticket.status === 'closed') throw conflict('ticket_closed', 'This ticket is closed. Reopen it to reply.');
    await this.pg.q.execute(sql`insert into ticket_comments (tenant_id, ticket_id, author_user_id, author_employee_id, body, internal) values (app_tenant_id(), ${id}::uuid, ${auth.userId}::uuid, ${auth.employeeId ?? null}::uuid, ${b.body}, ${b.internal})`);
    if (agent && !b.internal && !ticket.firstRespondedAt) await this.repo.update(id, { firstRespondedAt: new Date().toISOString() });
    // A reply from the requester puts a waiting ticket back in the queue; a public reply from the help desk tells the requester.
    if (!agent && ticket.status === 'waiting') await this.repo.update(id, { status: 'in_progress' });
    if (agent && !b.internal && ticket.requesterId) await this.outbox.emit('ticket.replied', { id, employeeId: ticket.requesterId, title: ticket.subject });
    return this.comments(id);
  }

  /* ---------- working the ticket ---------- */

  private agent() { this.authz.require('helpdesk.ticket.assign'); }

  async assign(id: string, raw: unknown) {
    this.agent();
    const b = assignBody.parse(raw ?? {});
    const t = await this.get(id);
    if (t.status === 'closed') throw conflict('ticket_closed', 'A closed ticket cannot be assigned.');
    if (b.assigneeId) {
      const ok = await this.pg.q.execute(sql`select 1 from employees where id = ${b.assigneeId}::uuid and deleted_at is null and status = 'active'`);
      if (!ok.rows.length) throw unprocessable('Choose an active employee.', [{ path: 'assigneeId', message: 'Unknown employee' }]);
    }
    const after = await this.repo.update(id, { assigneeId: b.assigneeId, ...(b.assigneeId && t.status === 'open' ? { status: 'in_progress' } : {}), updatedBy: currentAuth().userId });
    await this.audit.record({ entity: 'tickets', entityId: id, action: 'assigned', changes: { assigneeId: { old: t.assigneeId ?? null, new: b.assigneeId } } });
    if (b.assigneeId && b.assigneeId !== t.assigneeId) await this.outbox.emit('ticket.assigned', { id, employeeId: b.assigneeId, title: t.subject });
    return after!;
  }

  async setStatus(id: string, raw: unknown) {
    this.agent();
    const b = statusBody.parse(raw ?? {});
    const t = await this.get(id);
    if (t.status === 'closed') throw conflict('ticket_closed', 'A closed ticket cannot change. Reopen it first.');
    const now = new Date().toISOString();
    const after = await this.repo.update(id, { status: b.status, ...(b.status === 'resolved' ? { resolvedAt: now } : { resolvedAt: null }), ...(!t.firstRespondedAt ? { firstRespondedAt: now } : {}), ...(!t.assigneeId && currentAuth().employeeId ? { assigneeId: currentAuth().employeeId } : {}), updatedBy: currentAuth().userId });
    if (b.message) await this.pg.q.execute(sql`insert into ticket_comments (tenant_id, ticket_id, author_user_id, author_employee_id, body, internal) values (app_tenant_id(), ${id}::uuid, ${currentAuth().userId}::uuid, ${currentAuth().employeeId ?? null}::uuid, ${b.message}, false)`);
    await this.audit.record({ entity: 'tickets', entityId: id, action: b.status, changes: { status: { old: t.status, new: b.status } } });
    if (b.status === 'resolved') await this.outbox.emit('ticket.resolved', { id, employeeId: t.requesterId, title: t.subject, category: t.category });
    return after!;
  }

  /* ---------- the requester's side ---------- */

  private async asRequesterOrAgent(id: string): Promise<Row> {
    const t = await this.get(id);
    if (!this.isAgent && t.requesterId !== currentAuth().employeeId) throw forbidden('Only the person who asked can do this.', 'requester_only');
    return t;
  }

  async close(id: string) {
    const t = await this.asRequesterOrAgent(id);
    if (t.status === 'closed') return t;
    const after = await this.repo.update(id, { status: 'closed', ...(t.resolvedAt ? {} : { resolvedAt: new Date().toISOString() }), updatedBy: currentAuth().userId });
    await this.audit.record({ entity: 'tickets', entityId: id, action: 'closed', changes: { status: { old: t.status, new: 'closed' } } });
    return after!;
  }

  async reopen(id: string) {
    const t = await this.asRequesterOrAgent(id);
    if (t.status !== 'resolved' && t.status !== 'closed') throw conflict('not_resolved', 'Only a resolved or closed ticket can be reopened.');
    if (!this.isAgent && t.resolvedAt && Date.now() - new Date(String(t.resolvedAt)).getTime() > REOPEN_DAYS * 86_400_000) throw conflict('too_late', `A ticket can be reopened for ${REOPEN_DAYS} days after it is resolved. Raise a new one.`);
    const after = await this.repo.update(id, { status: 'open', resolvedAt: null, updatedBy: currentAuth().userId });
    await this.audit.record({ entity: 'tickets', entityId: id, action: 'reopened', changes: { status: { old: t.status, new: 'open' } } });
    return after!;
  }

  async rate(id: string, raw: unknown) {
    const b = rateBody.parse(raw ?? {});
    const t = await this.get(id);
    if (t.requesterId !== currentAuth().employeeId) throw forbidden('Only the person who asked can rate it.', 'requester_only');
    if (t.status !== 'resolved' && t.status !== 'closed') throw conflict('not_resolved', 'Rate a ticket once it is resolved.');
    const after = await this.repo.update(id, { rating: b.rating, updatedBy: currentAuth().userId });
    if (b.comment) await this.pg.q.execute(sql`insert into ticket_comments (tenant_id, ticket_id, author_user_id, author_employee_id, body, internal) values (app_tenant_id(), ${id}::uuid, ${currentAuth().userId}::uuid, ${currentAuth().employeeId}::uuid, ${`Rated ${b.rating} of 5: ${b.comment}`}, false)`);
    return after!;
  }

  /** Counts for the queue header. */
  async summary() {
    const pred = this.scopePredicate(this.perms.read);
    const r = (await this.pg.q.execute(sql`
      select count(*) filter (where status in ('open', 'in_progress', 'waiting'))::int as open,
             count(*) filter (where status = 'open' and assignee_id is null)::int as unassigned,
             count(*) filter (where status in ('open', 'in_progress') and resolution_due_at < now())::int as overdue,
             count(*) filter (where status = 'resolved')::int as resolved,
             round((avg(rating) filter (where rating is not null))::numeric, 1)::float as rating
        from tickets where deleted_at is null ${pred ? sql`and ${pred}` : sql``}`)).rows[0];
    return r;
  }

  /** Worker job. Reports each missed deadline once and closes tickets that were resolved and left alone. */
  async checkSla(): Promise<number> {
    let n = 0;
    const late = (await this.pg.q.execute(sql`
      select t.id, t.requester_id, t.assignee_id, t.subject, t.priority, t.category,
             (t.first_responded_at is null and t.first_response_due_at < now() and s.response_breached_at is null) as response,
             (t.resolution_due_at < now() and s.resolution_breached_at is null) as resolution
        from tickets t left join ticket_sla s on s.ticket_id = t.id
       where t.deleted_at is null and t.status in ('open', 'in_progress', 'waiting')
         and ((t.first_responded_at is null and t.first_response_due_at < now() and s.response_breached_at is null) or (t.resolution_due_at < now() and s.resolution_breached_at is null)) limit 200`)).rows as { id: string; assignee_id: string | null; requester_id: string; subject: string; priority: string; category: string; response: boolean; resolution: boolean }[];
    for (const t of late) {
      for (const kind of ['response', 'resolution'] as const) {
        if (!t[kind]) continue;
        await this.pg.q.execute(sql`
          insert into ticket_sla (tenant_id, ticket_id, ${sql.raw(kind === 'response' ? 'response_breached_at' : 'resolution_breached_at')}) values (app_tenant_id(), ${t.id}::uuid, now())
          on conflict (tenant_id, ticket_id) do update set ${sql.raw(kind === 'response' ? 'response_breached_at' : 'resolution_breached_at')} = now()`);
        await this.outbox.emit('ticket.sla_breached', { id: t.id, employeeId: t.requester_id, assigneeId: t.assignee_id, title: t.subject, kind, priority: t.priority, category: t.category });
        n++;
      }
    }
    const days = await this.settings.get<number>('helpdesk.auto_close_days', 7);
    if (days > 0) {
      const closed = await this.pg.q.execute(sql`update tickets set status = 'closed', version = version + 1, updated_at = now() where status = 'resolved' and deleted_at is null and resolved_at < now() - make_interval(days => ${days})`);
      n += closed.rowCount ?? 0;
    }
    return n;
  }
}

/** Equipment and who has it. */
@Injectable()
export class AssetsService extends CrudService {
  constructor(@Inject('CRUD_DEPS') deps: CrudDeps, private readonly pg: Db) { super(deps); }

  protected override async beforeCreate(input: Record<string, unknown>) {
    const { status: _s, assignedToId: _a, ...rest } = input;
    return { ...rest, status: 'in_stock' };
  }
  protected override async beforeUpdate(existing: Row, patch: Record<string, unknown>) {
    const { status: _s, assignedToId: _a, ...rest } = patch;
    if (existing.status === 'retired') throw conflict('asset_retired', 'A retired asset cannot be edited.');
    return rest;
  }
  protected override async beforeDelete(row: Row) {
    if (row.status === 'assigned') throw conflict('asset_assigned', 'Take the asset back before deleting it.');
  }

  async assign(id: string, raw: unknown) {
    this.authz.require(this.perms.update);
    const b = z.object({ employeeId: uuid, note: z.string().trim().max(300).optional() }).parse(raw ?? {});
    const a = await this.get(id);
    if (a.status !== 'in_stock') throw conflict('not_in_stock', a.status === 'assigned' ? 'This asset is already with someone.' : `A ${String(a.status).replace('_', ' ')} asset cannot be assigned.`);
    const e = await this.pg.q.execute(sql`select 1 from employees where id = ${b.employeeId}::uuid and deleted_at is null and status in ('active', 'invited')`);
    if (!e.rows.length) throw unprocessable('Choose an active employee.', [{ path: 'employeeId', message: 'Unknown employee' }]);
    await this.pg.q.execute(sql`insert into asset_assignments (tenant_id, asset_id, employee_id, assigned_by, assign_note) values (app_tenant_id(), ${id}::uuid, ${b.employeeId}::uuid, ${currentAuth().userId}::uuid, ${b.note ?? null})`);
    const after = await this.repo.update(id, { status: 'assigned', assignedToId: b.employeeId, updatedBy: currentAuth().userId });
    await this.audit.record({ entity: 'assets', entityId: id, action: 'assigned', changes: { assignedToId: { old: null, new: b.employeeId } } });
    return after!;
  }

  async giveBack(id: string, raw: unknown) {
    this.authz.require(this.perms.update);
    const b = z.object({ condition: z.enum(['good', 'needs_repair', 'lost']).default('good'), note: z.string().trim().max(300).optional() }).parse(raw ?? {});
    const a = await this.get(id);
    if (a.status !== 'assigned') throw conflict('not_assigned', 'This asset is not with anyone.');
    await this.pg.q.execute(sql`update asset_assignments set returned_at = now(), returned_by = ${currentAuth().userId}::uuid, return_condition = ${b.condition}, return_note = ${b.note ?? null} where asset_id = ${id}::uuid and returned_at is null`);
    const status = b.condition === 'good' ? 'in_stock' : b.condition === 'needs_repair' ? 'repair' : 'retired';
    const after = await this.repo.update(id, { status, assignedToId: null, updatedBy: currentAuth().userId });
    await this.audit.record({ entity: 'assets', entityId: id, action: 'returned', changes: { status: { old: 'assigned', new: status }, condition: { new: b.condition } } });
    return after!;
  }

  /** Back from repair, or sent for repair. */
  async setRepair(id: string, repair: boolean) {
    this.authz.require(this.perms.update);
    const a = await this.get(id);
    if (repair && a.status !== 'in_stock') throw conflict('not_in_stock', 'Only an asset in stock can be sent for repair.');
    if (!repair && a.status !== 'repair') throw conflict('not_in_repair', 'This asset is not in repair.');
    return (await this.repo.update(id, { status: repair ? 'repair' : 'in_stock', updatedBy: currentAuth().userId }))!;
  }

  async history(id: string) {
    await this.get(id);
    const r = await this.pg.q.execute(sql`
      select a.id, e.display_name as "employeeName", a.assigned_at as "assignedAt", a.assign_note as "assignNote", a.returned_at as "returnedAt", a.return_condition as "condition", a.return_note as "returnNote"
        from asset_assignments a join employees e on e.id = a.employee_id where a.asset_id = ${id}::uuid order by a.assigned_at desc`);
    return { data: r.rows };
  }
}

const ticketParts = crudParts(tickets, { service: TicketsService });
const assetParts = crudParts(assets, { service: AssetsService });

@RequiresModule('help_desk')
@Controller(apiPathFor(tickets))
class TicketsController extends CrudController {
  constructor(@Inject(ticketParts.token) protected override readonly service: TicketsService) { super(service); }
  @Get('summary') summary() { return this.service.summary(); }
  @Get(':id/comments') comments(@Param() p: unknown) { return this.service.comments(idParam.parse(p).id); }
  @Post(':id/comments') @HttpCode(200) comment(@Param() p: unknown, @Body() b: unknown) { return this.service.comment(idParam.parse(p).id, b); }
  @Post(':id/assign') @HttpCode(200) assign(@Param() p: unknown, @Body() b: unknown) { return this.service.assign(idParam.parse(p).id, b); }
  @Post(':id/status') @HttpCode(200) status(@Param() p: unknown, @Body() b: unknown) { return this.service.setStatus(idParam.parse(p).id, b); }
  @Post(':id/close') @HttpCode(200) close(@Param() p: unknown) { return this.service.close(idParam.parse(p).id); }
  @Post(':id/reopen') @HttpCode(200) reopen(@Param() p: unknown) { return this.service.reopen(idParam.parse(p).id); }
  @Post(':id/rate') @HttpCode(200) rate(@Param() p: unknown, @Body() b: unknown) { return this.service.rate(idParam.parse(p).id, b); }
}

@RequiresModule('assets')
@Controller(apiPathFor(assets))
class AssetsController extends CrudController {
  constructor(@Inject(assetParts.token) protected override readonly service: AssetsService) { super(service); }
  @Get(':id/history') history(@Param() p: unknown) { return this.service.history(idParam.parse(p).id); }
  @Post(':id/assign') @HttpCode(200) assign(@Param() p: unknown, @Body() b: unknown) { return this.service.assign(idParam.parse(p).id, b); }
  @Post(':id/return') @HttpCode(200) giveBack(@Param() p: unknown, @Body() b: unknown) { return this.service.giveBack(idParam.parse(p).id, b); }
  @Post(':id/repair') @HttpCode(200) repair(@Param() p: unknown) { return this.service.setRepair(idParam.parse(p).id, true); }
  @Post(':id/repaired') @HttpCode(200) repaired(@Param() p: unknown) { return this.service.setRepair(idParam.parse(p).id, false); }
}

/** What the signed-in person has been given. Everyone can see their own; the company asset list stays with administrators. */
@RequiresModule('assets')
@Controller('helpdesk')
class MyAssetsController {
  constructor(private readonly db: Db) {}
  @Get('my-assets')
  async mine() {
    const me = currentAuth().employeeId;
    if (!me) return { data: [] };
    const r = await this.db.q.execute(sql`select a.id, a.code, a.name, a.category, a.serial, s.assigned_at as "assignedAt" from assets a join asset_assignments s on s.asset_id = a.id and s.returned_at is null where a.assigned_to_id = ${me}::uuid and a.deleted_at is null order by s.assigned_at desc`);
    return { data: r.rows };
  }
}

@Module({ controllers: [TicketsController], providers: [ticketParts.depsProvider, { provide: ticketParts.token, useClass: TicketsService }], exports: [ticketParts.token] })
class TicketsModule {}

@Module({ controllers: [AssetsController, MyAssetsController], providers: [assetParts.depsProvider, { provide: assetParts.token, useClass: AssetsService }], exports: [assetParts.token] })
class AssetsModule {}

/** Help desk: tickets with deadlines, and assets with who has them. See ADR 0020. */
@Module({ imports: [TicketsModule, AssetsModule], exports: [TicketsModule] })
export class HelpdeskModule {}

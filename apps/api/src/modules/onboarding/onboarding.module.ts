import { Body, Controller, Get, HttpCode, Injectable, Module, Param, Post, Query } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { addDays } from '@trackrex/rules';
import { idParam, onboardingTemplates, uuid, type OnboardingItemDef } from '@trackrex/schemas';
import { AuditService } from '../../core/audit.service.js';
import { RequiresModule } from '../../core/auth/decorators.js';
import { currentAuth } from '../../core/context.js';
import { Db } from '../../core/database/db.service.js';
import { conflict, forbidden, notFound } from '../../core/errors.js';
import { OutboxService } from '../../core/outbox.service.js';
import { Authz, ScopeResolver } from '../../core/rbac.service.js';
import { crudModule } from '../../shared/crud/crud.factory.js';

const startBody = z.object({ employeeId: uuid, templateId: uuid, startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const doneBody = z.object({ note: z.string().trim().max(300).optional() });
const listQuery = z.object({ employeeId: uuid.optional(), status: z.enum(['open', 'completed', 'cancelled']).optional(), mine: z.coerce.boolean().optional() });

/**
 * Checklists for people joining or leaving: a template of steps, copied onto a case for one employee. Each step is
 * for the employee, their manager, or a function (HR, IT, admin) that anyone with update rights may tick off.
 */
@Injectable()
export class OnboardingService {
  constructor(private readonly db: Db, private readonly authz: Authz, private readonly scope: ScopeResolver, private readonly audit: AuditService, private readonly outbox: OutboxService) {}

  /** Starts a checklist. Also used by workflows (the "start a checklist" step), which pass no signed-in person. */
  async start(employeeId: string, templateId: string, startDate?: string, by?: string | null): Promise<{ id: string }> {
    const t = (await this.db.q.execute(sql`select id, name, kind, items from onboarding_templates where id = ${templateId}::uuid and deleted_at is null and status = 'active'`)).rows[0] as { id: string; name: string; kind: string; items: OnboardingItemDef[] } | undefined;
    if (!t) throw notFound('Checklist template');
    const e = (await this.db.q.execute(sql`select id, reporting_manager_id from employees where id = ${employeeId}::uuid and deleted_at is null`)).rows[0] as { id: string; reporting_manager_id: string | null } | undefined;
    if (!e) throw notFound('Employee');
    const open = await this.db.q.execute(sql`select 1 from onboarding_cases where employee_id = ${employeeId}::uuid and template_id = ${templateId}::uuid and status = 'open'`);
    if (open.rows.length) throw conflict('already_open', 'This checklist is already running for that person.');
    const start = startDate ?? new Date().toISOString().slice(0, 10);
    const c = (await this.db.q.execute(sql`
      insert into onboarding_cases (tenant_id, employee_id, template_id, template_name, kind, created_by) values (app_tenant_id(), ${employeeId}::uuid, ${templateId}::uuid, ${t.name}, ${t.kind}, ${by ?? null}) returning id`)).rows[0] as { id: string };
    let pos = 0;
    for (const item of t.items) {
      const assignee = item.who === 'employee' ? e.id : item.who === 'manager' ? e.reporting_manager_id : null;
      await this.db.q.execute(sql`
        insert into onboarding_items (tenant_id, case_id, position, title, who, assignee_employee_id, due_date) values (app_tenant_id(), ${c.id}::uuid, ${pos++}, ${item.title}, ${item.who}, ${assignee}::uuid, ${addDays(start, item.dueDays)}::date)`);
    }
    await this.audit.record({ entity: 'onboarding-cases', entityId: c.id, action: 'started', changes: { employeeId: { new: employeeId }, template: { new: t.name } } });
    await this.outbox.emit('onboarding.started', { id: c.id, employeeId, title: t.name, _workflow: true });
    return { id: c.id };
  }

  async startForRequest(raw: unknown) {
    this.authz.require('onboarding.case.create');
    const b = startBody.parse(raw ?? {});
    const pred = this.scope.predicate(this.authz.require('onboarding.case.create'), sql`e.id`);
    const ok = await this.db.q.execute(sql`select 1 from employees e where e.id = ${b.employeeId}::uuid and e.deleted_at is null ${pred ? sql`and ${pred}` : sql``}`);
    if (!ok.rows.length) throw notFound('Employee');
    return this.get((await this.start(b.employeeId, b.templateId, b.startDate, currentAuth().userId)).id);
  }

  async list(raw: Record<string, unknown>) {
    const q = listQuery.parse(raw);
    const scope = this.authz.require('onboarding.case.read');
    const pred = this.scope.predicate(scope, sql`c.employee_id`);
    const r = await this.db.q.execute(sql`
      select c.id, c.employee_id as "employeeId", e.display_name as "employeeName", c.template_name as "templateName", c.kind, c.status, c.created_at as "startedAt", c.completed_at as "completedAt",
             (select count(*)::int from onboarding_items i where i.case_id = c.id) as total, (select count(*)::int from onboarding_items i where i.case_id = c.id and i.done_at is not null) as done
        from onboarding_cases c join employees e on e.id = c.employee_id
       where true ${pred ? sql`and ${pred}` : sql``} ${q.employeeId ? sql`and c.employee_id = ${q.employeeId}::uuid` : sql``} ${q.status ? sql`and c.status = ${q.status}` : sql``}
       order by c.created_at desc limit 100`);
    return { data: r.rows };
  }

  async get(id: string) {
    const scope = this.authz.require('onboarding.case.read');
    const pred = this.scope.predicate(scope, sql`c.employee_id`);
    const c = (await this.db.q.execute(sql`
      select c.id, c.employee_id as "employeeId", e.display_name as "employeeName", c.template_name as "templateName", c.kind, c.status, c.created_at as "startedAt", c.completed_at as "completedAt"
        from onboarding_cases c join employees e on e.id = c.employee_id where c.id = ${id}::uuid ${pred ? sql`and ${pred}` : sql``}`)).rows[0];
    if (!c) throw notFound('Checklist');
    const items = (await this.db.q.execute(sql`
      select i.id, i.position, i.title, i.who, i.assignee_employee_id as "assigneeId", a.display_name as "assigneeName", i.due_date as "dueDate", i.done_at as "doneAt", i.note
        from onboarding_items i left join employees a on a.id = i.assignee_employee_id where i.case_id = ${id}::uuid order by i.position`)).rows;
    return { ...c, items };
  }

  /** Anyone with update rights on checklists, or the person a step is assigned to, may tick it off. */
  private async toggle(itemId: string, done: boolean, note?: string) {
    const auth = currentAuth();
    const it = (await this.db.q.execute(sql`select i.id, i.case_id, i.assignee_employee_id, i.done_at, c.status, c.employee_id from onboarding_items i join onboarding_cases c on c.id = i.case_id where i.id = ${itemId}::uuid for update of i`)).rows[0] as { id: string; case_id: string; assignee_employee_id: string | null; done_at: string | null; status: string; employee_id: string } | undefined;
    if (!it) throw notFound('Step');
    const mine = !!auth.employeeId && it.assignee_employee_id === auth.employeeId;
    if (!mine && !this.authz.has('onboarding.case.update')) throw forbidden('This step is not yours to tick off.', 'not_your_step');
    if (it.status !== 'open') throw conflict('case_closed', `This checklist is ${it.status}.`);
    await this.db.q.execute(sql`update onboarding_items set done_at = ${done ? sql`now()` : sql`null`}, done_by = ${done ? auth.userId : null}, note = ${done ? note ?? null : null} where id = ${itemId}::uuid`);
    const left = (await this.db.q.execute(sql`select count(*)::int as n from onboarding_items where case_id = ${it.case_id}::uuid and done_at is null`)).rows[0] as { n: number };
    if (left.n === 0) {
      await this.db.q.execute(sql`update onboarding_cases set status = 'completed', completed_at = now() where id = ${it.case_id}::uuid`);
      await this.outbox.emit('onboarding.completed', { id: it.case_id, employeeId: it.employee_id, _workflow: true });
    }
    // Reading back through the scope check would hide a step from the person who just ticked it; return the plain state.
    return { id: itemId, done, caseCompleted: left.n === 0 };
  }
  complete(id: string, raw: unknown) { return this.toggle(id, true, doneBody.parse(raw ?? {}).note); }
  reopen(id: string) { return this.toggle(id, false); }

  async cancel(id: string) {
    this.authz.require('onboarding.case.update');
    const r = await this.db.q.execute(sql`update onboarding_cases set status = 'cancelled' where id = ${id}::uuid and status = 'open'`);
    if (!r.rowCount) throw conflict('not_open', 'Only a running checklist can be cancelled.');
    return { ok: true };
  }
}

@RequiresModule('onboarding')
@Controller('onboarding')
class OnboardingController {
  constructor(private readonly svc: OnboardingService) {}
  @Get('cases') list(@Query() q: Record<string, unknown>) { return this.svc.list(q); }
  @Post('cases') @HttpCode(201) start(@Body() b: unknown) { return this.svc.startForRequest(b); }
  @Get('cases/:id') get(@Param() p: unknown) { return this.svc.get(idParam.parse(p).id); }
  @Post('cases/:id/cancel') @HttpCode(200) cancel(@Param() p: unknown) { return this.svc.cancel(idParam.parse(p).id); }
  @Post('items/:id/complete') @HttpCode(200) complete(@Param() p: unknown, @Body() b: unknown) { return this.svc.complete(idParam.parse(p).id, b); }
  @Post('items/:id/reopen') @HttpCode(200) reopen(@Param() p: unknown) { return this.svc.reopen(idParam.parse(p).id); }
}

@Module({ imports: [crudModule(onboardingTemplates)], controllers: [OnboardingController], providers: [OnboardingService], exports: [OnboardingService] })
export class OnboardingModule {}

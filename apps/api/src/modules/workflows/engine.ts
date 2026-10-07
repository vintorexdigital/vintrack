import { createHmac } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { evaluateConditions, renderTemplate, type Condition } from '@trackrex/rules';
import type { WorkflowStep } from '@trackrex/schemas';
import { CONFIG, type Config } from '../../core/config.js';
import { currentStore } from '../../core/context.js';
import { Db } from '../../core/database/db.service.js';
import { conflict, forbidden, notFound } from '../../core/errors.js';
import { OutboxService } from '../../core/outbox.service.js';
import { SequencesService } from '../../core/sequences.service.js';
import type { OutboxHandler } from '../../jobs/outbox-relay.js';
import { MESSAGING, type MessagingProvider } from '../../shared/providers/messaging/messaging.provider.js';
import { deliver } from '../notifications/delivery.js';
import { loadEmployee, resolveRecipients, type EmployeeContext } from './recipients.js';
import { callWebhook, webhookSecret } from './webhook.js';

interface RunRow { id: string; workflow_id: string; workflow_name: string; trigger: string; steps: WorkflowStep[]; payload: Record<string, unknown>; status: string; step_index: number; log: { step: number; type: string; at: string; result: string }[] }

const LINKS: Record<string, string> = { leave: '/leave/requests', regularization: '/attendance/regularizations', expense: '/expenses/claims', task: '/field/tasks', lead: '/sales/leads', punch: '/attendance/register', employee: '/people/employees' };
const linkFor = (trigger: string) => LINKS[trigger.split('.')[0]!] ?? '/';
const MAX_LOG = 40;

/**
 * Runs workflows: when a domain event arrives, every active workflow for that event whose conditions hold gets a
 * run, and its steps execute in order. A run can wait (a delay, or an approval) and carries on later. Events that
 * a workflow itself causes are tagged and never start another workflow, so workflows cannot loop.
 */
@Injectable()
export class WorkflowEngine {
  constructor(
    private readonly db: Db, private readonly outbox: OutboxService, private readonly sequences: SequencesService,
    @Inject(MESSAGING) private readonly messaging: MessagingProvider, @Inject(CONFIG) private readonly cfg: Config,
  ) {}

  /** The outbox handler. Failures of a workflow are recorded on its run; they never fail the event for other handlers. */
  handler(): OutboxHandler {
    return async (e) => {
      if (e.payload._workflow) return;
      const wfs = (await this.db.q.execute(sql`select id, name, conditions, steps from workflows where status = 'active' and trigger = ${e.type} and deleted_at is null`)).rows as { id: string; name: string; conditions: Condition[]; steps: WorkflowStep[] }[];
      if (!wfs.length) return;
      const subjectId = (e.payload.employeeId as string | undefined) ?? (e.type === 'employee.exited' ? (e.payload.id as string | undefined) : undefined);
      const employee = await loadEmployee(this.db, subjectId);
      for (const wf of wfs) {
        if (!evaluateConditions(wf.conditions ?? [], { payload: e.payload, employee }).ok) continue;
        const ins = await this.db.q.execute(sql`
          insert into workflow_runs (tenant_id, workflow_id, workflow_name, event_id, trigger, steps, payload)
          values (${e.tenantId}::uuid, ${wf.id}::uuid, ${wf.name}, ${e.id}, ${e.type}, ${JSON.stringify(wf.steps)}::jsonb, ${JSON.stringify({ ...e.payload, _employeeId: subjectId ?? null })}::jsonb)
          on conflict (tenant_id, workflow_id, event_id) do nothing returning id`);
        const id = (ins.rows[0] as { id: string } | undefined)?.id;
        if (id) await this.advance(id);
      }
    };
  }

  private async note(run: RunRow, step: number, type: string, result: string): Promise<void> {
    run.log = [...run.log, { step, type, at: new Date().toISOString(), result }].slice(-MAX_LOG);
    await this.db.q.execute(sql`update workflow_runs set log = ${JSON.stringify(run.log)}::jsonb, updated_at = now() where id = ${run.id}::uuid`);
  }

  private async finish(run: RunRow, status: 'completed' | 'failed' | 'rejected', error?: string): Promise<void> {
    await this.db.q.execute(sql`update workflow_runs set status = ${status}, error = ${error ?? null}, resume_at = null, updated_at = now() where id = ${run.id}::uuid`);
  }

  /** Executes from the run's current step until it finishes, fails, or has to wait. */
  async advance(runId: string): Promise<void> {
    const run = (await this.db.q.execute(sql`select id, workflow_id, workflow_name, trigger, steps, payload, status, step_index, log from workflow_runs where id = ${runId}::uuid for update`)).rows[0] as RunRow | undefined;
    if (!run || (run.status !== 'running' && run.status !== 'waiting')) return;
    await this.db.q.execute(sql`update workflow_runs set status = 'running', resume_at = null where id = ${runId}::uuid`);
    const subject = await loadEmployee(this.db, (run.payload._employeeId as string | null) ?? null);
    const ctx = { payload: run.payload, employee: subject, workflow: { name: run.workflow_name } };
    for (let i = run.step_index; i < run.steps.length; i++) {
      const step = run.steps[i]!;
      try {
        const wait = await this.exec(run, i, step, ctx, subject);
        if (wait) return;
      } catch (e) {
        const msg = (e as Error).message.slice(0, 300);
        await this.note(run, i, step.type, `failed: ${msg}`);
        await this.finish(run, 'failed', msg);
        return;
      }
    }
    await this.finish(run, 'completed');
  }

  /** Returns true when the run must stop here and wait. */
  private async exec(run: RunRow, i: number, step: WorkflowStep, ctx: { payload: Record<string, unknown>; employee: EmployeeContext | null; workflow: { name: string } }, subject: EmployeeContext | null): Promise<boolean> {
    const at = (n: number) => this.db.q.execute(sql`update workflow_runs set step_index = ${n}, updated_at = now() where id = ${run.id}::uuid`);
    switch (step.type) {
      case 'notify': {
        const { userIds } = await resolveRecipients(this.db, step.to, subject);
        const title = renderTemplate(step.title, ctx);
        const body = step.body ? renderTemplate(step.body, ctx) : null;
        const link = linkFor(run.trigger);
        for (const userId of userIds) await this.db.q.execute(sql`insert into notifications (tenant_id, user_id, type, title, body, link) values (app_tenant_id(), ${userId}::uuid, 'workflow.notice', ${title}, ${body}, ${link})`);
        await deliver(this.db, this.messaging, this.cfg.WEB_ORIGIN, { userIds, type: 'workflow.notice', title, body, link }).catch(() => undefined);
        await this.note(run, i, 'notify', `told ${userIds.length} ${userIds.length === 1 ? 'person' : 'people'}`);
        await at(i + 1);
        return false;
      }
      case 'create_task': {
        const { employeeIds } = await resolveRecipients(this.db, step.assignTo, subject);
        const assignee = employeeIds[0];
        if (!assignee) throw new Error('There is nobody to assign the task to.');
        const title = renderTemplate(step.title, ctx);
        const code = await this.sequences.next('tasks', 'TSK');
        const task = (await this.db.q.execute(sql`
          insert into tasks (tenant_id, code, title, description, task_type, assignee_id, due_at, priority, status)
          values (app_tenant_id(), ${code}, ${title}, ${step.description ? renderTemplate(step.description, ctx) : null}, 'other', ${assignee}::uuid,
                  ${step.dueInHours ? new Date(Date.now() + step.dueInHours * 3_600_000).toISOString() : null}::timestamptz, ${step.priority}, 'open') returning id`)).rows[0] as { id: string };
        await this.outbox.emit('task.assigned', { id: task.id, employeeId: assignee, title, _workflow: true });
        await this.note(run, i, 'create_task', `created ${code}`);
        await at(i + 1);
        return false;
      }
      case 'webhook': {
        const body = JSON.stringify({ event: run.trigger, workflow: run.workflow_name, runId: run.id, at: new Date().toISOString(), ...(step.includePayload ? { payload: { ...run.payload, _employeeId: undefined }, employee: ctx.employee } : {}) });
        const secret = webhookSecret(this.cfg.JWT_COMPANY_SECRET, currentStore().tenantId!);
        const r = await callWebhook(step.url, body, { 'x-trackrex-event': run.trigger, 'x-trackrex-delivery': run.id, 'x-trackrex-signature': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}` }, { allowPrivate: this.cfg.WORKFLOW_WEBHOOK_ALLOW_PRIVATE });
        await this.note(run, i, 'webhook', `called ${new URL(step.url).host} (${r.status})`);
        await at(i + 1);
        return false;
      }
      case 'delay': {
        await this.db.q.execute(sql`update workflow_runs set status = 'waiting', step_index = ${i + 1}, resume_at = now() + make_interval(mins => ${step.minutes}), updated_at = now() where id = ${run.id}::uuid`);
        await this.note(run, i, 'delay', `waiting ${step.minutes} min`);
        return true;
      }
      case 'approval': {
        const { userIds } = await resolveRecipients(this.db, step.approver, subject);
        if (!userIds.length) throw new Error('There is nobody to ask for approval.');
        const title = renderTemplate(step.title, ctx);
        const body = step.body ? renderTemplate(step.body, ctx) : null;
        await this.db.q.execute(sql`insert into workflow_approvals (tenant_id, run_id, step_index, title, body, approver_user_ids) values (app_tenant_id(), ${run.id}::uuid, ${i}, ${title}, ${body}, ${sql.param(userIds)}::uuid[])`);
        for (const userId of userIds) await this.db.q.execute(sql`insert into notifications (tenant_id, user_id, type, title, body, link) values (app_tenant_id(), ${userId}::uuid, 'workflow.approval', ${`Approval needed: ${title}`}, ${body}, '/approvals')`);
        await deliver(this.db, this.messaging, this.cfg.WEB_ORIGIN, { userIds, type: 'workflow.approval', title: `Approval needed: ${title}`, body, link: '/approvals' }).catch(() => undefined);
        await this.db.q.execute(sql`update workflow_runs set status = 'waiting', step_index = ${i}, resume_at = null, updated_at = now() where id = ${run.id}::uuid`);
        await this.note(run, i, 'approval', `asked ${userIds.length} ${userIds.length === 1 ? 'person' : 'people'}`);
        return true;
      }
    }
  }

  /** Runs that were waiting on a delay and are now due. Returns how many were resumed. */
  async resumeDue(): Promise<number> {
    const due = (await this.db.q.execute(sql`select id from workflow_runs where status = 'waiting' and resume_at is not null and resume_at <= now() order by resume_at limit 100 for update skip locked`)).rows as { id: string }[];
    for (const r of due) await this.advance(r.id);
    return due.length;
  }

  /** Someone listed on an approval step decides. Approving carries the run on; rejecting ends it. */
  async decide(approvalId: string, userId: string, decision: 'approved' | 'rejected', comment?: string): Promise<{ status: string }> {
    const a = (await this.db.q.execute(sql`select id, run_id, step_index, status, approver_user_ids from workflow_approvals where id = ${approvalId}::uuid for update`)).rows[0] as { id: string; run_id: string; step_index: number; status: string; approver_user_ids: string[] } | undefined;
    if (!a || !a.approver_user_ids.includes(userId)) throw a ? forbidden('This approval was not sent to you.', 'not_your_approval') : notFound('Approval');
    if (a.status !== 'pending') throw conflict('already_decided', `This was already ${a.status}.`);
    await this.db.q.execute(sql`update workflow_approvals set status = ${decision}, decided_by = ${userId}::uuid, decided_at = now(), comment = ${comment ?? null} where id = ${approvalId}::uuid`);
    const run = (await this.db.q.execute(sql`select id, workflow_name, trigger, steps, payload, status, step_index, log from workflow_runs where id = ${a.run_id}::uuid`)).rows[0] as unknown as RunRow;
    await this.note(run, a.step_index, 'approval', `${decision}${comment ? `: ${comment}` : ''}`);
    if (decision === 'rejected') { await this.finish(run, 'rejected', comment ?? 'Rejected'); return { status: 'rejected' }; }
    await this.db.q.execute(sql`update workflow_runs set step_index = ${a.step_index + 1} where id = ${a.run_id}::uuid`);
    await this.advance(a.run_id);
    return { status: 'approved' };
  }
}

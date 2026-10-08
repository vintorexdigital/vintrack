import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { attachFormBody, saveAnswersBody, validateAnswers, type Answers, type Question } from '@trackrex/schemas';
import { currentAuth, currentStore } from '../../core/context.js';
import { conflict, notFound, unprocessable } from '../../core/errors.js';
import { Db } from '../../core/database/db.service.js';
import { Authz, ScopeResolver } from '../../core/rbac.service.js';
import { TASKS_SERVICE, TasksService } from './tasks.service.js';

export interface TaskFormView {
  id: string;
  taskId: string;
  templateName: string;
  questions: Question[];
  requiredToComplete: boolean;
  answers: Answers;
  status: 'draft' | 'submitted';
  submittedAt: string | null;
}

const columns = sql`id, task_id as "taskId", template_name as "templateName", questions, required_to_complete as "requiredToComplete", answers, status, submitted_at as "submittedAt"`;

/* Templates are plain CRUD (see the form-templates kit). Editing one never changes forms already attached to tasks: they hold their own copy. */

/** Attaches the first active template for a new task's type, if there is one. Called when a task is created. */
export async function attachByType(db: Db, task: { id: string; taskType: string }): Promise<void> {
  await db.q.execute(sql`
    insert into task_forms (tenant_id, task_id, template_id, template_name, questions, required_to_complete)
    select app_tenant_id(), ${task.id}::uuid, t.id, t.name, t.questions, coalesce(t.required_to_complete, true)
      from form_templates t where t.deleted_at is null and t.status = 'active' and ${task.taskType} = any(t.task_types) order by t.created_at limit 1
    on conflict do nothing`);
}

/** Throws when the task has a required form that has not been submitted. */
export async function assertFormDone(db: Db, taskId: string): Promise<void> {
  const r = (await db.q.execute(sql`select template_name, status from task_forms where task_id = ${taskId}::uuid and required_to_complete`)).rows[0] as { template_name: string; status: string } | undefined;
  if (r && r.status !== 'submitted') throw unprocessable(`Fill in and submit “${r.template_name}” before completing this task.`, undefined, 'form_required');
}

@Injectable()
export class TaskFormsService {
  constructor(private readonly db: Db, private readonly authz: Authz, private readonly scope: ScopeResolver, @Inject(TASKS_SERVICE) private readonly tasks: TasksService) {}

  private async current(taskId: string): Promise<TaskFormView | null> {
    return ((await this.db.q.execute(sql`select ${columns} from task_forms where task_id = ${taskId}::uuid`)).rows[0] as TaskFormView | undefined) ?? null;
  }

  /** Visible to anyone who can see the task. */
  async get(taskId: string): Promise<{ form: TaskFormView | null }> {
    await this.tasks.get(taskId);
    return { form: await this.current(taskId) };
  }

  async attach(taskId: string, rawBody: unknown): Promise<{ form: TaskFormView }> {
    this.authz.require('field.task.update');
    const b = attachFormBody.parse(rawBody ?? {});
    const task = await this.tasks.get(taskId);
    if (task.status === 'completed' || task.status === 'cancelled') throw conflict('task_closed', 'A completed or cancelled task cannot take a form.');
    const existing = await this.current(taskId);
    if (existing && Object.keys(existing.answers).length > 0) throw conflict('form_has_answers', 'This task’s form already has answers.');
    const t = (await this.db.q.execute(sql`select id, name, questions, required_to_complete from form_templates where id = ${b.templateId}::uuid and deleted_at is null and status = 'active'`)).rows[0] as { id: string; name: string; questions: unknown; required_to_complete: boolean } | undefined;
    if (!t) throw notFound('Task form');
    await this.db.q.execute(sql`
      insert into task_forms (tenant_id, task_id, template_id, template_name, questions, required_to_complete, attached_by)
      values (app_tenant_id(), ${taskId}::uuid, ${t.id}::uuid, ${t.name}, ${JSON.stringify(t.questions)}::jsonb, ${t.required_to_complete ?? true}, ${currentAuth().userId}::uuid)
      on conflict (tenant_id, task_id) do update set template_id = excluded.template_id, template_name = excluded.template_name, questions = excluded.questions,
        required_to_complete = excluded.required_to_complete, attached_by = excluded.attached_by, status = 'draft', updated_at = now()`);
    return { form: (await this.current(taskId))! };
  }

  async detach(taskId: string): Promise<{ ok: true }> {
    this.authz.require('field.task.update');
    await this.tasks.get(taskId);
    const existing = await this.current(taskId);
    if (existing && (Object.keys(existing.answers).length > 0 || existing.status === 'submitted')) throw conflict('form_has_answers', 'This task’s form already has answers.');
    await this.db.q.execute(sql`delete from task_forms where task_id = ${taskId}::uuid`);
    return { ok: true };
  }

  /** The assignee fills the form in. A draft keeps what they have so far; submitting checks everything. */
  async save(taskId: string, rawBody: unknown): Promise<{ form: TaskFormView; errors: Record<string, string> }> {
    const b = saveAnswersBody.parse(rawBody ?? {});
    const scope = this.authz.require('field.task.work');
    const pred = this.scope.predicate(scope, sql`t.assignee_id`);
    const t = (await this.db.q.execute(sql`select t.status from tasks t where t.id = ${taskId}::uuid and t.deleted_at is null ${pred ? sql`and ${pred}` : sql``}`)).rows[0] as { status: string } | undefined;
    if (!t) throw notFound('Task');
    if (t.status === 'completed' || t.status === 'cancelled') throw conflict('task_closed', 'This task is already closed.');
    const form = await this.current(taskId);
    if (!form) throw notFound('Task form');
    const check = validateAnswers(form.questions, b.answers, { final: b.submit });
    // Photos must be the caller's own uploads for this company.
    const own = `forms/${currentStore().tenantId}/${currentAuth().userId}/`;
    for (const q of form.questions) if (q.type === 'photo' && typeof check.answers[q.id] === 'string' && !(check.answers[q.id] as string).startsWith(own)) check.errors[q.id] = 'Attach a photo of your own';
    if (Object.keys(check.errors).length) {
      if (b.submit) throw unprocessable('Some answers need attention.', Object.entries(check.errors).map(([path, message]) => ({ path, message })), 'invalid_answers');
      for (const k of Object.keys(check.errors)) delete check.answers[k];
    }
    await this.db.q.execute(sql`
      update task_forms set answers = ${JSON.stringify(check.answers)}::jsonb, updated_at = now(),
        status = ${b.submit ? 'submitted' : 'draft'}, submitted_at = ${b.submit ? sql`now()` : sql`null`}, submitted_by = ${b.submit ? currentAuth().userId : null}
       where task_id = ${taskId}::uuid`);
    return { form: (await this.current(taskId))!, errors: check.errors };
  }
}

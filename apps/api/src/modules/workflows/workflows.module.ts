import { RequiresModule } from '../../core/auth/decorators.js';
import { Body, Controller, Get, HttpCode, Inject, Module, Param, Post, Query } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { approvalDecisionBody, idParam, uuid, workflows } from '@trackrex/schemas';
import { ApprovalChain, type ApprovalSubject } from '../../core/approval-chain.js';
import { CONFIG, type Config } from '../../core/config.js';
import { currentAuth, currentStore } from '../../core/context.js';
import { Db } from '../../core/database/db.service.js';
import { notFound } from '../../core/errors.js';
import { Authz, ScopeResolver } from '../../core/rbac.service.js';
import { crudModule } from '../../shared/crud/crud.factory.js';
import { WorkflowEngine } from './engine.js';
import { webhookSecret } from './webhook.js';

const runsQuery = z.object({ workflowId: uuid.optional(), status: z.enum(['running', 'waiting', 'completed', 'failed', 'rejected']).optional(), limit: z.coerce.number().int().min(1).max(100).default(30) });
const subjectParams = z.object({ subject: z.enum(['leave', 'regularization', 'expense']), id: uuid });
const READ: Record<ApprovalSubject, { permission: string; table: string }> = {
  leave: { permission: 'leave.request.read', table: 'leave_requests' },
  regularization: { permission: 'attendance.regularization.read', table: 'regularizations' },
  expense: { permission: 'expenses.claim.read', table: 'expenses' },
};

@RequiresModule('workflows')
@Controller('automation')
class AutomationController {
  constructor(private readonly db: Db, private readonly authz: Authz, private readonly engine: WorkflowEngine, @Inject(CONFIG) private readonly cfg: Config) {}

  /** What happened each time a workflow fired. */
  @Get('runs')
  async runs(@Query() raw: unknown) {
    this.authz.require('automation.run.read');
    const q = runsQuery.parse(raw);
    const r = await this.db.q.execute(sql`
      select id, workflow_id as "workflowId", workflow_name as "workflowName", trigger, status, step_index as "stepIndex", resume_at as "resumeAt", error, log, created_at as "createdAt"
        from workflow_runs where true ${q.workflowId ? sql`and workflow_id = ${q.workflowId}::uuid` : sql``} ${q.status ? sql`and status = ${q.status}` : sql``}
       order by created_at desc limit ${q.limit}`);
    return { data: r.rows };
  }

  /** The key a receiver uses to check the `x-trackrex-signature` header on webhook calls. */
  @Get('webhook-secret')
  secret() {
    this.authz.require('automation.workflow.update');
    return { secret: webhookSecret(this.cfg.JWT_COMPANY_SECRET, currentStore().tenantId!), header: 'x-trackrex-signature', algorithm: 'HMAC-SHA256 of the raw request body, hex, prefixed sha256=' };
  }

  /** Approvals waiting for me (or, with ?status=all, ones I have decided). Everyone may call this: it only ever shows their own. */
  @Get('approvals')
  async approvals(@Query('status') status?: string) {
    const me = currentAuth().userId;
    const r = await this.db.q.execute(sql`
      select a.id, a.title, a.body, a.status, a.created_at as "createdAt", a.decided_at as "decidedAt", a.comment, w.workflow_name as "workflowName", w.trigger
        from workflow_approvals a join workflow_runs w on w.id = a.run_id
       where ${me}::uuid = any(a.approver_user_ids) ${status === 'all' ? sql`` : sql`and a.status = 'pending'`} order by a.created_at desc limit 100`);
    return { data: r.rows };
  }

  @Post('approvals/:id/decide') @HttpCode(200)
  decide(@Param() p: unknown, @Body() body: unknown) {
    const b = approvalDecisionBody.parse(body ?? {});
    return this.engine.decide(idParam.parse(p).id, currentAuth().userId, b.decision, b.comment);
  }
}

/** Who has approved a leave request, regularization or expense claim, and who is next. */
@Controller('approvals')
class ApprovalTrailController {
  constructor(private readonly db: Db, private readonly authz: Authz, private readonly scope: ScopeResolver, private readonly chain: ApprovalChain) {}

  @Get(':subject/:id')
  async trail(@Param() raw: unknown) {
    const p = subjectParams.parse(raw);
    const def = READ[p.subject];
    const pred = this.scope.predicate(this.authz.require(def.permission), sql`e.id`);
    const row = (await this.db.q.execute(sql`select s.employee_id from ${sql.identifier(def.table)} s join employees e on e.id = s.employee_id where s.id = ${p.id}::uuid ${pred ? sql`and ${pred}` : sql``}`)).rows[0] as { employee_id: string } | undefined;
    if (!row) throw notFound('Request');
    return this.chain.trail(p.subject, p.id, row.employee_id);
  }
}

@Module({
  imports: [crudModule(workflows)],
  controllers: [AutomationController, ApprovalTrailController],
  providers: [WorkflowEngine],
  exports: [WorkflowEngine],
})
export class WorkflowsModule {}

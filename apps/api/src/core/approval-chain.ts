import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { currentAuth } from './context.js';
import { Db } from './database/db.service.js';
import { forbidden } from './errors.js';
import { OutboxService } from './outbox.service.js';
import { SettingsService } from './settings.service.js';

export type ApprovalSubject = 'leave' | 'regularization' | 'expense';
const SETTING: Record<ApprovalSubject, string> = { leave: 'approvals.leave_levels', regularization: 'approvals.regularization_levels', expense: 'approvals.expense_levels' };

export interface ApprovalOutcome {
  /** True when this decision finishes the request (the last level approved, or anyone rejected). */
  final: boolean;
  level: number;
  levels: number;
}

/**
 * Multi-level approval for leave, regularizations and expense claims. A company sets how many levels up the
 * reporting line must approve (1 keeps today's behaviour: any approver in scope decides). With more levels, the
 * direct manager decides first, then their manager, and so on; each level is recorded, the next approver is told,
 * and only the last approval finishes the request. Anyone can reject at their level. People with company-wide
 * approval rights, and owners, may step in at any level; that is recorded as an override.
 */
@Injectable()
export class ApprovalChain {
  constructor(private readonly db: Db, private readonly settings: SettingsService, private readonly outbox: OutboxService) {}

  /** The people above an employee, nearest first. */
  async ancestors(employeeId: string, max = 3): Promise<{ id: string; name: string }[]> {
    const r = await this.db.q.execute(sql`
      with recursive up as (
        select m.id, m.display_name, m.reporting_manager_id, 1 as depth from employees e join employees m on m.id = e.reporting_manager_id where e.id = ${employeeId}::uuid and m.deleted_at is null
        union all
        select m.id, m.display_name, m.reporting_manager_id, up.depth + 1 from up join employees m on m.id = up.reporting_manager_id where m.deleted_at is null and up.depth < ${max}
      ) select id, display_name as name from up order by depth`);
    return r.rows as { id: string; name: string }[];
  }

  /** Levels this request needs. Decided once, when the first decision is made, so changing the setting never changes requests already in flight. */
  async levelsRequired(subject: ApprovalSubject, subjectId: string, employeeId: string, amount?: number): Promise<number> {
    const existing = (await this.db.q.execute(sql`select levels_required as n from approval_progress where subject_type = ${subject} and subject_id = ${subjectId}::uuid`)).rows[0] as { n: number } | undefined;
    if (existing) return existing.n;
    let want = await this.settings.get<number>(SETTING[subject], 1);
    if (subject === 'expense') {
      const from = await this.settings.get<number>('approvals.expense_extra_level_from', 0);
      if (from > 0 && (amount ?? 0) >= from) want += 1;
    }
    const available = (await this.ancestors(employeeId, 3)).length;
    const levels = Math.max(1, Math.min(3, want, available || 1));
    await this.db.q.execute(sql`insert into approval_progress (tenant_id, subject_type, subject_id, levels_required) values (app_tenant_id(), ${subject}, ${subjectId}::uuid, ${levels}) on conflict do nothing`);
    return levels;
  }

  async approve(a: { subject: ApprovalSubject; subjectId: string; employeeId: string; amount?: number; comment?: string | undefined; scope: string }): Promise<ApprovalOutcome> {
    const levels = await this.levelsRequired(a.subject, a.subjectId, a.employeeId, a.amount);
    if (levels === 1) return { final: true, level: 1, levels };
    const auth = currentAuth();
    const done = (await this.db.q.execute(sql`select count(*)::int as n from approval_steps where subject_type = ${a.subject} and subject_id = ${a.subjectId}::uuid and decision = 'approved'`)).rows[0] as { n: number };
    const level = done.n + 1;
    const chain = await this.ancestors(a.employeeId, levels);
    const expected = chain[level - 1];
    const isExpected = !!auth.employeeId && expected?.id === auth.employeeId;
    const override = !isExpected && (auth.isOwner || a.scope === 'all');
    if (!isExpected && !override) throw forbidden(`This request is waiting for ${expected?.name ?? 'the next approver'} (level ${level} of ${levels}).`, 'not_your_level');
    await this.db.q.execute(sql`
      insert into approval_steps (tenant_id, subject_type, subject_id, level, decision, decided_by_user, decided_by_employee, override, comment)
      values (app_tenant_id(), ${a.subject}, ${a.subjectId}::uuid, ${level}, 'approved', ${auth.userId}::uuid, ${auth.employeeId ?? null}, ${override}, ${a.comment ?? null})`);
    if (level >= levels) return { final: true, level, levels };
    const next = chain[level];
    await this.outbox.emit('approval.advanced', { subjectType: a.subject, subjectId: a.subjectId, employeeId: a.employeeId, approverEmployeeId: next?.id ?? null, level: level + 1, levels });
    return { final: false, level, levels };
  }

  /** Any approver in scope can reject, at whatever level the request has reached. */
  async reject(a: { subject: ApprovalSubject; subjectId: string; employeeId: string; comment?: string | undefined }): Promise<void> {
    const levels = await this.levelsRequired(a.subject, a.subjectId, a.employeeId);
    if (levels === 1) return;
    const auth = currentAuth();
    const done = (await this.db.q.execute(sql`select count(*)::int as n from approval_steps where subject_type = ${a.subject} and subject_id = ${a.subjectId}::uuid and decision = 'approved'`)).rows[0] as { n: number };
    await this.db.q.execute(sql`
      insert into approval_steps (tenant_id, subject_type, subject_id, level, decision, decided_by_user, decided_by_employee, comment)
      values (app_tenant_id(), ${a.subject}, ${a.subjectId}::uuid, ${done.n + 1}, 'rejected', ${auth.userId}::uuid, ${auth.employeeId ?? null}, ${a.comment ?? null})
      on conflict do nothing`);
  }

  /** Who has decided, and who is next. Empty `steps` and `levels: 1` means the request uses the single-approver path. */
  async trail(subject: ApprovalSubject, subjectId: string, employeeId: string): Promise<{ levels: number; steps: { level: number; decision: string; by: string | null; override: boolean; comment: string | null; at: string }[]; waitingFor: { level: number; name: string } | null }> {
    const levels = await this.levelsRequired(subject, subjectId, employeeId);
    const steps = (await this.db.q.execute(sql`
      select s.level, s.decision, e.display_name as by, s.override, s.comment, s.decided_at as at
        from approval_steps s left join employees e on e.id = s.decided_by_employee
       where s.subject_type = ${subject} and s.subject_id = ${subjectId}::uuid order by s.level`)).rows as { level: number; decision: string; by: string | null; override: boolean; comment: string | null; at: string }[];
    const finished = steps.some((s) => s.decision === 'rejected') || steps.filter((s) => s.decision === 'approved').length >= levels;
    const next = finished ? null : (await this.ancestors(employeeId, levels))[steps.length];
    return { levels, steps, waitingFor: next ? { level: steps.length + 1, name: next.name } : null };
  }
}

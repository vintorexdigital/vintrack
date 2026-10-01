import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { policyRulesSchema, isoDate } from '@trackrex/schemas';
import { z } from 'zod';
import { currentAuth, currentStore } from '../../core/context.js';
import { conflict, unprocessable } from '../../core/errors.js';
import { Db } from '../../core/database/db.service.js';
import { CrudService, type CrudDeps } from '../../shared/crud/crud.service.js';
import type { Row } from '../../shared/crud/crud.repository.js';
import type { PolicyRule } from '@trackrex/rules';

export const POLICIES_SERVICE = 'CRUD_SERVICE:attendance-policies';

@Injectable()
export class PoliciesService extends CrudService {
  constructor(@Inject('CRUD_DEPS') deps: CrudDeps, private readonly pg: Db) {
    super(deps);
  }

  protected override async beforeDelete(row: Row): Promise<void> {
    if (row.state === 'published') throw conflict('policy_published', 'Published policies cannot be deleted. Create a newer version to replace it.');
  }

  protected override async beforeCreate(input: Record<string, unknown>) {
    return { ...input, state: 'draft', revision: 1 };
  }

  /** Published versions are immutable: edit by creating a new version with its own start date. */
  override async update(id: string, body: unknown): Promise<Row> {
    const existing = await this.get(id);
    if (existing.state === 'published') throw conflict('policy_published', 'Published policies cannot be edited. Create a new version instead.');
    this.authz.require(this.perms.update);
    const { version, ...fields } = (body ?? {}) as Record<string, unknown>;
    const patch = this.kit.updateSchema.parse(fields) as Record<string, unknown>;
    const after = await this.repo.update(id, { ...patch, updatedBy: currentAuth().userId }, version as number | undefined);
    if (!after) throw conflict('version_conflict', 'This policy was changed by someone else. Reload and try again.');
    await this.audit.record({ entity: 'attendance-policies', entityId: id, action: 'updated', changes: Object.fromEntries(Object.keys(patch).map((k) => [k, { old: existing[k] ?? null, new: after[k] ?? null }])) });
    return after;
  }

  async publish(id: string): Promise<Row> {
    this.authz.require('attendance.policy.publish');
    const p = await this.get(id);
    if (p.state === 'published') throw conflict('already_published', 'This policy is already published.');
    const rules = policyRulesSchema.safeParse(p.rules ?? []);
    if (!rules.success) throw unprocessable('The policy has invalid rules.', rules.error.issues.map((i) => ({ path: `rules.${i.path.join('.')}`, message: i.message })));
    if (!rules.data.length) throw unprocessable('Add at least one rule before publishing.', [{ path: 'rules', message: 'Add at least one rule' }]);
    const after = await this.repo.update(id, { state: 'published', updatedBy: currentAuth().userId });
    await this.audit.record({ entity: 'attendance-policies', entityId: id, action: 'published', changes: { state: { old: 'draft', new: 'published' } } });
    await this.outbox.emit('attendance.policy_published', { id, startDate: p.startDate });
    return after!;
  }

  async newVersion(id: string, body: unknown): Promise<Row> {
    this.authz.require(this.perms.create);
    const b = z.object({ startDate: isoDate }).parse(body);
    const p = await this.get(id);
    if (p.state !== 'published') throw conflict('not_published', 'Only published policies need a new version. Edit the draft directly.');
    if (b.startDate <= String(p.startDate)) throw unprocessable('The new version must start after the current one.', [{ path: 'startDate', message: `Choose a date after ${p.startDate}` }]);
    const row = await this.repo.insert({
      tenantId: currentStore().tenantId, name: p.name, startDate: b.startDate, description: p.description, shiftIds: p.shiftIds, rules: p.rules,
      state: 'draft', revision: Number(p.revision) + 1, previousId: p.id, createdBy: currentAuth().userId, updatedBy: currentAuth().userId,
    } as never);
    await this.audit.record({ entity: 'attendance-policies', entityId: row.id, action: 'created', changes: { previousId: { new: p.id }, revision: { new: row.revision } } });
    return row;
  }

  /** The published policy that applies to a shift on a date: latest start date on or before it. */
  async effectiveFor(shiftId: string, date: string): Promise<{ id: string; rules: PolicyRule[] } | null> {
    const res = await this.pg.q.execute(sql`
      select id, rules from attendance_policies
      where deleted_at is null and state = 'published' and start_date <= ${date}::date
        and (shift_ids is null or shift_ids = '{}' or ${shiftId}::uuid = any(shift_ids))
      order by start_date desc, revision desc limit 1`);
    const row = res.rows[0] as { id: string; rules: PolicyRule[] } | undefined;
    return row ? { id: row.id, rules: row.rules ?? [] } : null;
  }
}

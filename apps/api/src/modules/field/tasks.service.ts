import { Inject, Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { haversineMeters } from '@trackrex/rules';
import { taskCancelBody, taskCheckInBody, taskCompleteBody } from '@trackrex/schemas';
import { currentAuth } from '../../core/context.js';
import { conflict, forbidden, notFound, unprocessable } from '../../core/errors.js';
import { Db } from '../../core/database/db.service.js';
import { SettingsService } from '../../core/settings.service.js';
import { CrudService, type CrudDeps } from '../../shared/crud/crud.service.js';
import type { Row } from '../../shared/crud/crud.repository.js';

export const TASKS_SERVICE = 'CRUD_SERVICE:tasks';
const WORKFLOW_FIELDS = ['status', 'startedAt', 'completedAt', 'checkInLatitude', 'checkInLongitude', 'checkOutLatitude', 'checkOutLongitude', 'checkInDistanceM', 'outcome'];

type Mode = 'warn' | 'block' | 'off';

@Injectable()
export class TasksService extends CrudService {
  constructor(@Inject('CRUD_DEPS') deps: CrudDeps, private readonly pg: Db, private readonly settings: SettingsService) {
    super(deps);
  }

  private async assertAssigneeInScope(employeeId: string): Promise<void> {
    const auth = currentAuth();
    if (employeeId === auth.employeeId) return;
    const pred = this.scope.predicate(this.authz.require(this.perms.create), sql`e.id`);
    const ok = await this.pg.q.execute(sql`select 1 from employees e where e.id = ${employeeId}::uuid and e.deleted_at is null and e.status = 'active' ${pred ? sql`and ${pred}` : sql``}`);
    if (!ok.rows.length) throw forbidden('You can only assign tasks to people in your scope.', 'out_of_scope');
  }

  protected override async beforeCreate(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    await this.assertAssigneeInScope(String(input.assigneeId));
    const next = { ...input };
    for (const k of WORKFLOW_FIELDS) delete next[k];
    return { ...next, status: 'open' };
  }

  protected override async beforeUpdate(existing: Row, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (existing.status === 'completed' || existing.status === 'cancelled') throw conflict('task_closed', 'A completed or cancelled task cannot be edited.');
    if (patch.assigneeId && patch.assigneeId !== existing.assigneeId) await this.assertAssigneeInScope(String(patch.assigneeId));
    return patch;
  }

  protected override async afterCreate(row: Row): Promise<void> {
    await this.outbox.emit('task.assigned', { id: row.id, employeeId: row.assigneeId, title: row.title });
  }

  /** The caller's own task (or one in their work scope): the working actions need `field.task.work`, not edit rights. */
  private async mine(id: string): Promise<Row> {
    const scope = this.authz.require('field.task.work');
    const pred: SQL | undefined = this.scope.predicate(scope, this.repo.col('assigneeId') as unknown as SQL);
    const row = await this.repo.get(id, pred);
    if (!row) throw notFound('Task');
    return row;
  }

  private async customerPoint(customerId: string | null | undefined): Promise<{ lat: number; lng: number } | null> {
    if (!customerId) return null;
    const r = await this.pg.q.execute(sql`select latitude, longitude from customers where id = ${customerId}::uuid`);
    const c = r.rows[0] as { latitude: number | null; longitude: number | null } | undefined;
    return c && c.latitude != null && c.longitude != null ? { lat: c.latitude, lng: c.longitude } : null;
  }

  private async distanceCheck(row: Row, lat: number | undefined, lng: number | undefined, modeKey: string): Promise<{ distance: number | null; warning?: string }> {
    const mode = await this.settings.get<Mode>(modeKey, 'warn');
    if (mode === 'off' || lat === undefined || lng === undefined) return { distance: null };
    const target = await this.customerPoint(row.customerId as string | null);
    if (!target) return { distance: null };
    const distance = Math.round(haversineMeters({ lat, lng }, target));
    const limit = await this.settings.get<number>('geo.checkin_distance', 200);
    if (distance <= limit) return { distance };
    if (mode === 'block') throw unprocessable(`You are ${distance} m from the customer; move within ${limit} m to continue.`, undefined, 'too_far_from_customer');
    return { distance, warning: 'far_from_customer' };
  }

  async checkIn(id: string, rawBody: unknown): Promise<Row & { warnings: string[] }> {
    const body = taskCheckInBody.parse(rawBody ?? {});
    const row = await this.mine(id);
    if (row.status !== 'open') throw conflict('task_not_open', row.status === 'in_progress' ? 'This task is already started.' : 'This task is closed.');
    const check = await this.distanceCheck(row, body.latitude, body.longitude, 'geo.checkin_mode');
    const after = await this.repo.update(id, {
      status: 'in_progress', startedAt: body.at ?? new Date().toISOString(),
      checkInLatitude: body.latitude ?? null, checkInLongitude: body.longitude ?? null, checkInDistanceM: check.distance, updatedBy: currentAuth().userId,
    });
    await this.audit.record({ entity: 'tasks', entityId: id, action: 'checked_in', changes: { status: { old: 'open', new: 'in_progress' } } });
    await this.outbox.emit('task.started', { id, employeeId: row.assigneeId, title: row.title, distance: check.distance });
    return { ...after!, warnings: check.warning ? [check.warning] : [] };
  }

  async complete(id: string, rawBody: unknown): Promise<Row & { warnings: string[] }> {
    const body = taskCompleteBody.parse(rawBody ?? {});
    const row = await this.mine(id);
    if (row.status === 'completed' || row.status === 'cancelled') throw conflict('task_closed', 'This task is already closed.');
    const check = await this.distanceCheck(row, body.latitude, body.longitude, 'geo.task_complete_mode');
    const after = await this.repo.update(id, {
      status: 'completed', completedAt: body.at ?? new Date().toISOString(), outcome: body.outcome,
      checkOutLatitude: body.latitude ?? null, checkOutLongitude: body.longitude ?? null, updatedBy: currentAuth().userId,
    });
    await this.audit.record({ entity: 'tasks', entityId: id, action: 'completed', changes: { status: { old: row.status, new: 'completed' } } });
    await this.outbox.emit('task.completed', { id, employeeId: row.assigneeId, title: row.title });
    return { ...after!, warnings: check.warning ? [check.warning] : [] };
  }

  /** Managers cancel through update rights; the assignee can also drop a task they cannot do, with a reason. */
  async cancel(id: string, rawBody: unknown): Promise<Row> {
    const body = taskCancelBody.parse(rawBody ?? {});
    let row: Row | undefined;
    try { row = await this.get(id); this.authz.require(this.perms.update); } catch { row = await this.mine(id); }
    if (row.status === 'completed' || row.status === 'cancelled') throw conflict('task_closed', 'This task is already closed.');
    const after = await this.repo.update(id, { status: 'cancelled', outcome: body.reason, updatedBy: currentAuth().userId });
    await this.audit.record({ entity: 'tasks', entityId: id, action: 'cancelled', changes: { reason: { old: null, new: body.reason } } });
    await this.outbox.emit('task.cancelled', { id, employeeId: row.assigneeId, title: row.title });
    return after!;
  }

  /** Counts for the Today strip: what is open, overdue and done today for the viewer's scope. */
  async summary(): Promise<{ open: number; inProgress: number; overdue: number; completedToday: number }> {
    const pred = this.scopePredicate(this.perms.read);
    const r = await this.pg.q.execute(sql`
      select count(*) filter (where status = 'open')::int as open,
             count(*) filter (where status = 'in_progress')::int as in_progress,
             count(*) filter (where status in ('open','in_progress') and due_at < now())::int as overdue,
             count(*) filter (where status = 'completed' and completed_at >= date_trunc('day', now()))::int as completed_today
      from tasks where deleted_at is null ${pred ? sql`and ${pred}` : sql``}`);
    const x = r.rows[0] as { open: number; in_progress: number; overdue: number; completed_today: number };
    return { open: x.open, inProgress: x.in_progress, overdue: x.overdue, completedToday: x.completed_today };
  }
}

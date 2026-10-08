import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { inCidr } from '../../core/auth/ip.js';
import { currentAuth } from '../../core/context.js';
import { conflict, unprocessable } from '../../core/errors.js';
import { Db } from '../../core/database/db.service.js';
import { CrudService, type CrudDeps } from '../../shared/crud/crud.service.js';
import type { Row } from '../../shared/crud/crud.repository.js';
import { isoDate, uuid } from '@trackrex/schemas';

export const SHIFTS_SERVICE = 'CRUD_SERVICE:shifts';

const assignBody = z.object({ employeeIds: z.array(uuid).min(1).max(500), effectiveFrom: isoDate });

const validTimezone = (tz: string): boolean => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

@Injectable()
export class ShiftsService extends CrudService {
  constructor(@Inject('CRUD_DEPS') deps: CrudDeps, private readonly pg: Db) {
    super(deps);
  }

  private validate(input: Record<string, unknown>, existing?: Row): void {
    const errors: { path: string; message: string }[] = [];
    const tz = (input.timezone ?? existing?.timezone) as string | undefined;
    if (tz && !validTimezone(tz)) errors.push({ path: 'timezone', message: 'Use an IANA timezone such as Asia/Kolkata' });
    const start = (input.startTime ?? existing?.startTime) as string | undefined;
    const late = (input.maxPunchInTime ?? existing?.maxPunchInTime) as string | null | undefined;
    if (start && late && late.slice(0, 5) < start.slice(0, 5)) errors.push({ path: 'maxPunchInTime', message: 'Must not be before the start time' });
    const rules = input.rules as { punch?: { ipAllowlist?: string[] } } | undefined;
    for (const cidr of rules?.punch?.ipAllowlist ?? []) {
      if (!inCidr('0.0.0.0', cidr) && !inCidr('::', cidr) && !/^[0-9a-f:.]+(\/\d{1,3})?$/i.test(cidr)) errors.push({ path: 'rules.punch.ipAllowlist', message: `"${cidr}" is not a valid IP or CIDR range` });
    }
    if (errors.length) throw unprocessable('The shift has some invalid values.', errors);
  }

  protected override async beforeCreate(input: Record<string, unknown>) {
    this.validate(input);
    return input;
  }

  protected override async beforeUpdate(existing: Row, patch: Record<string, unknown>) {
    this.validate(patch, existing);
    return patch;
  }

  protected override async beforeDelete(row: Row): Promise<void> {
    const res = await this.pg.q.execute(sql`select count(*)::int as n from shift_assignments where shift_id = ${row.id}::uuid and (effective_to is null or effective_to >= current_date)`);
    if ((res.rows[0] as { n: number }).n > 0) throw conflict('shift_in_use', 'Employees are still assigned to this shift. Move them to another shift first.');
  }

  async employees(id: string) {
    await this.get(id);
    const res = await this.pg.q.execute(sql`
      select a.id as "assignmentId", e.id as "employeeId", e.code, e.display_name as "displayName", a.effective_from as "effectiveFrom", a.effective_to as "effectiveTo"
      from shift_assignments a join employees e on e.id = a.employee_id and e.tenant_id = a.tenant_id
      where a.shift_id = ${id}::uuid and e.deleted_at is null and (a.effective_to is null or a.effective_to >= current_date)
      order by e.display_name`);
    return res.rows;
  }

  /** Effective-dated: the previous assignment ends the day before, so history is preserved. */
  async assign(id: string, body: unknown) {
    this.authz.require(this.perms.update);
    const b = assignBody.parse(body);
    await this.get(id);
    const userId = currentAuth().userId;
    for (const employeeId of b.employeeIds) {
      const prev = await this.pg.q.execute(sql`select id, effective_from from shift_assignments where employee_id = ${employeeId}::uuid and (effective_to is null or effective_to >= ${b.effectiveFrom}::date) order by effective_from desc`);
      for (const p of prev.rows as { id: string; effective_from: string }[]) {
        if (p.effective_from >= b.effectiveFrom) {
          await this.pg.q.execute(sql`delete from shift_assignments where id = ${p.id}::uuid`);
        } else {
          await this.pg.q.execute(sql`update shift_assignments set effective_to = (${b.effectiveFrom}::date - 1) where id = ${p.id}::uuid`);
        }
      }
      await this.pg.q.execute(sql`insert into shift_assignments (tenant_id, employee_id, shift_id, effective_from, created_by) values (app_tenant_id(), ${employeeId}::uuid, ${id}::uuid, ${b.effectiveFrom}::date, ${userId}::uuid)`);
      await this.pg.q.execute(sql`update employees set shift_id = ${id}::uuid, updated_at = now(), version = version + 1 where id = ${employeeId}::uuid and ${b.effectiveFrom}::date <= current_date`);
      await this.audit.record({ entity: 'shifts', entityId: id, action: 'employee_added', changes: { employeeId: { new: employeeId }, effectiveFrom: { new: b.effectiveFrom } } });
    }
    return { assigned: b.employeeIds.length };
  }

  async unassign(id: string, assignmentId: string) {
    this.authz.require(this.perms.update);
    const res = await this.pg.q.execute(sql`delete from shift_assignments where id = ${assignmentId}::uuid and shift_id = ${id}::uuid returning employee_id`);
    const row = res.rows[0] as { employee_id: string } | undefined;
    if (row) {
      await this.pg.q.execute(sql`update employees set shift_id = null, updated_at = now(), version = version + 1 where id = ${row.employee_id}::uuid and shift_id = ${id}::uuid`);
      await this.audit.record({ entity: 'shifts', entityId: id, action: 'employee_removed', changes: { employeeId: { old: row.employee_id } } });
    }
    return { removed: !!row };
  }

  async policies(id: string) {
    await this.get(id);
    const res = await this.pg.q.execute(sql`select id, name, start_date as "startDate", state, revision from attendance_policies where deleted_at is null and (shift_ids is null or shift_ids = '{}' or ${id}::uuid = any(shift_ids)) order by start_date desc`);
    return res.rows;
  }
}

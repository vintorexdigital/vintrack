import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { conflict, unprocessable } from '../../core/errors.js';
import { Db } from '../../core/database/db.service.js';
import { CrudService, type CrudDeps } from '../../shared/crud/crud.service.js';
import type { Row } from '../../shared/crud/crud.repository.js';

export const LEAVE_TYPES_SERVICE = 'CRUD_SERVICE:leave-types';
export const HOLIDAYS_SERVICE = 'CRUD_SERVICE:holidays';

@Injectable()
export class LeaveTypesService extends CrudService {
  constructor(@Inject('CRUD_DEPS') deps: CrudDeps, private readonly pg: Db) {
    super(deps);
  }
  protected override async beforeCreate(input: Record<string, unknown>) {
    return { ...input, code: String(input.code).toUpperCase() };
  }
  protected override async beforeUpdate(_e: Row, patch: Record<string, unknown>) {
    return patch.code ? { ...patch, code: String(patch.code).toUpperCase() } : patch;
  }
  protected override async beforeDelete(row: Row): Promise<void> {
    const res = await this.pg.q.execute(sql`select count(*)::int as n from leave_requests where leave_type_id = ${row.id}::uuid and status in ('pending','approved') and deleted_at is null and to_date >= current_date`);
    if ((res.rows[0] as { n: number }).n > 0) throw conflict('leave_type_in_use', 'Open leave requests use this type. Resolve them first.');
  }
}

@Injectable()
export class HolidaysService extends CrudService {
  constructor(@Inject('CRUD_DEPS') deps: CrudDeps) {
    super(deps);
  }
  private check(input: Record<string, unknown>, existing?: Row) {
    const start = String(input.startDate ?? existing?.startDate);
    const end = String(input.endDate ?? existing?.endDate);
    if (end < start) throw unprocessable('The end date is before the start date.', [{ path: 'endDate', message: 'Must not be before the start date' }]);
  }
  protected override async beforeCreate(input: Record<string, unknown>) { this.check(input); return input; }
  protected override async beforeUpdate(existing: Row, patch: Record<string, unknown>) { this.check(patch, existing); return patch; }
}

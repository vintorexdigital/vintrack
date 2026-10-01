import { Body, Controller, Get, HttpCode, Inject, Module, OnModuleInit, Param, Post, Query } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { addDays, enumerateDates } from '@trackrex/rules';
import { holidays, idParam, isoDate, leaveProfiles, leaveRequests, leaveTypes, nonWorkingRules, uuid } from '@trackrex/schemas';
import { Db } from '../../core/database/db.service.js';
import { AuditService } from '../../core/audit.service.js';
import { currentAuth } from '../../core/context.js';
import { forbidden, notFound, unprocessable } from '../../core/errors.js';
import { Authz, ScopeResolver } from '../../core/rbac.service.js';
import { CrudController } from '../../shared/crud/crud.controller.js';
import { apiPathFor, crudModule, crudParts } from '../../shared/crud/crud.factory.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import { ProvisioningService } from '../accounts/provisioning.service.js';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { HolidaysService, HOLIDAYS_SERVICE, LEAVE_TYPES_SERVICE, LeaveTypesService } from './leave-config.service.js';
import { LeaveEngine } from './leave-engine.service.js';
import { LEAVE_REQUESTS_SERVICE, LeaveRequestsService } from './leave-requests.service.js';
import { seedLeaveDefaults } from './leave.seed.js';

const reqParts = crudParts(leaveRequests, { service: LeaveRequestsService });
const typeParts = crudParts(leaveTypes, { service: LeaveTypesService });
const holParts = crudParts(holidays, { service: HolidaysService });

@Controller(apiPathFor(leaveRequests))
class LeaveRequestsController extends CrudController {
  constructor(@Inject(LEAVE_REQUESTS_SERVICE) protected override readonly service: LeaveRequestsService) {
    super(service);
  }
  @Post(':id/approve') @HttpCode(200) approve(@Param() p: unknown, @Body() body: unknown) { return this.service.approve(idParam.parse(p).id, body); }
  @Post(':id/reject') @HttpCode(200) reject(@Param() p: unknown, @Body() body: unknown) { return this.service.reject(idParam.parse(p).id, body); }
  @Post(':id/cancel') @HttpCode(200) cancel(@Param() p: unknown) { return this.service.cancel(idParam.parse(p).id); }
}

@Controller('leave')
class LeaveController {
  constructor(private readonly db: Db, private readonly authz: Authz, private readonly scope: ScopeResolver, private readonly engine: LeaveEngine, private readonly audit: AuditService) {}

  private async inScope(permission: string, employeeId: string): Promise<void> {
    const pred = this.scope.predicate(this.authz.require(permission), sql`e.id`);
    const res = await this.db.q.execute(sql`select 1 from employees e where e.id = ${employeeId}::uuid and e.deleted_at is null ${pred ? sql`and ${pred}` : sql``}`);
    if (!res.rows.length) throw notFound('Employee');
  }

  @Get('session')
  async session(@Query('date') date = new Date().toISOString().slice(0, 10)) {
    return this.engine.sessionFor(isoDate.parse(date));
  }

  /** Balances for one employee (default: the viewer). */
  @Get('balances')
  async balances(@Query() q: { employeeId?: string; asOf?: string }) {
    const auth = currentAuth();
    const employeeId = q.employeeId ?? auth.employeeId;
    if (!employeeId) throw forbidden('Your account is not linked to an employee record.', 'no_employee');
    if (employeeId !== auth.employeeId) await this.inScope('leave.balance.read', employeeId);
    else this.authz.require('leave.balance.read');
    return this.engine.balances(employeeId, q.asOf ? isoDate.parse(q.asOf) : new Date().toISOString().slice(0, 10));
  }

  /** Everyone in scope, one row per employee and leave type. */
  @Get('balances/team')
  async team(@Query() q: { asOf?: string; limit?: string }) {
    const scope = this.authz.require('leave.balance.read');
    const pred = this.scope.predicate(scope, sql`e.id`);
    const emps = await this.db.q.execute(sql`select e.id, e.code, e.display_name as name from employees e where e.deleted_at is null and e.status = 'active' ${pred ? sql`and ${pred}` : sql``} order by e.display_name limit ${Math.min(Number(q.limit ?? 100), 200)}`);
    const asOf = q.asOf ? isoDate.parse(q.asOf) : new Date().toISOString().slice(0, 10);
    const out = [];
    for (const e of emps.rows as { id: string; code: string; name: string }[]) out.push({ employee: e, balances: await this.engine.balances(e.id, asOf) });
    return out;
  }

  @Post('balances/adjust') @HttpCode(201)
  async adjust(@Body() body: unknown) {
    const b = z.object({
      employeeId: uuid, leaveTypeId: uuid, days: z.number().positive().max(366), direction: z.enum(['credit', 'debit']).default('credit'),
      kind: z.enum(['adjustment', 'comp_off']).default('adjustment'), note: z.string().trim().min(3).max(300), date: isoDate.optional(),
    }).parse(body);
    await this.inScope('leave.balance.adjust', b.employeeId);
    const date = b.date ?? new Date().toISOString().slice(0, 10);
    const session = await this.engine.sessionFor(date);
    let expires: string | null = null;
    if (b.kind === 'comp_off') {
      const t = await this.db.q.execute(sql`select entitlement from leave_types where id = ${b.leaveTypeId}::uuid and deleted_at is null`);
      const ent = (t.rows[0] as { entitlement: { compOff?: { enabled?: boolean; expiryDays?: number } } } | undefined)?.entitlement;
      if (!ent?.compOff?.enabled) throw unprocessable('This leave type does not allow compensatory off.', undefined, 'comp_off_disabled');
      expires = addDays(date, ent.compOff.expiryDays ?? 60);
    }
    const kind = b.direction === 'debit' ? 'lapse' : b.kind;
    await this.db.q.execute(sql`insert into leave_ledger (tenant_id, employee_id, leave_type_id, session_start, date, days, kind, expires_on, note, created_by) values (app_tenant_id(), ${b.employeeId}::uuid, ${b.leaveTypeId}::uuid, ${session.start}::date, ${date}::date, ${b.days}, ${kind}, ${expires}::date, ${b.note}, app_user_id())`);
    await this.audit.record({ entity: 'leave-balances', entityId: b.employeeId, action: 'adjusted', changes: { days: { new: (b.direction === 'debit' ? -1 : 1) * b.days }, kind: { new: kind }, note: { new: b.note } } });
    return this.engine.balanceFor(b.employeeId, b.leaveTypeId, date);
  }

  /** Ledger drill-down for one balance. */
  @Get('balances/ledger')
  async ledger(@Query() q: { employeeId: string; leaveTypeId: string }) {
    const employeeId = uuid.parse(q.employeeId);
    const auth = currentAuth();
    if (employeeId !== auth.employeeId) await this.inScope('leave.balance.read', employeeId);
    const res = await this.db.q.execute(sql`select date, days, kind, expires_on as "expiresOn", note, request_id as "requestId", session_start as "sessionStart" from leave_ledger where employee_id = ${employeeId}::uuid and leave_type_id = ${uuid.parse(q.leaveTypeId)}::uuid order by date desc, created_at desc limit 200`);
    return res.rows;
  }

  /** Month calendar: requests in scope plus holidays and weekly offs. */
  @Get('calendar')
  async calendar(@Query() q: Record<string, string>) {
    const b = z.object({ from: isoDate, to: isoDate, status: z.string().optional(), leaveTypeId: uuid.optional(), departmentId: uuid.optional(), teamId: uuid.optional(), employeeId: uuid.optional() }).parse(q);
    if (enumerateDates(b.from, b.to).length > 93) throw unprocessable('Choose at most three months.');
    const scope = this.authz.require('leave.request.read');
    const pred = this.scope.predicate(scope, sql`r.employee_id`);
    const statuses = (b.status ?? 'pending,approved').split(',').filter((s) => ['pending', 'approved', 'rejected', 'cancelled'].includes(s));
    const reqs = await this.db.q.execute(sql`
      select r.id, r.code, r.employee_id as "employeeId", e.display_name as "employeeName", r.leave_type_id as "leaveTypeId", t.code as "typeCode", t.name as "typeName", t.color,
             r.from_date as "fromDate", r.to_date as "toDate", r.duration, r.days, r.status
      from leave_requests r join employees e on e.id = r.employee_id join leave_types t on t.id = r.leave_type_id
      where r.deleted_at is null and r.from_date <= ${b.to}::date and r.to_date >= ${b.from}::date and r.status = any(${sql.param(statuses)}::text[])
        ${b.leaveTypeId ? sql`and r.leave_type_id = ${b.leaveTypeId}::uuid` : sql``} ${b.employeeId ? sql`and r.employee_id = ${b.employeeId}::uuid` : sql``}
        ${b.departmentId ? sql`and e.department_id = ${b.departmentId}::uuid` : sql``}
        ${b.teamId ? sql`and r.employee_id in (select employee_id from team_members where team_id = ${b.teamId}::uuid)` : sql``}
        ${pred ? sql`and ${pred}` : sql``}
      order by r.from_date limit 1000`);
    const hol = await this.db.q.execute(sql`select id, name, start_date as "startDate", end_date as "endDate", optional from holidays where deleted_at is null and end_date >= ${b.from}::date and start_date <= ${b.to}::date order by start_date`);
    const nw = await this.db.q.execute(sql`select name, weekday, weeks from non_working_rules where deleted_at is null`);
    return { requests: reqs.rows, holidays: hol.rows, nonWorking: nw.rows };
  }
}

@Module({
  imports: [AccountsModule, AttendanceModule, crudModule(leaveProfiles), crudModule(nonWorkingRules)],
  controllers: [LeaveRequestsController, LeaveController],
  providers: [
    LeaveEngine, reqParts.depsProvider, { provide: LEAVE_REQUESTS_SERVICE, useClass: LeaveRequestsService },
  ],
  exports: [LeaveEngine],
})
class LeaveCoreModule {}

@Module({
  controllers: [typeCtl()],
  providers: [typeParts.depsProvider, { provide: LEAVE_TYPES_SERVICE, useClass: LeaveTypesService }],
})
class LeaveTypesModule {}

@Module({
  controllers: [holidayCtl()],
  providers: [holParts.depsProvider, { provide: HOLIDAYS_SERVICE, useClass: HolidaysService }],
})
class HolidaysModule {}

function typeCtl() {
  @Controller(apiPathFor(leaveTypes))
  class LeaveTypesController extends CrudController {
    constructor(@Inject(LEAVE_TYPES_SERVICE) service: LeaveTypesService) { super(service); }
  }
  return LeaveTypesController;
}
function holidayCtl() {
  @Controller(apiPathFor(holidays))
  class HolidaysController extends CrudController {
    constructor(@Inject(HOLIDAYS_SERVICE) service: HolidaysService) { super(service); }
  }
  return HolidaysController;
}

@Module({ imports: [AccountsModule, LeaveCoreModule, LeaveTypesModule, HolidaysModule] })
export class LeaveModule implements OnModuleInit {
  constructor(private readonly provisioning: ProvisioningService, private readonly db: Db) {}
  onModuleInit(): void {
    this.provisioning.registerSeeder((ctx) => seedLeaveDefaults(this.db, ctx));
  }
}

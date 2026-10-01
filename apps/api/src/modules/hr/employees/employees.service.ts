import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { employees as employeesKit, EMPLOYEE_STATUSES, isoDate, uuid } from '@trackrex/schemas';
import { CrudService, type CrudDeps } from '../../../shared/crud/crud.service.js';
import type { Row } from '../../../shared/crud/crud.repository.js';
import { currentAuth, currentStore } from '../../../core/context.js';
import { conflict, notFound, unprocessable, AppError, forbidden } from '../../../core/errors.js';
import { Db } from '../../../core/database/db.service.js';
import { TenantDirectory } from '../../../core/auth/tenant-directory.service.js';
import { tenantUsage, memberships } from '../../../core/auth/platform.tables.js';
import { eq, and } from 'drizzle-orm';
import { CompanyService } from '../../accounts/company.service.js';

export const EMPLOYEE_SERVICE = 'CRUD_SERVICE:employees';

const exitBody = z.object({ dateOfExit: isoDate, reason: z.string().trim().max(500).optional() });
const transferBody = z.object({ fromManagerId: uuid, toManagerId: uuid });
const importBody = z.object({ rows: z.array(z.record(z.string(), z.unknown())).min(1).max(2000), dryRun: z.boolean().default(true) });

export interface ImportIssue {
  row: number;
  field?: string;
  message: string;
}

const ACTIVE = new Set(['active', 'invited']);

@Injectable()
export class EmployeesService extends CrudService {
  constructor(@Inject('CRUD_DEPS') deps: CrudDeps, private readonly pg: Db, private readonly dir: TenantDirectory, private readonly company: CompanyService) {
    super(deps);
  }

  /* ---------- hooks ---------- */

  protected override async beforeCreate(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (ACTIVE.has(String(input.status ?? 'active'))) await this.assertSeatAvailable();
    return input;
  }

  protected override async afterCreate(): Promise<void> {
    await this.recountSeats();
  }

  protected override async beforeUpdate(existing: Row, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (patch.reportingManagerId) await this.assertNoCycle(existing.id, String(patch.reportingManagerId));
    if (patch.status && !ACTIVE.has(String(existing.status)) && ACTIVE.has(String(patch.status))) await this.assertSeatAvailable();
    if (patch.status === 'exited' && !(patch.dateOfExit ?? existing.dateOfExit)) throw unprocessable('Set a date of exit to mark an employee as exited.', [{ path: 'dateOfExit', message: 'Required' }]);
    return patch;
  }

  protected override async afterUpdate(): Promise<void> {
    await this.recountSeats();
  }

  protected override async afterDelete(row: Row): Promise<void> {
    await this.recountSeats();
    await this.suspendMembershipsOf(row.id);
  }

  /* ---------- rules ---------- */

  private async assertSeatAvailable(): Promise<void> {
    const tenant = await this.dir.tenant(currentStore().tenantId!);
    const res = await this.pg.q.execute(sql`select count(*)::int as n from employees where deleted_at is null and status in ('active','invited')`);
    const used = (res.rows[0] as { n: number }).n;
    if (tenant && used >= tenant.seatLimit) {
      throw new AppError(402, 'seat_limit_reached', `All ${tenant.seatLimit} seats are in use. Add seats in Billing, or exit an employee first.`);
    }
  }

  /** A manager cannot report (directly or indirectly) to their own reportee. */
  private async assertNoCycle(employeeId: string, managerId: string): Promise<void> {
    if (employeeId === managerId) throw unprocessable('An employee cannot report to themselves.', [{ path: 'reportingManagerId', message: 'Choose someone else' }]);
    const res = await this.pg.q.execute(sql`select 1 from reportee_ids(${employeeId}::uuid) as r(id) where r.id = ${managerId}::uuid`);
    if (res.rows.length) throw unprocessable('That would make a loop in the reporting line.', [{ path: 'reportingManagerId', message: 'Choose someone who does not report to this employee' }]);
  }

  /** Keep platform-side usage in step so master admins see seats sold versus used. */
  private async recountSeats(): Promise<void> {
    const tenantId = currentStore().tenantId!;
    const res = await this.pg.q.execute(sql`select count(*) filter (where status in ('active','invited'))::int as n from employees where deleted_at is null`);
    const n = (res.rows[0] as { n: number }).n;
    await this.pg.app.insert(tenantUsage).values({ tenantId, employeesActive: n }).onConflictDoUpdate({ target: tenantUsage.tenantId, set: { employeesActive: n, updatedAt: sql`now()` } });
  }

  private async suspendMembershipsOf(employeeId: string): Promise<void> {
    const tenantId = currentStore().tenantId!;
    await this.pg.app.update(memberships).set({ status: 'suspended', updatedAt: sql`now()` }).where(and(eq(memberships.tenantId, tenantId), eq(memberships.employeeId, employeeId), eq(memberships.isOwner, false)));
    this.dir.invalidate(tenantId);
  }

  /* ---------- actions ---------- */

  /** Exiting releases the seat, suspends the login and starts the retention clock. */
  async exit(id: string, body: unknown): Promise<Row> {
    this.authz.require('hr.employee.exit');
    const b = exitBody.parse(body);
    const emp = await this.get(id);
    if (emp.status === 'exited') throw conflict('already_exited', 'This employee has already exited.');
    if (b.dateOfExit < String(emp.dateOfJoining)) throw unprocessable('The exit date is before the joining date.', [{ path: 'dateOfExit', message: 'Must be on or after the joining date' }]);
    const after = await this.repo.update(id, { status: 'exited', dateOfExit: b.dateOfExit, updatedBy: currentAuth().userId });
    await this.audit.record({ entity: 'employees', entityId: id, action: 'exited', changes: { status: { old: emp.status, new: 'exited' }, dateOfExit: { old: emp.dateOfExit ?? null, new: b.dateOfExit }, reason: { old: null, new: b.reason ?? null } } });
    await this.outbox.emit('employee.exited', { id });
    await this.suspendMembershipsOf(id);
    await this.recountSeats();
    return after!;
  }

  async invite(id: string, body: unknown) {
    this.authz.require('hr.employee.invite');
    const emp = await this.get(id);
    const input = z.object({ email: z.string().email().optional(), mobile: z.string().optional(), roleKeys: z.array(z.string()).default(['employee']) }).parse(body ?? {});
    const email = input.email ?? (emp.workEmail as string | null) ?? undefined;
    const mobile = input.mobile ?? (emp.mobile as string | null) ?? undefined;
    if (!email && !mobile) throw unprocessable('Add a work email or mobile number first.', [{ path: 'email', message: 'Required' }]);
    return this.company.invite({ ...(email ? { email } : {}), ...(mobile && !email ? { mobile } : {}), name: emp.displayName, roleKeys: input.roleKeys, employeeId: id });
  }

  /** Move every direct reportee from one manager to another, with one audit entry per person. */
  async transfer(body: unknown) {
    this.authz.require('hr.employee.transfer');
    const b = transferBody.parse(body);
    if (b.fromManagerId === b.toManagerId) throw unprocessable('Choose a different manager.');
    await this.assertNoCycle(b.fromManagerId, b.toManagerId).catch((e) => {
      if (b.toManagerId !== b.fromManagerId) throw e;
    });
    const res = await this.pg.q.execute(sql`select id from employees where reporting_manager_id = ${b.fromManagerId}::uuid and deleted_at is null`);
    const ids = (res.rows as { id: string }[]).map((r) => r.id).filter((x) => x !== b.toManagerId);
    for (const id of ids) {
      await this.repo.update(id, { reportingManagerId: b.toManagerId, updatedBy: currentAuth().userId });
      await this.audit.record({ entity: 'employees', entityId: id, action: 'transferred', changes: { reportingManagerId: { old: b.fromManagerId, new: b.toManagerId } } });
    }
    return { moved: ids.length };
  }

  async counters() {
    this.authz.require(this.perms.read);
    const pred = this.scopePredicate(this.perms.read);
    const where = pred ? sql`and ${pred}` : sql``;
    const res = await this.pg.q.execute(sql`
      select count(*)::int as total,
             count(*) filter (where status = 'active')::int as active,
             count(*) filter (where status = 'invited')::int as invited,
             count(*) filter (where status = 'suspended')::int as suspended,
             count(*) filter (where status = 'exited')::int as exited
      from employees where deleted_at is null ${where}`);
    return res.rows[0];
  }

  async orgChart() {
    this.authz.require(this.perms.read);
    const res = await this.pg.q.execute(sql`select id, code, display_name as "displayName", reporting_manager_id as "managerId", designation_id as "designationId", department_id as "departmentId", status from employees where deleted_at is null and status <> 'exited' order by display_name`);
    return res.rows;
  }

  /* ---------- import ---------- */

  /** Validate every row against the same schema as the form, then insert all or nothing. */
  async importRows(body: unknown) {
    this.authz.require(this.perms.import);
    const b = importBody.parse(body);
    const issues: ImportIssue[] = [];
    const valid: Record<string, unknown>[] = [];
    const seenMobile = new Set<string>();
    const seenEmail = new Set<string>();
    b.rows.forEach((raw, i) => {
      const parsed = this.kit.createSchema.safeParse(raw);
      if (!parsed.success) {
        for (const iss of parsed.error.issues) issues.push({ row: i + 1, field: iss.path.join('.'), message: iss.message });
        return;
      }
      const v = parsed.data as Record<string, unknown>;
      for (const [key, set] of [['mobile', seenMobile], ['workEmail', seenEmail]] as const) {
        const val = v[key] as string | null | undefined;
        if (val) {
          if (set.has(val)) issues.push({ row: i + 1, field: key, message: `Duplicate ${key === 'mobile' ? 'mobile number' : 'email'} in this file` });
          set.add(val);
        }
      }
      valid.push(v);
    });
    if (valid.length) {
      const mobiles = [...seenMobile];
      const emails = [...seenEmail];
      if (mobiles.length || emails.length) {
        const res = await this.pg.q.execute(sql`select mobile, work_email from employees where deleted_at is null and (mobile = any(${sql.param(mobiles)}::text[]) or lower(work_email) = any(${sql.param(emails)}::text[]))`);
        const taken = res.rows as { mobile: string | null; work_email: string | null }[];
        valid.forEach((v, i) => {
          if (taken.some((t) => t.mobile && t.mobile === v.mobile)) issues.push({ row: i + 1, field: 'mobile', message: 'This mobile number already belongs to an employee' });
          if (taken.some((t) => t.work_email && t.work_email.toLowerCase() === v.workEmail)) issues.push({ row: i + 1, field: 'workEmail', message: 'This email already belongs to an employee' });
        });
      }
    }
    const summary = { total: b.rows.length, valid: valid.length, issues };
    if (b.dryRun || issues.length) return { ...summary, imported: 0, dryRun: b.dryRun };
    for (const v of valid) await this.create(v);
    return { ...summary, imported: valid.length, dryRun: false };
  }

  importTemplate(): { columns: { key: string; label: string; required: boolean; example: string }[] } {
    const examples: Record<string, string> = { firstName: 'Asha', lastName: 'Raman', displayName: 'Asha Raman', workEmail: 'asha@example.com', mobile: '+919876543210', dateOfJoining: '2026-01-05', status: 'active', gender: 'female' };
    return { columns: this.kit.formFields.filter((f) => f.kind !== 'ref' || true).map((f) => ({ key: f.key, label: f.label, required: !!f.required, example: examples[f.key] ?? (f.kind === 'ref' ? 'ID of the record' : '') })) };
  }

  async findByUser(): Promise<Row | null> {
    const id = currentAuth().employeeId;
    if (!id) return null;
    return (await this.repo.get(id)) ?? null;
  }
}

export { EMPLOYEE_STATUSES, notFound, forbidden };

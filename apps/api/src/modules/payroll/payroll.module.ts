import { Body, Controller, Get, HttpCode, Injectable, Module, Param, Post, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { attendanceCycle, computePayslip, type Payslip, type SalaryStructure } from '@trackrex/rules';
import { idParam, isoDate, salaryStructures } from '@trackrex/schemas';
import { AuditService } from '../../core/audit.service.js';
import { RequiresModule } from '../../core/auth/decorators.js';
import { currentAuth } from '../../core/context.js';
import { Db } from '../../core/database/db.service.js';
import { conflict, notFound, unprocessable } from '../../core/errors.js';
import { OutboxService } from '../../core/outbox.service.js';
import { Authz, ScopeResolver } from '../../core/rbac.service.js';
import { SettingsService } from '../../core/settings.service.js';
import { crudModule } from '../../shared/crud/crud.factory.js';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { AttendanceService } from '../attendance/attendance.service.js';
import { sendTable } from '../reports/builder.module.js';

const createBody = z.object({ date: isoDate.optional() });
const payBody = z.object({ reference: z.string().trim().max(120).optional() });
const money = (n: number) => `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

interface RunRow { id: string; cycleStart: string; cycleEnd: string; label: string; status: 'draft' | 'finalized' | 'paid'; employees: number; gross: number; deductions: number; net: number; employerCost: number; finalizedAt: string | null; paidAt: string | null; paymentReference: string | null }
const RUN_COLS = sql`id, cycle_start as "cycleStart", cycle_end as "cycleEnd", label, status, employees, gross::float, deductions::float, net::float, employer_cost::float as "employerCost", finalized_at as "finalizedAt", paid_at as "paidAt", payment_reference as "paymentReference"`;

/**
 * Payroll from the attendance numbers HR already sees: payable days and overtime come from the same query as the
 * payroll export of the monthly register, so the two can never disagree. Pay is the employee's salary structure
 * prorated by payable days, less simplified statutory items (rules/payroll.ts). A cycle is drafted, checked, then
 * finalized (which locks the attendance days) and marked paid. See ADR 0019 for what this does not do.
 */
@Injectable()
export class PayrollService {
  constructor(private readonly db: Db, private readonly authz: Authz, private readonly scope: ScopeResolver, private readonly audit: AuditService, private readonly outbox: OutboxService, private readonly attendance: AttendanceService, private readonly settings: SettingsService) {}

  async runs() {
    this.authz.require('payroll.run.read');
    return { data: (await this.db.q.execute(sql`select ${RUN_COLS} from payroll_runs order by cycle_start desc limit 60`)).rows as unknown as RunRow[] };
  }

  async run(id: string) {
    this.authz.require('payroll.run.read');
    const run = (await this.db.q.execute(sql`select ${RUN_COLS} from payroll_runs where id = ${id}::uuid`)).rows[0] as unknown as RunRow | undefined;
    if (!run) throw notFound('Payroll run');
    const slips = (await this.db.q.execute(sql`
      select p.id, p.employee_id as "employeeId", e.code, e.display_name as name, p.gross::float, p.total_deductions::float as "totalDeductions", p.net::float, p.payable_days::float as "payableDays", p.cycle_days as "cycleDays", p.lop_days::float as "lopDays", p.warnings
        from payslips p join employees e on e.id = p.employee_id where p.run_id = ${id}::uuid order by e.display_name`)).rows;
    return { run, payslips: slips };
  }

  /** Drafts (or redrafts) the cycle that contains `date`. */
  async create(raw: unknown) {
    this.authz.require('payroll.run.create');
    const b = createBody.parse(raw ?? {});
    const date = b.date ?? new Date().toISOString().slice(0, 10);
    const cycle = attendanceCycle(date, await this.settings.get<number>('attendance.month_start_day', 1));
    const existing = (await this.db.q.execute(sql`select id, status from payroll_runs where cycle_start = ${cycle.start}::date`)).rows[0] as { id: string; status: string } | undefined;
    if (existing && existing.status !== 'draft') throw conflict('run_closed', `This cycle is already ${existing.status}. Reopen it to change it.`);
    if (cycle.end >= new Date().toISOString().slice(0, 10)) throw unprocessable('Payroll can only be drafted for a cycle that has ended.', [{ path: 'date', message: 'Choose a finished cycle' }], 'cycle_not_ended');

    const reg = await this.attendance.registerExport({ date });
    const structs = (await this.db.q.execute(sql`
      select distinct on (employee_id) id, employee_id, basic, hra, special_allowance, other_allowance, pf_enabled, esi_enabled, professional_tax, other_deductions
        from salary_structures where effective_from <= ${cycle.end}::date order by employee_id, effective_from desc`)).rows as { id: string; employee_id: string; basic: number; hra: number; special_allowance: number; other_allowance: number; pf_enabled: boolean; esi_enabled: boolean; professional_tax: number; other_deductions: number }[];
    const byEmp = new Map(structs.map((s) => [s.employee_id, s]));
    const cycleDays = reg.days.length;
    const label = new Date(`${cycle.end}T00:00:00Z`).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });

    const slips: { employeeId: string; structureId: string; p: Payslip }[] = [];
    const missing: string[] = [];
    for (const r of reg.rows) {
      const s = byEmp.get(r.employee.id);
      if (!s) { missing.push(r.employee.name); continue; }
      const structure: SalaryStructure = { basic: s.basic, hra: s.hra ?? 0, specialAllowance: s.special_allowance ?? 0, otherAllowance: s.other_allowance ?? 0, pfEnabled: !!s.pf_enabled, esiEnabled: !!s.esi_enabled, professionalTax: s.professional_tax ?? 0, otherDeductions: s.other_deductions ?? 0 };
      const p = computePayslip({ structure, cycleDays, payableDays: r.payableDays, overtimeHours: 0 });
      const recorded = Object.keys(r.cells).length;
      if (recorded < cycleDays && !r.cells[cycle.end]) p.warnings.push(`Attendance is recorded for ${recorded} of ${cycleDays} days.`);
      slips.push({ employeeId: r.employee.id, structureId: s.id, p });
    }
    const tot = slips.reduce((a, s) => ({ gross: a.gross + s.p.gross, ded: a.ded + s.p.totalDeductions, net: a.net + s.p.net, er: a.er + s.p.employerContributions.reduce((x, l) => x + l.amount, 0) }), { gross: 0, ded: 0, net: 0, er: 0 });

    const runId = existing?.id ?? ((await this.db.q.execute(sql`
      insert into payroll_runs (tenant_id, cycle_start, cycle_end, label, created_by) values (app_tenant_id(), ${cycle.start}::date, ${cycle.end}::date, ${label}, ${currentAuth().userId}::uuid) returning id`)).rows[0] as { id: string }).id;
    await this.db.q.execute(sql`delete from payslips where run_id = ${runId}::uuid`);
    for (const s of slips) {
      await this.db.q.execute(sql`
        insert into payslips (tenant_id, run_id, employee_id, structure_id, earnings, deductions, employer, gross, total_deductions, net, payable_days, cycle_days, lop_days, warnings)
        values (app_tenant_id(), ${runId}::uuid, ${s.employeeId}::uuid, ${s.structureId}::uuid, ${JSON.stringify(s.p.earnings)}::jsonb, ${JSON.stringify(s.p.deductions)}::jsonb, ${JSON.stringify(s.p.employerContributions)}::jsonb,
                ${s.p.gross}, ${s.p.totalDeductions}, ${s.p.net}, ${s.p.payableDays}, ${s.p.cycleDays}, ${s.p.lopDays}, ${sql.param(s.p.warnings)}::text[])`);
    }
    await this.db.q.execute(sql`update payroll_runs set employees = ${slips.length}, gross = ${tot.gross}, deductions = ${tot.ded}, net = ${tot.net}, employer_cost = ${tot.er}, updated_at = now() where id = ${runId}::uuid`);
    await this.audit.record({ entity: 'payroll-runs', entityId: runId, action: existing ? 'redrafted' : 'drafted', changes: { cycle: { new: `${cycle.start}..${cycle.end}` }, employees: { new: slips.length } } });
    return { ...(await this.run(runId)), missingStructure: missing };
  }

  private async load(id: string): Promise<RunRow> {
    const run = (await this.db.q.execute(sql`select ${RUN_COLS} from payroll_runs where id = ${id}::uuid for update`)).rows[0] as unknown as RunRow | undefined;
    if (!run) throw notFound('Payroll run');
    return run;
  }

  /** Locks the cycle's attendance days: from here the pay and the attendance behind it cannot drift apart. */
  async finalize(id: string) {
    this.authz.require('payroll.run.finalize');
    const run = await this.load(id);
    if (run.status !== 'draft') throw conflict('not_draft', `This run is already ${run.status}.`);
    if (run.employees === 0) throw unprocessable('There are no payslips in this run.', undefined, 'empty_run');
    await this.db.q.execute(sql`update attendance_days set locked = true where date >= ${run.cycleStart}::date and date <= ${run.cycleEnd}::date`);
    await this.db.q.execute(sql`update payroll_runs set status = 'finalized', finalized_at = now(), finalized_by = ${currentAuth().userId}::uuid, updated_at = now() where id = ${id}::uuid`);
    await this.audit.record({ entity: 'payroll-runs', entityId: id, action: 'finalized', changes: { status: { old: 'draft', new: 'finalized' } } });
    return this.run(id);
  }

  async reopen(id: string) {
    this.authz.require('payroll.run.finalize');
    const run = await this.load(id);
    if (run.status !== 'finalized') throw conflict('not_finalized', run.status === 'paid' ? 'A paid run cannot be reopened.' : 'Only a finalized run can be reopened.');
    await this.db.q.execute(sql`update attendance_days set locked = false where date >= ${run.cycleStart}::date and date <= ${run.cycleEnd}::date`);
    await this.db.q.execute(sql`update payroll_runs set status = 'draft', finalized_at = null, finalized_by = null, updated_at = now() where id = ${id}::uuid`);
    await this.audit.record({ entity: 'payroll-runs', entityId: id, action: 'reopened', changes: { status: { old: 'finalized', new: 'draft' } } });
    return this.run(id);
  }

  /** Marks the run paid and tells each person their payslip is ready. */
  async pay(id: string, raw: unknown) {
    this.authz.require('payroll.run.pay');
    const b = payBody.parse(raw ?? {});
    const run = await this.load(id);
    if (run.status !== 'finalized') throw conflict('not_finalized', run.status === 'paid' ? 'This run is already paid.' : 'Finalize the run before marking it paid.');
    await this.db.q.execute(sql`update payroll_runs set status = 'paid', paid_at = now(), payment_reference = ${b.reference ?? null}, updated_at = now() where id = ${id}::uuid`);
    const slips = (await this.db.q.execute(sql`select id, employee_id from payslips where run_id = ${id}::uuid`)).rows as { id: string; employee_id: string }[];
    for (const s of slips) await this.outbox.emit('payslip.published', { id: s.id, employeeId: s.employee_id, label: run.label });
    await this.audit.record({ entity: 'payroll-runs', entityId: id, action: 'paid', changes: { reference: { new: b.reference ?? null } } });
    return this.run(id);
  }

  async export(id: string, format: string | undefined, res: Response): Promise<StreamableFile> {
    const { run, payslips } = await this.run(id);
    const rows = (payslips as { code: string | null; name: string; payableDays: number; gross: number; totalDeductions: number; net: number }[]).map((p) => ({ code: p.code, name: p.name, days: p.payableDays, gross: p.gross, ded: p.totalDeductions, net: p.net }));
    return sendTable(res, `payroll-${run.cycleStart}`, [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Employee' }, { key: 'days', label: 'Payable days', unit: 'n' }, { key: 'gross', label: 'Gross', unit: 'n' }, { key: 'ded', label: 'Deductions', unit: 'n' }, { key: 'net', label: 'Net pay', unit: 'n' }], rows, format);
  }

  /** A person's payslips. Employees see only their own, and only once the run is finalized. */
  async payslips(raw: Record<string, unknown>) {
    const scope = this.authz.require('payroll.payslip.read');
    const pred = this.scope.predicate(scope, sql`p.employee_id`);
    const employeeId = typeof raw.employeeId === 'string' ? raw.employeeId : undefined;
    const privileged = this.authz.has('payroll.run.read');
    const r = await this.db.q.execute(sql`
      select p.id, p.employee_id as "employeeId", e.display_name as name, r.label, r.cycle_start as "cycleStart", r.cycle_end as "cycleEnd", r.status as "runStatus", p.net::float, p.gross::float
        from payslips p join payroll_runs r on r.id = p.run_id join employees e on e.id = p.employee_id
       where ${privileged ? sql`true` : sql`r.status in ('finalized', 'paid')`} ${pred ? sql`and ${pred}` : sql``} ${employeeId ? sql`and p.employee_id = ${employeeId}::uuid` : sql``}
       order by r.cycle_start desc, e.display_name limit 120`);
    return { data: r.rows };
  }

  async payslip(id: string) {
    const scope = this.authz.require('payroll.payslip.read');
    const pred = this.scope.predicate(scope, sql`p.employee_id`);
    const privileged = this.authz.has('payroll.run.read');
    const r = (await this.db.q.execute(sql`
      select p.id, e.display_name as name, e.code, r.label, r.cycle_start as "cycleStart", r.cycle_end as "cycleEnd", r.status as "runStatus", p.earnings, p.deductions, p.employer, p.gross::float, p.total_deductions::float as "totalDeductions", p.net::float,
             p.payable_days::float as "payableDays", p.cycle_days as "cycleDays", p.lop_days::float as "lopDays", p.warnings, t.name as company
        from payslips p join payroll_runs r on r.id = p.run_id join employees e on e.id = p.employee_id join platform.tenants t on t.id = p.tenant_id
       where p.id = ${id}::uuid ${privileged ? sql`` : sql`and r.status in ('finalized', 'paid')`} ${pred ? sql`and ${pred}` : sql``}`)).rows[0];
    if (!r) throw notFound('Payslip');
    return r as { name: string; code: string | null; label: string; cycleStart: string; cycleEnd: string; earnings: { code: string; label: string; amount: number }[]; deductions: { code: string; label: string; amount: number }[]; gross: number; totalDeductions: number; net: number; payableDays: number; cycleDays: number; lopDays: number; company: string };
  }

  /** A page that prints cleanly; "Save as PDF" is the browser's. */
  async printable(id: string): Promise<string> {
    const p = await this.payslip(id);
    const rows = (lines: { label: string; amount: number }[]) => lines.map((l) => `<tr><td>${esc(l.label)}</td><td class="n">${money(l.amount)}</td></tr>`).join('');
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Payslip ${esc(p.label)} · ${esc(p.name)}</title><style>
body{font:14px/1.5 system-ui,sans-serif;color:#17212b;margin:32px auto;max-width:720px}h1{font-size:20px;margin:0}h2{font-size:14px;margin:20px 0 6px}table{width:100%;border-collapse:collapse}td{padding:6px 0;border-bottom:1px solid #d9e0e6}.n{text-align:right;font-variant-numeric:tabular-nums}.tot td{font-weight:600;border-bottom:2px solid #17212b}.meta{color:#5b6b7a;margin:2px 0 16px}.net{font-size:18px;font-weight:700}@media print{body{margin:0}}</style></head><body>
<h1>${esc(p.company)}</h1><p class="meta">Payslip for ${esc(p.label)} (${p.cycleStart} to ${p.cycleEnd})</p>
<p><strong>${esc(p.name)}</strong>${p.code ? ` · ${esc(p.code)}` : ''}<br>Paid days ${p.payableDays} of ${p.cycleDays}${p.lopDays > 0 ? ` · loss of pay ${p.lopDays}` : ''}</p>
<h2>Earnings</h2><table>${rows(p.earnings)}<tr class="tot"><td>Gross</td><td class="n">${money(p.gross)}</td></tr></table>
<h2>Deductions</h2><table>${p.deductions.length ? rows(p.deductions) : '<tr><td>None</td><td class="n">–</td></tr>'}<tr class="tot"><td>Total deductions</td><td class="n">${money(p.totalDeductions)}</td></tr></table>
<p class="net">Net pay ${money(p.net)}</p></body></html>`;
  }
}

@RequiresModule('payroll')
@Controller('payroll')
class PayrollController {
  constructor(private readonly svc: PayrollService) {}
  @Get('runs') runs() { return this.svc.runs(); }
  @Post('runs') @HttpCode(200) create(@Body() b: unknown) { return this.svc.create(b); }
  @Get('runs/:id') run(@Param() p: unknown) { return this.svc.run(idParam.parse(p).id); }
  @Post('runs/:id/finalize') @HttpCode(200) finalize(@Param() p: unknown) { return this.svc.finalize(idParam.parse(p).id); }
  @Post('runs/:id/reopen') @HttpCode(200) reopen(@Param() p: unknown) { return this.svc.reopen(idParam.parse(p).id); }
  @Post('runs/:id/pay') @HttpCode(200) pay(@Param() p: unknown, @Body() b: unknown) { return this.svc.pay(idParam.parse(p).id, b); }
  @Get('runs/:id/export') export(@Param() p: unknown, @Query('format') format: string | undefined, @Res({ passthrough: true }) res: Response) { return this.svc.export(idParam.parse(p).id, format, res); }
  @Get('payslips') payslips(@Query() q: Record<string, unknown>) { return this.svc.payslips(q); }
  @Get('payslips/:id') payslip(@Param() p: unknown) { return this.svc.payslip(idParam.parse(p).id); }
  @Get('payslips/:id/print')
  async print(@Param() p: unknown, @Res() res: Response) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.type('text/html').send(await this.svc.printable(idParam.parse(p).id));
  }
}

@Module({ imports: [crudModule(salaryStructures), AttendanceModule], controllers: [PayrollController], providers: [PayrollService], exports: [PayrollService] })
export class PayrollModule {}

import { Body, Controller, Delete, Get, HttpCode, Inject, Injectable, Module, Param, Patch, Post, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import { sql } from 'drizzle-orm';
import { nextRun } from '@trackrex/rules';
import { dashboards, idParam, savedReports, scheduleBody, widgetsSchema, type DashboardWidget } from '@trackrex/schemas';
import { RequiresModule } from '../../core/auth/decorators.js';
import { TenantDirectory } from '../../core/auth/tenant-directory.service.js';
import { currentAuth, currentStore, type AuthContext } from '../../core/context.js';
import { Db } from '../../core/database/db.service.js';
import { forbidden, notFound, unprocessable } from '../../core/errors.js';
import { Authz, RbacService } from '../../core/rbac.service.js';
import { CrudService, type CrudDeps } from '../../shared/crud/crud.service.js';
import type { Row } from '../../shared/crud/crud.repository.js';
import { crudParts } from '../../shared/crud/crud.factory.js';
import { ChannelRouter } from '../../shared/providers/messaging/channels.js';
import { CONFIG, type Config } from '../../core/config.js';
import { deliver } from '../notifications/delivery.js';
import { ReportBuilderService, type BuiltResult } from './builder.service.js';

const SAVED_SERVICE = 'CRUD_SERVICE:saved-reports';
const DASH_SERVICE = 'CRUD_SERVICE:dashboards';
const MAX_SNAPSHOT_ROWS = 2000;

/** Private reports belong to whoever made them; company reports can be opened by everyone who can read reports. */
abstract class OwnedCrud extends CrudService {
  protected override extraWhere() {
    return sql`(visibility = 'company' or created_by = ${currentAuth().userId}::uuid)`;
  }
  protected assertOwner(row: Row): void {
    const a = currentAuth();
    if (row.createdBy !== a.userId && !a.isOwner && a.permissions.get(this.perms.update) !== 'all') throw forbidden('Only the person who made this can change it.', 'not_the_owner');
  }
  protected override async beforeDelete(row: Row): Promise<void> { this.assertOwner(row); }
}

@Injectable()
export class SavedReportsService extends OwnedCrud {
  constructor(@Inject('CRUD_DEPS') deps: CrudDeps, private readonly builder: ReportBuilderService) { super(deps); }
  protected override async beforeCreate(input: Record<string, unknown>) { return { ...input, definition: this.builder.validate(input.definition) }; }
  protected override async beforeUpdate(existing: Row, patch: Record<string, unknown>) {
    this.assertOwner(existing);
    return patch.definition === undefined ? patch : { ...patch, definition: this.builder.validate(patch.definition) };
  }
  run(id: string) { return this.get(id).then((r) => this.builder.run(r.definition)); }
}

@Injectable()
export class DashboardsService extends OwnedCrud {
  constructor(@Inject('CRUD_DEPS') deps: CrudDeps, private readonly db: Db) { super(deps); }
  private async check(widgets: unknown) {
    const ws = widgetsSchema.parse(widgets ?? []);
    if (new Set(ws.map((w) => w.id)).size !== ws.length) throw unprocessable('Each widget needs its own id.', [{ path: 'widgets', message: 'Duplicate widget id' }]);
    const ids = [...new Set(ws.map((w) => w.reportId))];
    if (ids.length) {
      const found = (await this.db.q.execute(sql`select id from saved_reports where id = any(${sql.param(ids)}::uuid[]) and deleted_at is null and (visibility = 'company' or created_by = ${currentAuth().userId}::uuid)`)).rows as { id: string }[];
      const missing = ids.filter((i) => !found.some((f) => f.id === i));
      if (missing.length) throw unprocessable('A widget points at a report you cannot open.', [{ path: 'widgets', message: 'Unknown report' }]);
    }
    return ws;
  }
  protected override async beforeCreate(input: Record<string, unknown>) { return { ...input, widgets: await this.check(input.widgets) }; }
  protected override async beforeUpdate(existing: Row, patch: Record<string, unknown>) {
    this.assertOwner(existing);
    return patch.widgets === undefined ? patch : { ...patch, widgets: await this.check(patch.widgets) };
  }
}

const cellFor = (unit: string | undefined, v: string | number | null) => (v === null ? null : unit ? Number(v) : String(v));
const csvEscape = (v: unknown): string => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export async function sendTable(res: Response, name: string, columns: { key: string; label: string; unit?: string | undefined }[], rows: Record<string, string | number | null>[], format: string | undefined): Promise<StreamableFile> {
  const header = columns.map((c) => c.label);
  const body = rows.map((r) => columns.map((c) => cellFor(c.unit, r[c.key] ?? null)));
  if (format === 'csv') {
    res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
    res.type('text/csv; charset=utf-8');
    return new StreamableFile(Buffer.from('﻿' + [header, ...body].map((l) => l.map(csvEscape).join(',')).join('\r\n')));
  }
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(name.slice(0, 31));
  ws.addRow(header).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const l of body) ws.addRow(l);
  ws.columns.forEach((c, i) => { c.width = Math.max(12, Math.min(40, header[i]!.length + 4)); });
  res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`);
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  return new StreamableFile(Buffer.from(await wb.xlsx.writeBuffer()));
}

@Injectable()
export class ScheduleService {
  constructor(
    private readonly db: Db, private readonly authz: Authz, private readonly dir: TenantDirectory, private readonly rbac: RbacService, private readonly builder: ReportBuilderService,
    private readonly router: ChannelRouter, @Inject(CONFIG) private readonly cfg: Config, @Inject(SAVED_SERVICE) private readonly saved: SavedReportsService,
  ) {}

  private async tz() { return (await this.dir.tenant(currentStore().auth!.tenantId!))?.timezone ?? 'UTC'; }

  async list() {
    const me = currentAuth().userId;
    const r = await this.db.q.execute(sql`
      select s.id, s.report_id as "reportId", r.name as "reportName", s.frequency, s.weekday, s.day_of_month as "dayOfMonth", s.hour, s.enabled, s.next_run_at as "nextRunAt", s.last_run_at as "lastRunAt", s.last_status as "lastStatus"
        from report_schedules s join saved_reports r on r.id = s.report_id where s.owner_user_id = ${me}::uuid and r.deleted_at is null order by r.name`);
    return { data: r.rows };
  }

  /** One schedule per person per report. */
  async upsert(raw: unknown) {
    this.authz.require('reports.builder.read');
    const b = scheduleBody.parse(raw ?? {});
    await this.saved.get(b.reportId); // must be a report the person can open
    const next = nextRun(b, Date.now(), await this.tz());
    const r = await this.db.q.execute(sql`
      insert into report_schedules (tenant_id, report_id, owner_user_id, frequency, weekday, day_of_month, hour, enabled, next_run_at)
      values (app_tenant_id(), ${b.reportId}::uuid, ${currentAuth().userId}::uuid, ${b.frequency}, ${b.weekday}, ${b.dayOfMonth}, ${b.hour}, ${b.enabled}, ${new Date(next).toISOString()}::timestamptz)
      on conflict (tenant_id, report_id, owner_user_id) do update set frequency = excluded.frequency, weekday = excluded.weekday, day_of_month = excluded.day_of_month, hour = excluded.hour, enabled = excluded.enabled, next_run_at = excluded.next_run_at
      returning id`);
    return { id: (r.rows[0] as { id: string }).id, nextRunAt: new Date(next).toISOString() };
  }

  async remove(id: string) {
    const r = await this.db.q.execute(sql`delete from report_schedules where id = ${id}::uuid and owner_user_id = ${currentAuth().userId}::uuid`);
    if (!r.rowCount) throw notFound('Schedule');
    return { ok: true };
  }

  /** Runs one schedule as its owner, so the snapshot holds exactly what they would see. */
  private async runOne(s: { id: string; report_id: string; owner_user_id: string; frequency: 'daily' | 'weekly' | 'monthly'; weekday: number; day_of_month: number; hour: number }, tenantId: string, tz: string): Promise<void> {
    const store = currentStore();
    const m = (await this.db.q.execute(sql`select role_keys, employee_id, is_owner from platform.memberships where tenant_id = app_tenant_id() and user_id = ${s.owner_user_id}::uuid and status = 'active' limit 1`)).rows[0] as { role_keys: string[]; employee_id: string | null; is_owner: boolean } | undefined;
    let status = 'sent';
    let snapshotId: string | null = null;
    const next = nextRun({ frequency: s.frequency, weekday: s.weekday, dayOfMonth: s.day_of_month, hour: s.hour }, Date.now(), tz);
    if (!m) status = 'failed: the owner no longer has access';
    else {
      const roleKeys = m.is_owner ? [...new Set([...m.role_keys, 'owner'])] : m.role_keys;
      const auth: AuthContext = { realm: 'company', userId: s.owner_user_id, tenantId, employeeId: m.employee_id, roleKeys, isOwner: m.is_owner, permissions: await this.rbac.resolve(tenantId, roleKeys, false) };
      store.auth = auth;
      try {
        const rep = await this.saved.get(s.report_id);
        const res: BuiltResult = await this.builder.run(rep.definition);
        snapshotId = ((await this.db.q.execute(sql`
          insert into report_snapshots (tenant_id, schedule_id, report_id, owner_user_id, name, range_from, range_to, columns, rows, truncated)
          values (app_tenant_id(), ${s.id}::uuid, ${s.report_id}::uuid, ${s.owner_user_id}::uuid, ${String(rep.name)}, ${res.range.from}::date, ${res.range.to}::date, ${JSON.stringify(res.columns)}::jsonb,
                  ${JSON.stringify(res.rows.slice(0, MAX_SNAPSHOT_ROWS))}::jsonb, ${res.truncated || res.rows.length > MAX_SNAPSHOT_ROWS}) returning id`)).rows[0] as { id: string }).id;
        const title = `${String(rep.name)} is ready`;
        const link = `/reports/snapshots/${snapshotId}`;
        await this.db.q.execute(sql`insert into notifications (tenant_id, user_id, type, title, body, link) values (app_tenant_id(), ${s.owner_user_id}::uuid, 'report.ready', ${title}, ${`${res.range.from} to ${res.range.to}, ${res.rows.length} rows`}, ${link})`);
        await deliver(this.db, this.router, this.cfg.WEB_ORIGIN, { userIds: [s.owner_user_id], type: 'report.ready', title, body: `${res.rows.length} rows`, link }).catch(() => undefined);
      } catch (e) {
        status = `failed: ${(e as Error).message.slice(0, 200)}`;
      } finally { delete store.auth; }
    }
    await this.db.q.execute(sql`update report_schedules set last_run_at = now(), last_status = ${status}, next_run_at = ${new Date(next).toISOString()}::timestamptz where id = ${s.id}::uuid`);
  }

  /** Worker job: run every due schedule of the company. */
  async runDue(tenantId: string): Promise<number> {
    const tz = (await this.dir.tenant(tenantId))?.timezone ?? 'UTC';
    const due = (await this.db.q.execute(sql`select id, report_id, owner_user_id, frequency, weekday, day_of_month, hour from report_schedules where enabled and next_run_at <= now() order by next_run_at limit 50 for update skip locked`)).rows as Parameters<ScheduleService['runOne']>[0][];
    for (const s of due) await this.runOne(s, tenantId, tz);
    return due.length;
  }

  async snapshots() {
    const r = await this.db.q.execute(sql`select id, name, range_from as "rangeFrom", range_to as "rangeTo", jsonb_array_length(rows) as "rowCount", truncated, created_at as "createdAt" from report_snapshots where owner_user_id = ${currentAuth().userId}::uuid order by created_at desc limit 50`);
    return { data: r.rows };
  }
  async snapshot(id: string) {
    const r = (await this.db.q.execute(sql`select id, name, range_from as "rangeFrom", range_to as "rangeTo", columns, rows, truncated, created_at as "createdAt" from report_snapshots where id = ${id}::uuid and owner_user_id = ${currentAuth().userId}::uuid`)).rows[0];
    if (!r) throw notFound('Snapshot');
    return r as { name: string; columns: { key: string; label: string; unit?: string }[]; rows: Record<string, string | number | null>[] };
  }
  async deleteSnapshot(id: string) {
    const r = await this.db.q.execute(sql`delete from report_snapshots where id = ${id}::uuid and owner_user_id = ${currentAuth().userId}::uuid`);
    if (!r.rowCount) throw notFound('Snapshot');
    return { ok: true };
  }
  async purgeSnapshots(): Promise<number> {
    return (await this.db.q.execute(sql`delete from report_snapshots where created_at < now() - interval '90 days'`)).rowCount ?? 0;
  }
}

@RequiresModule('advanced_analytics')
@Controller('report-builder')
class ReportBuilderController {
  constructor(private readonly builder: ReportBuilderService, private readonly authz: Authz, private readonly schedules: ScheduleService, @Inject(SAVED_SERVICE) private readonly saved: SavedReportsService, @Inject(DASH_SERVICE) private readonly dash: DashboardsService) {}

  @Get('datasets') datasets() { this.authz.require('reports.builder.read'); return this.builder.datasets(); }
  /** Try a design before saving it. */
  @Post('run') @HttpCode(200) run(@Body() b: unknown) { this.authz.require('reports.builder.create'); return this.builder.run((b as { definition?: unknown })?.definition); }

  @Get('reports/:id/run') runSaved(@Param() p: unknown) { return this.saved.run(idParam.parse(p).id); }
  @Get('reports/:id/export')
  async exportSaved(@Param() p: unknown, @Query('format') format: string | undefined, @Res({ passthrough: true }) res: Response) {
    const rep = await this.saved.get(idParam.parse(p).id);
    const r = await this.builder.run(rep.definition);
    return sendTable(res, `${String(rep.name).replace(/[^\w-]+/g, '-')}-${r.range.from}-to-${r.range.to}`, r.columns, r.rows, format);
  }

  /** Every widget of a dashboard, run for the viewer. A widget whose report is gone or not allowed shows its error, the rest still load. */
  @Get('dashboards/:id/data')
  async dashboardData(@Param() p: unknown) {
    const d = await this.dash.get(idParam.parse(p).id);
    const widgets = (d.widgets ?? []) as DashboardWidget[];
    const out = await Promise.all(widgets.map(async (w) => {
      try { return { widgetId: w.id, result: await this.saved.run(w.reportId) }; } catch (e) { return { widgetId: w.id, error: (e as Error).message }; }
    }));
    return { dashboard: { id: d.id, name: d.name, description: d.description, widgets }, results: out };
  }

  @Get('schedules') schedules_() { this.authz.require('reports.builder.read'); return this.schedules.list(); }
  @Post('schedules') @HttpCode(200) schedule(@Body() b: unknown) { return this.schedules.upsert(b); }
  @Delete('schedules/:id') removeSchedule(@Param() p: unknown) { this.authz.require('reports.builder.read'); return this.schedules.remove(idParam.parse(p).id); }

  @Get('snapshots') snapshots() { this.authz.require('reports.builder.read'); return this.schedules.snapshots(); }
  @Get('snapshots/:id') snapshot(@Param() p: unknown) { this.authz.require('reports.builder.read'); return this.schedules.snapshot(idParam.parse(p).id); }
  @Delete('snapshots/:id') deleteSnapshot(@Param() p: unknown) { this.authz.require('reports.builder.read'); return this.schedules.deleteSnapshot(idParam.parse(p).id); }
  @Get('snapshots/:id/export')
  async exportSnapshot(@Param() p: unknown, @Query('format') format: string | undefined, @Res({ passthrough: true }) res: Response) {
    this.authz.require('reports.builder.read');
    const s = await this.schedules.snapshot(idParam.parse(p).id);
    return sendTable(res, s.name.replace(/[^\w-]+/g, '-'), s.columns, s.rows, format);
  }
}

const savedParts = crudParts(savedReports, { service: SavedReportsService });
const dashParts = crudParts(dashboards, { service: DashboardsService });

@Module({ providers: [ReportBuilderService], exports: [ReportBuilderService] })
class BuilderCoreModule {}

@Module({ imports: [BuilderCoreModule], controllers: [savedParts.Controller], providers: [savedParts.depsProvider, { provide: savedParts.token, useClass: SavedReportsService }], exports: [savedParts.token] })
class SavedReportsModule {}

@Module({ controllers: [dashParts.Controller], providers: [dashParts.depsProvider, { provide: dashParts.token, useClass: DashboardsService }], exports: [dashParts.token] })
class DashboardsModule {}

/** Saved reports, dashboards, schedules and snapshots, on top of the dataset-based builder. See ADR 0018. */
@Module({ imports: [BuilderCoreModule, SavedReportsModule, DashboardsModule], controllers: [ReportBuilderController], providers: [ScheduleService], exports: [ScheduleService, BuilderCoreModule] })
export class ReportBuilderModule {}

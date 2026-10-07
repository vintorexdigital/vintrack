import { RequiresModule } from '../../core/auth/decorators.js';
import { Controller, Get, HttpCode, Injectable, Module, OnModuleInit, Post, Body, Query } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import { computeProductivity, withinIntervals, workingIntervals, type AppClass } from '@trackrex/rules';
import { activityBatchBody, appClassifications, productivityQuery, uuid } from '@trackrex/schemas';
import { z } from 'zod';
import { TenantDirectory } from '../../core/auth/tenant-directory.service.js';
import { currentAuth, currentStore } from '../../core/context.js';
import { Db } from '../../core/database/db.service.js';
import { forbidden, unprocessable } from '../../core/errors.js';
import { Authz, ScopeResolver } from '../../core/rbac.service.js';
import { SettingsService } from '../../core/settings.service.js';
import { crudModule } from '../../shared/crud/crud.factory.js';
import { AccountsModule } from '../accounts/accounts.module.js';
import { ProvisioningService } from '../accounts/provisioning.service.js';
import { seedProductivityDefaults } from './productivity.seed.js';

const MAX_AGE_MS = 7 * 86_400_000;
const FUTURE_MS = 5 * 60_000;

/** The class of a bucket: the website's class wins over the browser's, anything unlisted is neutral. */
const CLASS_SQL = sql`coalesce(dc.app_class, ac.app_class, 'neutral')`;
const JOIN_CLASSES = sql`
  left join app_classes dc on b.domain is not null and dc.kind = 'domain' and lower(dc.name) = lower(b.domain) and dc.deleted_at is null
  left join app_classes ac on dc.id is null and ac.kind = 'app' and lower(ac.name) = lower(b.app) and ac.deleted_at is null`;

@Injectable()
export class ActivityService {
  constructor(private readonly db: Db, private readonly authz: Authz, private readonly settings: SettingsService) {}

  /** What the agent collects, so it can tell the employee. Read-only, always available to the signed-in person. */
  async policy() {
    return {
      enabled: true,
      windowTitles: await this.settings.get<string>('desktop.window_titles', 'drop'),
      fullUrls: await this.settings.get<boolean>('desktop.full_urls', false),
      screenshots: false,
    };
  }

  async ingest(raw: unknown) {
    this.authz.require('productivity.activity.create');
    const body = activityBatchBody.parse(raw ?? {});
    const auth = currentAuth();
    if (!auth.employeeId) throw forbidden('Your account is not linked to an employee record.', 'no_employee');
    const employeeId = auth.employeeId;
    const titles = await this.settings.get<string>('desktop.window_titles', 'drop');
    const fullUrls = await this.settings.get<boolean>('desktop.full_urls', false);
    const now = Date.now();
    const items = body.buckets.map((b) => ({ ...b, ms: new Date(b.start).getTime() }));
    const fresh = items.filter((b) => b.ms <= now + FUTURE_MS && now - b.ms <= MAX_AGE_MS);
    const stale = items.length - fresh.length;
    if (!fresh.length) return { accepted: 0, outsideWorkingTime: 0, duplicate: 0, stale };

    const minMs = Math.min(...fresh.map((b) => b.ms));
    const pr = await this.db.q.execute(sql`select type, at from punches where employee_id = ${employeeId}::uuid and at >= ${new Date(minMs - 36 * 3_600_000).toISOString()}::timestamptz order by at`);
    const intervals = workingIntervals((pr.rows as { type: 'in' | 'out'; at: string }[]).map((r) => ({ type: r.type, at: new Date(r.at).getTime() })), now);
    const inside = fresh.filter((b) => withinIntervals(b.ms, intervals));
    const outside = fresh.length - inside.length;
    if (!inside.length) return { accepted: 0, outsideWorkingTime: outside, duplicate: 0, stale };

    const values = inside.map((b) => {
      let domain: string | null = null;
      if (b.url) { try { domain = new URL(b.url.includes('://') ? b.url : `https://${b.url}`).hostname.replace(/^www\./, '').toLowerCase(); } catch { domain = null; } }
      const url = fullUrls ? b.url ?? null : null;
      const title = !b.title || titles === 'drop' ? null : titles === 'hash' ? createHash('sha256').update(b.title).digest('hex').slice(0, 16) : b.title;
      return sql`(app_tenant_id(), ${employeeId}::uuid, ${b.start}::timestamptz, ${b.seconds}, ${b.activeSeconds}, ${b.idleSeconds}, ${b.app.toLowerCase()}, ${domain}, ${url ? url.slice(0, 500) : null}, ${title}, ${body.deviceId ?? null})`;
    });
    const res = await this.db.q.execute(sql`
      insert into activity_buckets (tenant_id, employee_id, start_at, seconds, active_seconds, idle_seconds, app, domain, url, title, device_id)
      values ${sql.join(values, sql`, `)} on conflict (tenant_id, employee_id, start_at, app) do nothing`);
    const accepted = res.rowCount ?? 0;
    return { accepted, outsideWorkingTime: outside, duplicate: inside.length - accepted, stale };
  }
}

interface SummaryRow {
  employeeId: string; code: string | null; name: string; department: string | null;
  workingMinutes: number; recordedMinutes: number; unrecordedMinutes: number; idleMinutes: number;
  productiveMinutes: number; unproductiveMinutes: number; neutralMinutes: number; productivityPct: number;
}

@Injectable()
export class ProductivityService {
  constructor(private readonly db: Db, private readonly authz: Authz, private readonly scope: ScopeResolver, private readonly settings: SettingsService, private readonly dir: TenantDirectory) {}

  private async tz(): Promise<string> { return (await this.dir.tenant(currentStore().tenantId!))?.timezone ?? 'UTC'; }

  async summary(raw: unknown): Promise<{ from: string; to: string; rows: SummaryRow[]; totals: Omit<SummaryRow, 'employeeId' | 'code' | 'name' | 'department'> }> {
    const q = productivityQuery.parse(raw);
    if (q.to < q.from) throw unprocessable('The end date is before the start date.');
    if ((new Date(q.to).getTime() - new Date(q.from).getTime()) / 86_400_000 > 93) throw unprocessable('Choose 93 days or fewer.', undefined, 'range_too_long');
    const pred = this.scope.predicate(this.authz.require('productivity.data.read'), sql`e.id`);
    const tz = await this.tz();
    const recordedOnly = await this.settings.get<boolean>('desktop.consider_recorded_time', false);
    const emp = sql`e.deleted_at is null and e.status = 'active' ${pred ? sql`and ${pred}` : sql``} ${q.employeeId ? sql`and e.id = ${q.employeeId}::uuid` : sql``} ${q.departmentId ? sql`and e.department_id = ${q.departmentId}::uuid` : sql``}`;
    const people = await this.db.q.execute(sql`
      select e.id, e.code, e.display_name as name, d.name as department,
             (coalesce((select sum(a.worked_minutes) from attendance_days a where a.employee_id = e.id and a.date between ${q.from}::date and ${q.to}::date and a.date is distinct from case when lp.type = 'in' then lp.d end), 0)
              -- a day still open is counted live, since its stored total was last computed at the latest punch
              + case when lp.type = 'in' and lp.d between ${q.from}::date and ${q.to}::date
                     then greatest(coalesce((select a2.worked_minutes from attendance_days a2 where a2.employee_id = e.id and a2.date = lp.d), 0), lp.m) else 0 end)::int as working
        from employees e left join departments d on d.id = e.department_id
        left join lateral (select p.type, p.attendance_date as d, extract(epoch from now() - p.at) / 60 as m from punches p where p.employee_id = e.id order by p.at desc limit 1) lp on true
       where ${emp} order by e.display_name limit 500`);
    const agg = await this.db.q.execute(sql`
      select b.employee_id, ${CLASS_SQL} as cls, sum(b.seconds)::int as seconds, sum(b.idle_seconds)::int as idle
        from activity_buckets b ${JOIN_CLASSES}
       where (b.start_at at time zone ${tz})::date between ${q.from}::date and ${q.to}::date
         and b.employee_id in (select e.id from employees e where ${emp})
       group by b.employee_id, ${CLASS_SQL}`);
    const by = new Map<string, { seconds: number; idleSeconds: number; appClass: AppClass }[]>();
    for (const r of agg.rows as { employee_id: string; cls: AppClass; seconds: number; idle: number }[]) {
      const list = by.get(r.employee_id) ?? [];
      list.push({ seconds: r.seconds, idleSeconds: r.idle, appClass: r.cls });
      by.set(r.employee_id, list);
    }
    const rows: SummaryRow[] = (people.rows as { id: string; code: string | null; name: string; department: string | null; working: number }[]).map((p) => {
      const r = computeProductivity({ workingMinutes: p.working, buckets: (by.get(p.id) ?? []).map((b) => ({ start: 0, activeSeconds: Math.max(0, b.seconds - b.idleSeconds), ...b })), considerRecordedTimeOnly: recordedOnly });
      return { employeeId: p.id, code: p.code, name: p.name, department: p.department, ...r };
    });
    const sum = (k: keyof Omit<SummaryRow, 'employeeId' | 'code' | 'name' | 'department' | 'productivityPct'>) => rows.reduce((s, r) => s + r[k], 0);
    const working = sum('workingMinutes');
    const productive = sum('productiveMinutes');
    const recorded = sum('recordedMinutes');
    const denom = recordedOnly ? recorded : working;
    return { from: q.from, to: q.to, rows, totals: { workingMinutes: working, recordedMinutes: recorded, unrecordedMinutes: sum('unrecordedMinutes'), idleMinutes: sum('idleMinutes'), productiveMinutes: productive, unproductiveMinutes: sum('unproductiveMinutes'), neutralMinutes: sum('neutralMinutes'), productivityPct: denom > 0 ? Math.min(100, Math.round((productive / denom) * 1000) / 10) : 0 } };
  }

  /** One employee, one day: where the time went, by application and by hour. */
  async day(raw: unknown) {
    const q = z.object({ employeeId: uuid, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(raw);
    const pred = this.scope.predicate(this.authz.require('productivity.data.read'), sql`e.id`);
    const ok = await this.db.q.execute(sql`select e.display_name as name from employees e where e.id = ${q.employeeId}::uuid and e.deleted_at is null ${pred ? sql`and ${pred}` : sql``}`);
    if (!ok.rows.length) throw forbidden('That employee is outside your scope.', 'out_of_scope');
    const tz = await this.tz();
    const where = sql`b.employee_id = ${q.employeeId}::uuid and (b.start_at at time zone ${tz})::date = ${q.date}::date`;
    const apps = await this.db.q.execute(sql`
      select coalesce(b.domain, b.app) as name, (b.domain is not null) as is_site, ${CLASS_SQL} as cls, sum(b.seconds)::int as seconds, sum(b.active_seconds)::int as active
        from activity_buckets b ${JOIN_CLASSES} where ${where} group by coalesce(b.domain, b.app), (b.domain is not null), ${CLASS_SQL} order by sum(b.active_seconds) desc limit 50`);
    const hours = await this.db.q.execute(sql`
      select extract(hour from b.start_at at time zone ${tz})::int as hour, ${CLASS_SQL} as cls, sum(b.active_seconds)::int as active, sum(b.idle_seconds)::int as idle
        from activity_buckets b ${JOIN_CLASSES} where ${where} group by 1, ${CLASS_SQL} order by 1`);
    const att = await this.db.q.execute(sql`select worked_minutes from attendance_days where employee_id = ${q.employeeId}::uuid and date = ${q.date}::date`);
    const working = (att.rows[0] as { worked_minutes: number } | undefined)?.worked_minutes ?? 0;
    const buckets = (hours.rows as { cls: AppClass; active: number; idle: number }[]).map((h) => ({ start: 0, seconds: h.active + h.idle, activeSeconds: h.active, idleSeconds: h.idle, appClass: h.cls }));
    return {
      employeeId: q.employeeId, employee: (ok.rows[0] as { name: string }).name, date: q.date,
      summary: computeProductivity({ workingMinutes: working, buckets, considerRecordedTimeOnly: await this.settings.get<boolean>('desktop.consider_recorded_time', false) }),
      apps: (apps.rows as { name: string; is_site: boolean; cls: AppClass; seconds: number; active: number }[]).map((a) => ({ name: a.name, site: a.is_site, class: a.cls, minutes: Math.round(a.seconds / 60), activeMinutes: Math.round(a.active / 60) })),
      hours: (hours.rows as { hour: number; cls: AppClass; active: number; idle: number }[]).map((h) => ({ hour: h.hour, class: h.cls, activeMinutes: Math.round(h.active / 60), idleMinutes: Math.round(h.idle / 60) })),
    };
  }
}

@RequiresModule('desktop_activity')
@Controller()
class ProductivityController {
  constructor(private readonly activity: ActivityService, private readonly productivity: ProductivityService) {}
  @Get('activity/policy') policy() { return this.activity.policy(); }
  @Post('activity/buckets') @HttpCode(200) ingest(@Body() b: unknown) { return this.activity.ingest(b); }
  @Get('productivity/summary') summary(@Query() q: unknown) { return this.productivity.summary(q); }
  @Get('productivity/day') day(@Query() q: unknown) { return this.productivity.day(q); }
}

@Module({ imports: [AccountsModule, crudModule(appClassifications)], controllers: [ProductivityController], providers: [ActivityService, ProductivityService] })
export class ProductivityModule implements OnModuleInit {
  constructor(private readonly provisioning: ProvisioningService, private readonly db: Db) {}
  onModuleInit(): void { this.provisioning.registerSeeder((ctx) => seedProductivityDefaults(this.db, ctx)); }
}

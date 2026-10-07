import { Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { enumerateDates } from '@trackrex/rules';
import { isoDate, uuid } from '@trackrex/schemas';
import { TenantDirectory } from '../../core/auth/tenant-directory.service.js';
import { currentStore } from '../../core/context.js';
import { Db } from '../../core/database/db.service.js';
import { notFound, unprocessable } from '../../core/errors.js';
import { Authz, ScopeResolver } from '../../core/rbac.service.js';
import { EnvelopeService } from '../../core/crypto/envelope.service.js';
import { reportByKey, REPORTS, type ReportColumn, type ReportDef, type ReportParams } from './report-catalog.js';

const MAX_ROWS = 5000;
const paramsSchema = z.object({
  from: isoDate.optional(), to: isoDate.optional(),
  departmentId: uuid.optional(), workLocationId: uuid.optional(), employeeId: uuid.optional(),
});

export interface ReportResult {
  report: { key: string; name: string; description: string; category: string };
  params: ReportParams;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  totals: Record<string, number> | null;
  truncated: boolean;
}

@Injectable()
export class ReportsService {
  constructor(private readonly db: Db, private readonly authz: Authz, private readonly scope: ScopeResolver, private readonly dir: TenantDirectory, private readonly envelope: EnvelopeService) {}

  catalog() {
    this.authz.require('reports.catalog.read');
    return REPORTS.map((r) => ({ key: r.key, name: r.name, description: r.description, category: r.category, columns: r.columns, maxDays: r.maxDays }));
  }

  private defaults(): { from: string; to: string } {
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    return { from: `${to.slice(0, 8)}01`, to };
  }

  async run(key: string, raw: Record<string, unknown>): Promise<ReportResult> {
    const def = reportByKey(key);
    if (!def) throw notFound('Report');
    const parsed = paramsSchema.parse(raw);
    const d = this.defaults();
    const params: ReportParams = { from: parsed.from ?? d.from, to: parsed.to ?? d.to, ...(parsed.departmentId ? { departmentId: parsed.departmentId } : {}), ...(parsed.workLocationId ? { workLocationId: parsed.workLocationId } : {}), ...(parsed.employeeId ? { employeeId: parsed.employeeId } : {}) };
    if (params.to < params.from) throw unprocessable('The end date is before the start date.', [{ path: 'to', message: 'Must not be before the start date' }]);
    const days = enumerateDates(params.from, params.to).length;
    if (days > def.maxDays) throw unprocessable(`This report covers at most ${def.maxDays} days at a time.`, [{ path: 'to', message: `Choose ${def.maxDays} days or fewer` }], 'range_too_long');

    const scope = this.authz.require('reports.catalog.read');
    const pred = this.scope.predicate(scope, sql`e.id`);
    const parts: SQL[] = [pred ?? sql`true`];
    if (params.departmentId) parts.push(sql`e.department_id = ${params.departmentId}::uuid`);
    if (params.workLocationId) parts.push(sql`e.work_location_id = ${params.workLocationId}::uuid`);
    if (params.employeeId) parts.push(sql`e.id = ${params.employeeId}::uuid`);
    const employees = sql.join(parts.map((p) => sql`(${p})`), sql` and `);
    const tenant = await this.dir.tenant(currentStore().tenantId!);
    const timezone = tenant?.timezone ?? 'UTC';

    const ctx = { params, timezone, employees };
    const all = def.load
      ? (await def.load(ctx, { db: this.db, envelope: this.envelope })).slice(0, MAX_ROWS + 1)
      : (await this.db.q.execute(sql`${def.sql!(ctx)} limit ${MAX_ROWS + 1}`)).rows as Record<string, string | number | null>[];
    const truncated = all.length > MAX_ROWS;
    const rows = truncated ? all.slice(0, MAX_ROWS) : all;
    return { report: { key: def.key, name: def.name, description: def.description, category: def.category }, params, columns: def.columns, rows, totals: totalsFor(def, rows), truncated };
  }
}

function totalsFor(def: ReportDef, rows: Record<string, string | number | null>[]): Record<string, number> | null {
  const sums = def.columns.filter((c) => c.sum);
  if (!sums.length || !rows.length) return null;
  return Object.fromEntries(sums.map((c) => [c.key, Math.round(rows.reduce((s, r) => s + (Number(r[c.key]) || 0), 0) * 100) / 100]));
}


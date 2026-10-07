import { Injectable } from '@nestjs/common';
import { sql, type SQL } from 'drizzle-orm';
import { addDays, enumerateDates } from '@trackrex/rules';
import { reportDefinitionSchema, type DatasetMeta, type ReportDefinition } from '@trackrex/schemas';
import { TenantDirectory } from '../../core/auth/tenant-directory.service.js';
import { currentStore } from '../../core/context.js';
import { Db } from '../../core/database/db.service.js';
import { unprocessable } from '../../core/errors.js';
import { Authz, ScopeResolver } from '../../core/rbac.service.js';
import { datasetByKey, DATASETS, metaOf } from './datasets.js';

export interface BuiltColumn { key: string; label: string; kind: 'dimension' | 'measure'; unit?: string }
export interface BuiltResult {
  definition: ReportDefinition;
  range: { from: string; to: string };
  columns: BuiltColumn[];
  rows: Record<string, string | number | null>[];
  truncated: boolean;
}

const MAX_DAYS = 366;

/** The dates a range means, in the company's timezone. */
export function resolveRange(range: ReportDefinition['range'], today: string): { from: string; to: string } {
  switch (range.mode) {
    case 'last_days': return { from: addDays(today, -(range.days - 1)), to: today };
    case 'this_month': return { from: `${today.slice(0, 8)}01`, to: today };
    case 'last_month': {
      const first = `${today.slice(0, 8)}01`;
      const lastDay = addDays(first, -1);
      return { from: `${lastDay.slice(0, 8)}01`, to: lastDay };
    }
    case 'custom': return { from: range.from, to: range.to };
  }
}

/**
 * Runs a report someone designed. The design only ever names things from a dataset's allow-list; the SQL is
 * assembled here from fixed fragments with every value passed as a parameter, and the viewer's data scope is applied
 * to every query, whoever built the report.
 */
@Injectable()
export class ReportBuilderService {
  constructor(private readonly db: Db, private readonly authz: Authz, private readonly scope: ScopeResolver, private readonly dir: TenantDirectory) {}

  /** Datasets the viewer's role may read, and their fields. */
  datasets(): DatasetMeta[] {
    return DATASETS.filter((d) => this.authz.has(d.permission)).map(metaOf);
  }

  validate(raw: unknown): ReportDefinition {
    const parsed = reportDefinitionSchema.safeParse(raw);
    if (!parsed.success) throw unprocessable('That report is not valid.', parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
    const def = parsed.data;
    const ds = datasetByKey(def.dataset);
    if (!ds) throw unprocessable('Choose a data source.', [{ path: 'dataset', message: 'Unknown data source' }]);
    const bad = (path: string, message: string) => { throw unprocessable(message, [{ path, message }]); };
    def.dimensions.forEach((d, i) => { if (!ds.dimensions[d]) bad(`dimensions.${i}`, `“${d}” is not available for ${ds.label}`); });
    if (new Set(def.dimensions).size !== def.dimensions.length) bad('dimensions', 'Each grouping can be used once');
    def.measures.forEach((m, i) => { if (!ds.measures[m]) bad(`measures.${i}`, `“${m}” is not available for ${ds.label}`); });
    def.filters.forEach((f, i) => {
      const fd = ds.filters[f.field];
      if (!fd) return bad(`filters.${i}.field`, `“${f.field}” cannot be filtered for ${ds.label}`);
      if (fd.kind === 'choice' && fd.options) {
        const vals = Array.isArray(f.value) ? f.value : [String(f.value)];
        if (vals.some((v) => !fd.options!.includes(v))) bad(`filters.${i}.value`, `Choose from ${fd.options.join(', ')}`);
      }
      if ((f.op === 'gt' || f.op === 'gte' || f.op === 'lt' || f.op === 'lte') && fd.kind !== 'number') bad(`filters.${i}.op`, 'Greater and less than only work on numbers');
      if (f.op === 'contains' && fd.kind === 'number') bad(`filters.${i}.op`, '“contains” only works on text');
    });
    if (def.sort && ![...def.dimensions, ...def.measures].includes(def.sort.key)) bad('sort.key', 'Sort by something that is shown');
    if (def.range.mode === 'custom') {
      if (def.range.to < def.range.from) bad('range.to', 'The end date is before the start date');
      if (enumerateDates(def.range.from, def.range.to).length > MAX_DAYS) bad('range.to', `A report covers at most ${MAX_DAYS} days`);
    }
    return def;
  }

  async run(raw: unknown): Promise<BuiltResult> {
    const def = this.validate(raw);
    const ds = datasetByKey(def.dataset)!;
    const scope = this.authz.require(ds.permission);
    const tz = (await this.dir.tenant(currentStore().auth!.tenantId!))?.timezone ?? 'UTC';
    const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
    const range = resolveRange(def.range, today);

    const select: SQL[] = [];
    def.dimensions.forEach((k) => select.push(sql`${ds.dimensions[k]!.sql(tz)} as ${sql.identifier(k)}`));
    def.measures.forEach((k) => select.push(sql`${ds.measures[k]!.sql} as ${sql.identifier(k)}`));
    const where: SQL[] = [sql`${ds.day(tz)} between ${range.from}::date and ${range.to}::date`];
    const pred = this.scope.predicate(scope, ds.employee);
    if (pred) where.push(pred);
    for (const f of def.filters) {
      const col = ds.filters[f.field]!.sql(tz);
      const vals = Array.isArray(f.value) ? f.value : [f.value];
      switch (f.op) {
        case 'eq': where.push(sql`${col}::text = ${String(vals[0])}`); break;
        case 'ne': where.push(sql`${col}::text <> ${String(vals[0])}`); break;
        case 'in': where.push(sql`${col}::text = any(${sql.param(vals.map(String))}::text[])`); break;
        case 'contains': where.push(sql`lower(${col}::text) like ${`%${String(vals[0]).toLowerCase().replace(/[%_\\]/g, '\\$&')}%`}`); break;
        case 'gt': where.push(sql`${col} > ${Number(vals[0])}`); break;
        case 'gte': where.push(sql`${col} >= ${Number(vals[0])}`); break;
        case 'lt': where.push(sql`${col} < ${Number(vals[0])}`); break;
        case 'lte': where.push(sql`${col} <= ${Number(vals[0])}`); break;
      }
    }
    const group = def.dimensions.length ? sql`group by ${sql.join(def.dimensions.map((_, i) => sql.raw(String(i + 1))), sql`, `)}` : sql``;
    const order = def.sort ? sql`order by ${sql.identifier(def.sort.key)} ${sql.raw(def.sort.dir === 'asc' ? 'asc' : 'desc')} nulls last`
      : def.dimensions.length ? sql`order by ${sql.join(def.dimensions.map((k) => sql.identifier(k)), sql`, `)}` : sql``;
    const res = await this.db.q.execute(sql`select ${sql.join(select, sql`, `)} from ${ds.from(tz)} where ${sql.join(where.map((w) => sql`(${w})`), sql` and `)} ${group} ${order} limit ${def.limit + 1}`);
    const all = res.rows as Record<string, string | number | null>[];
    const truncated = all.length > def.limit;
    return {
      definition: def, range,
      columns: [
        ...def.dimensions.map((k): BuiltColumn => ({ key: k, label: ds.dimensions[k]!.label, kind: 'dimension' })),
        ...def.measures.map((k): BuiltColumn => ({ key: k, label: ds.measures[k]!.label, kind: 'measure', unit: ds.measures[k]!.unit })),
      ],
      rows: truncated ? all.slice(0, def.limit) : all, truncated,
    };
  }
}


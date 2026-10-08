import { and, asc, desc, eq, gt, gte, ilike, inArray, isNotNull, isNull, lt, lte, ne, notInArray, or, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { decodeCursor, encodeCursor, type EntityKit, type Filter, type ListQuery } from '@trackrex/schemas';
import type { Db } from '../../core/database/db.service.js';
import { tableFromKit, type KitTable } from './table-from-kit.js';

export type Row = Record<string, unknown> & { id: string; version: number };

export interface ListResult {
  rows: Row[];
  nextCursor: string | null;
  total?: number;
}

export class CrudRepository {
  readonly table: KitTable;
  private readonly cols: Record<string, PgColumn>;
  /** Dynamic tables cannot be statically typed; rows are Record<string, unknown> by design. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected get t(): any { return this.table; }

  constructor(readonly kit: EntityKit, protected readonly db: Db) {
    this.table = tableFromKit(kit);
    this.cols = this.table as unknown as Record<string, PgColumn>;
  }

  col(field: string): PgColumn {
    const c = this.cols[field];
    if (!c) throw new Error(`Unknown column ${field} on ${this.kit.def.key}`);
    return c;
  }

  private filterToSql(f: Filter): SQL | undefined {
    const c = this.col(f.field);
    const v = f.value as never;
    const arr = f.value as unknown[];
    switch (f.op) {
      case 'eq': return eq(c, v);
      case 'ne': return ne(c, v);
      case 'in': return inArray(c, arr as never[]);
      case 'nin': return notInArray(c, arr as never[]);
      case 'gt': return gt(c, v);
      case 'gte': return gte(c, v);
      case 'lt': return lt(c, v);
      case 'lte': return lte(c, v);
      case 'between': return and(gte(c, arr[0] as never), lte(c, arr[1] as never));
      case 'contains': {
        const kind = this.kit.def.fields[f.field]?.kind;
        return kind === 'multiselect' ? sql`${c} @> ${sql.param([String(f.value)])}::text[]` : ilike(c, `%${String(f.value).replace(/[%_\\]/g, '\\$&')}%`);
      }
      case 'empty': return f.value ? isNull(c) : isNotNull(c);
    }
  }

  protected where(q: ListQuery, extra?: SQL): SQL | undefined {
    const parts: (SQL | undefined)[] = [];
    if (q.deleted === 'exclude') parts.push(isNull(this.col('deletedAt')));
    if (q.deleted === 'only') parts.push(isNotNull(this.col('deletedAt')));
    for (const f of q.filters) parts.push(this.filterToSql(f));
    if (q.q && this.kit.searchable.length) {
      const like = `%${q.q.toLowerCase().replace(/[%_\\]/g, '\\$&')}%`;
      parts.push(or(...this.kit.searchable.map((k) => sql`lower(${this.col(k)}) like ${like}`)));
    }
    if (extra) parts.push(extra);
    return and(...parts.filter((p): p is SQL => !!p));
  }

  private keyset(q: ListQuery, cursor: { v: unknown[]; id: string }): SQL {
    const keys = q.sort;
    const ors: SQL[] = [];
    for (let i = 0; i <= keys.length; i++) {
      const eqs: SQL[] = keys.slice(0, i).map((k, j) => sql`${this.col(k.field)} = ${cursor.v[j]}`);
      let last: SQL;
      if (i < keys.length) {
        const k = keys[i]!;
        last = k.dir === 'asc' ? sql`${this.col(k.field)} > ${cursor.v[i]}` : sql`${this.col(k.field)} < ${cursor.v[i]}`;
      } else {
        last = sql`${this.col('id')} > ${cursor.id}::uuid`;
      }
      ors.push(and(...eqs, last)!);
    }
    return or(...ors)!;
  }

  async list(q: ListQuery, extra?: SQL): Promise<ListResult> {
    const tx = this.db.q;
    const base = this.where(q, extra);
    const cursorSql = q.cursor ? this.keyset(q, decodeCursor(q.cursor)) : undefined;
    const rows = (await tx
      .select()
      .from(this.t)
      .where(and(base, cursorSql))
      .orderBy(...q.sort.map((k) => (k.dir === 'asc' ? asc(this.col(k.field)) : desc(this.col(k.field)))), asc(this.col('id')))
      .limit(q.limit + 1)) as Row[];
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const last = page[page.length - 1];
    const result: ListResult = {
      rows: page,
      nextCursor: hasMore && last ? encodeCursor(q.sort.map((k) => last[k.field]), last.id) : null,
    };
    if (q.includeTotal) {
      const [c] = await tx.select({ n: sql<number>`count(*)::int` }).from(this.t).where(base);
      result.total = c?.n ?? 0;
    }
    return result;
  }

  async get(id: string, extra?: SQL, includeDeleted = false): Promise<Row | undefined> {
    const [row] = await this.db.q
      .select()
      .from(this.t)
      .where(and(eq(this.col('id'), id), includeDeleted ? undefined : isNull(this.col('deletedAt')), extra));
    return row as Row | undefined;
  }

  async getMany(ids: string[]): Promise<Row[]> {
    if (!ids.length) return [];
    return (await this.db.q.select().from(this.t).where(inArray(this.col('id'), ids))) as Row[];
  }

  async insert(values: Record<string, unknown>): Promise<Row> {
    const rows = (await this.db.q.insert(this.t).values(values as never).returning()) as Row[];
    return rows[0]!;
  }

  async update(id: string, values: Record<string, unknown>, expectedVersion?: number): Promise<Row | undefined> {
    const [row] = await this.db.q
      .update(this.t)
      .set({ ...values, updatedAt: sql`now()`, version: sql`${this.col('version')} + 1` } as never)
      .where(and(eq(this.col('id'), id), isNull(this.col('deletedAt')), expectedVersion === undefined ? undefined : eq(this.col('version'), expectedVersion)))
      .returning();
    return row as Row | undefined;
  }

  async softDelete(id: string, userId: string, reason: string | null): Promise<Row | undefined> {
    const [row] = await this.db.q
      .update(this.t)
      .set({ deletedAt: sql`now()`, deletedBy: userId, deleteReason: reason, updatedAt: sql`now()`, version: sql`${this.col('version')} + 1` } as never)
      .where(and(eq(this.col('id'), id), isNull(this.col('deletedAt'))))
      .returning();
    return row as Row | undefined;
  }

  async restore(id: string): Promise<Row | undefined> {
    const [row] = await this.db.q
      .update(this.t)
      .set({ deletedAt: null, deletedBy: null, deleteReason: null, updatedAt: sql`now()`, version: sql`${this.col('version')} + 1` } as never)
      .where(and(eq(this.col('id'), id), isNotNull(this.col('deletedAt'))))
      .returning();
    return row as Row | undefined;
  }

  /** Permanently remove rows deleted more than `days` ago. Run by the retention job. */
  async purge(days: number): Promise<number> {
    const res = await this.db.q.execute(sql`delete from ${this.t} where deleted_at < now() - make_interval(days => ${days})`);
    return res.rowCount ?? 0;
  }
}

import { Inject, Injectable } from '@nestjs/common';
import type { SQL } from 'drizzle-orm';
import { buildListQuery, type EntityKit, type ListQuery } from '@trackrex/schemas';
import { currentAuth, currentStore } from '../../core/context.js';
import { AuditService, diffRecords } from '../../core/audit.service.js';
import { conflict, notFound, unprocessable } from '../../core/errors.js';
import { Authz, ScopeResolver } from '../../core/rbac.service.js';
import { SequencesService } from '../../core/sequences.service.js';
import { OutboxService } from '../../core/outbox.service.js';
import { CrudRepository, type ListResult, type Row } from './crud.repository.js';

export interface CrudDeps {
  repo: CrudRepository;
  authz: Authz;
  scope: ScopeResolver;
  audit: AuditService;
  sequences: SequencesService;
  outbox: OutboxService;
}

export const MAX_BULK = 200;

/**
 * Create, read, update, soft delete, restore, bulk actions and audit for one entity. Entity services
 * extend this and override only the hooks that differ.
 */
@Injectable()
export class CrudService {
  readonly kit: EntityKit;
  protected readonly repo: CrudRepository;
  protected readonly authz: Authz;
  protected readonly scope: ScopeResolver;
  protected readonly audit: AuditService;
  protected readonly sequences: SequencesService;
  protected readonly outbox: OutboxService;

  constructor(@Inject('CRUD_DEPS') deps: CrudDeps) {
    this.repo = deps.repo;
    this.kit = deps.repo.kit;
    this.authz = deps.authz;
    this.scope = deps.scope;
    this.audit = deps.audit;
    this.sequences = deps.sequences;
    this.outbox = deps.outbox;
  }

  /* ---------- hooks ---------- */
  protected async beforeCreate(input: Record<string, unknown>): Promise<Record<string, unknown>> { return input; }
  protected async afterCreate(_row: Row): Promise<void> {}
  protected async beforeUpdate(_existing: Row, patch: Record<string, unknown>): Promise<Record<string, unknown>> { return patch; }
  protected async afterUpdate(_before: Row, _after: Row): Promise<void> {}
  protected async beforeDelete(_row: Row): Promise<void> {}
  protected async afterDelete(_row: Row): Promise<void> {}
  /** Extra predicate on top of the viewer's data scope (e.g. hide system rows). */
  protected extraWhere(): SQL | undefined { return undefined; }

  protected get perms() { return this.kit.permissions; }

  /** Data-scope predicate for the current viewer, for entities owned by an employee. */
  protected scopePredicate(permission: string, directOnly = false): SQL | undefined {
    const scope = this.authz.require(permission);
    const owner = this.kit.def.ownerColumn;
    if (this.kit.def.scoped !== 'employee' || !owner) return undefined;
    return this.scope.predicate(scope, this.repo.col(owner) as unknown as SQL, { directOnly });
  }

  private combined(permission: string, directOnly = false): SQL | undefined {
    const s = this.scopePredicate(permission, directOnly);
    const e = this.extraWhere();
    if (s && e) return sqlAnd(s, e);
    return s ?? e;
  }

  /* ---------- reads ---------- */
  parseQuery(query: Record<string, unknown>): ListQuery {
    return buildListQuery(query, this.kit);
  }

  async list(q: ListQuery): Promise<ListResult> {
    return this.repo.list(q, this.combined(this.perms.read, q.directOnly));
  }

  async get(id: string): Promise<Row> {
    const row = await this.repo.get(id, this.combined(this.perms.read), false);
    if (!row) throw notFound(this.kit.def.singular);
    return row;
  }

  /** Include soft-deleted rows when restoring or showing history. */
  async getAny(id: string): Promise<Row> {
    const row = await this.repo.get(id, this.combined(this.perms.read), true);
    if (!row) throw notFound(this.kit.def.singular);
    return row;
  }

  /* ---------- writes ---------- */
  async create(body: unknown): Promise<Row> {
    this.authz.require(this.perms.create);
    const parsed = this.kit.createSchema.parse(body) as Record<string, unknown>;
    const auth = currentAuth();
    const input = await this.beforeCreate(parsed);
    const code = this.kit.def.codePrefix ? await this.sequences.next(this.kit.def.key, this.kit.def.codePrefix) : undefined;
    const row = await this.repo.insert({
      ...input,
      tenantId: currentStore().tenantId,
      ...(code ? { code } : {}),
      createdBy: auth.userId,
      updatedBy: auth.userId,
    });
    await this.audit.record({ entity: this.kit.def.key, entityId: row.id, action: 'created', changes: diffRecords(null, row) });
    await this.outbox.emit(`${this.kit.def.resource}.created`, { id: row.id });
    await this.afterCreate(row);
    return row;
  }

  async update(id: string, body: unknown): Promise<Row> {
    this.authz.require(this.perms.update);
    const raw = (body ?? {}) as Record<string, unknown>;
    const { version, ...fields } = raw;
    if (version !== undefined && (!Number.isInteger(version) || (version as number) < 1)) throw unprocessable('version must be a positive integer.');
    const patch = this.kit.updateSchema.parse(fields) as Record<string, unknown>;
    const before = await this.get(id);
    this.assertWritable(before, this.perms.update);
    const next = await this.beforeUpdate(before, patch);
    const after = await this.repo.update(id, { ...next, updatedBy: currentAuth().userId }, version as number | undefined);
    if (!after) {
      throw version !== undefined
        ? conflict('version_conflict', `This ${this.kit.def.singular.toLowerCase()} was changed by someone else. Reload and try again.`)
        : notFound(this.kit.def.singular);
    }
    const changes = diffRecords(before, after);
    if (Object.keys(changes).length) await this.audit.record({ entity: this.kit.def.key, entityId: id, action: 'updated', changes });
    await this.afterUpdate(before, after);
    return after;
  }

  async remove(id: string, reason?: string | null): Promise<Row> {
    this.authz.require(this.perms.delete);
    const before = await this.get(id);
    this.assertWritable(before, this.perms.delete);
    await this.beforeDelete(before);
    const row = await this.repo.softDelete(id, currentAuth().userId, reason?.slice(0, 500) ?? null);
    if (!row) throw notFound(this.kit.def.singular);
    await this.audit.record({ entity: this.kit.def.key, entityId: id, action: 'deleted', changes: { reason: { old: null, new: reason ?? null } } });
    await this.outbox.emit(`${this.kit.def.resource}.deleted`, { id });
    await this.afterDelete(row);
    return row;
  }

  async restore(id: string): Promise<Row> {
    this.authz.require(this.perms.restore);
    const existing = await this.getAny(id);
    if (!existing.deletedAt) throw conflict('not_deleted', `This ${this.kit.def.singular.toLowerCase()} is not in the recycle bin.`);
    const row = await this.repo.restore(id);
    if (!row) throw notFound(this.kit.def.singular);
    await this.audit.record({ entity: this.kit.def.key, entityId: id, action: 'restored' });
    return row;
  }

  async bulk(action: 'delete' | 'restore' | 'update', ids: string[], payload?: { reason?: string; patch?: Record<string, unknown> }): Promise<{ id: string; ok: true }[]> {
    if (!ids.length) throw unprocessable('Select at least one record.');
    if (ids.length > MAX_BULK) throw unprocessable(`Select at most ${MAX_BULK} records at a time.`);
    const out: { id: string; ok: true }[] = [];
    for (const id of ids) {
      if (action === 'delete') await this.remove(id, payload?.reason);
      else if (action === 'restore') await this.restore(id);
      else await this.update(id, payload?.patch ?? {});
      out.push({ id, ok: true });
    }
    return out;
  }

  /** Scoped viewers may read wider than they may write; check the row is inside the write scope. */
  protected assertWritable(_row: Row, _permission: string): void {}

  async export(q: ListQuery, maxRows = 10_000): Promise<{ columns: { key: string; label: string }[]; rows: Row[] }> {
    this.authz.require(this.perms.export);
    const rows: Row[] = [];
    let cursor: string | undefined = q.cursor;
    while (rows.length < maxRows) {
      const page = await this.repo.list({ ...q, limit: 100, ...(cursor ? { cursor } : {}), includeTotal: false }, this.combined(this.perms.read, q.directOnly));
      rows.push(...page.rows);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    if (rows.length >= maxRows) throw unprocessable(`Exports are limited to ${maxRows} rows here. Narrow the filters or use the report center.`, undefined, 'export_too_large');
    return { columns: [{ key: 'code', label: 'Code' }, ...this.kit.columns.filter((c) => c.kind !== 'json').map((c) => ({ key: c.key, label: c.label }))].filter((c) => c.key !== 'code' || this.kit.def.codePrefix), rows };
  }
}

import { and as andOp } from 'drizzle-orm';
function sqlAnd(a: SQL, b: SQL): SQL {
  return andOp(a, b)!;
}

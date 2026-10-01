import type { EntityKit, FieldDef } from '@trackrex/schemas';
import { boolean, doublePrecision, integer, jsonb, pgTable, text, time, timestamp, uuid, type PgColumnBuilderBase } from 'drizzle-orm/pg-core';
import { snake, tableNameFor } from './entity-sql.js';

const ts = (n: string) => timestamp(n, { withTimezone: true, mode: 'string' });

function column(key: string, d: FieldDef): PgColumnBuilderBase {
  const n = snake(key);
  switch (d.kind) {
    case 'number': return doublePrecision(n);
    case 'boolean': return boolean(n);
    case 'date': return text(n); // pg date parsed to 'YYYY-MM-DD' by the driver
    case 'time': return time(n);
    case 'datetime': return ts(n);
    case 'multiselect': return text(n).array();
    case 'ref': return uuid(n);
    case 'json': return jsonb(n);
    default: return text(n);
  }
}

/** Drizzle table derived from an entity definition; the SQL migration is generated from the same source. */
export function tableFromKit(kit: EntityKit) {
  const cols: Record<string, PgColumnBuilderBase> = {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    ...(kit.def.codePrefix ? { code: text('code') } : {}),
  };
  for (const [key, d] of Object.entries(kit.def.fields)) cols[key] = column(key, d);
  Object.assign(cols, {
    createdAt: ts('created_at').notNull().defaultNow(),
    createdBy: uuid('created_by'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
    updatedBy: uuid('updated_by'),
    deletedAt: ts('deleted_at'),
    deletedBy: uuid('deleted_by'),
    deleteReason: text('delete_reason'),
    version: integer('version').notNull().default(1),
  });
  return pgTable(tableNameFor(kit), cols as never);
}

export type KitTable = ReturnType<typeof tableFromKit>;

import { z } from 'zod';
import { OPS_BY_KIND, type EntityKit, type FilterOp } from './entity.js';

export interface Filter {
  field: string;
  op: FilterOp;
  value: unknown;
}

export interface SortKey {
  field: string;
  dir: 'asc' | 'desc';
}

export interface ListQuery {
  limit: number;
  cursor?: string;
  includeTotal: boolean;
  q?: string;
  sort: SortKey[];
  filters: Filter[];
  deleted: 'exclude' | 'include' | 'only';
  /** Restrict to direct reportees even when the viewer's scope is wider. */
  directOnly: boolean;
}

export const MAX_LIMIT = 100;
export const PAGE_SIZES = [25, 50, 100] as const;

const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** `-created_at,name` to sort keys (field names are camelCase on the wire). */
export function parseSort(raw: string | undefined, allowed: Set<string>, fallback = '-createdAt'): SortKey[] {
  const parts = (raw?.length ? raw : fallback).split(',').map((s) => s.trim()).filter(Boolean);
  const out: SortKey[] = [];
  for (const p of parts) {
    const dir = p.startsWith('-') ? 'desc' : 'asc';
    const field = camel(p.replace(/^[-+]/, ''));
    if (!allowed.has(field)) throw new QueryError('invalid_sort', `Cannot sort by "${field}".`);
    out.push({ field, dir });
  }
  return out;
}

export class QueryError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

function coerce(kind: string, op: FilterOp, raw: string): unknown {
  const one = (s: string): unknown => {
    if (kind === 'number') {
      const n = Number(s);
      if (Number.isNaN(n)) throw new QueryError('invalid_filter', `"${s}" is not a number.`);
      return n;
    }
    if (kind === 'boolean') return s === 'true' || s === '1';
    return s;
  };
  if (op === 'in' || op === 'nin' || op === 'between') return raw.split(',').map(one);
  if (op === 'empty') return raw === 'true' || raw === '1' || raw === '';
  return one(raw);
}

/**
 * Parse `filter[field][op]=value` pairs (already extracted from the query string) against an entity.
 * Unknown fields and operators the field type does not support are rejected with a clear error.
 */
export function parseFilters(raw: Record<string, Record<string, string>>, kit: EntityKit): Filter[] {
  const out: Filter[] = [];
  for (const [field, ops] of Object.entries(raw)) {
    const def = kit.filterable[field];
    if (!def) throw new QueryError('invalid_filter', `Cannot filter by "${field}".`);
    for (const [op, value] of Object.entries(ops)) {
      if (!(OPS_BY_KIND[def.kind] as string[]).includes(op)) {
        throw new QueryError('invalid_filter', `"${field}" does not support the "${op}" operator.`);
      }
      const v = coerce(def.kind, op as FilterOp, value);
      if (op === 'between' && (!Array.isArray(v) || v.length !== 2)) {
        throw new QueryError('invalid_filter', '"between" needs two comma-separated values.');
      }
      out.push({ field, op: op as FilterOp, value: v });
    }
  }
  return out;
}

/** Group Express-style `filter[a][eq]` keys. Accepts both flat and already-nested objects. */
export function extractFilterParams(query: Record<string, unknown>): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  const nested = query.filter;
  if (nested && typeof nested === 'object') {
    for (const [field, ops] of Object.entries(nested as Record<string, unknown>)) {
      if (ops && typeof ops === 'object') {
        for (const [op, v] of Object.entries(ops as Record<string, unknown>)) {
          (out[camel(field)] ??= {})[op] = String(v);
        }
      } else if (ops !== undefined) (out[camel(field)] ??= {}).eq = String(ops);
    }
  }
  for (const [k, v] of Object.entries(query)) {
    const m = /^filter\[([^\]]+)\]\[([^\]]+)\]$/.exec(k);
    if (m) (out[camel(m[1]!)] ??= {})[m[2]!] = String(v);
  }
  return out;
}

export function buildListQuery(query: Record<string, unknown>, kit: EntityKit): ListQuery {
  const sortable = new Set(['id', 'createdAt', 'updatedAt', ...kit.columns.filter((c) => c.sortable).map((c) => c.key)]);
  const limitRaw = Number(query.limit ?? 50);
  if (!Number.isInteger(limitRaw) || limitRaw < 1) throw new QueryError('invalid_limit', 'limit must be a positive integer.');
  const deleted = (query.deleted as string | undefined) ?? 'exclude';
  if (!['exclude', 'include', 'only'].includes(deleted)) throw new QueryError('invalid_deleted', 'deleted must be exclude, include or only.');
  return {
    limit: Math.min(limitRaw, MAX_LIMIT),
    ...(typeof query.cursor === 'string' && query.cursor ? { cursor: query.cursor } : {}),
    includeTotal: query.include_total === 'true' || query.includeTotal === 'true',
    ...(typeof query.q === 'string' && query.q.trim() ? { q: query.q.trim() } : {}),
    sort: parseSort(query.sort as string | undefined, sortable, kit.def.defaultSort ?? '-createdAt'),
    filters: parseFilters(extractFilterParams(query), kit),
    deleted: deleted as ListQuery['deleted'],
    directOnly: query.directOnly === 'true' || query.direct_only === 'true',
  };
}

/** Inverse of buildListQuery for the web: serialise state into URL search params. */
export function toSearchParams(q: Partial<Pick<ListQuery, 'q' | 'sort' | 'filters' | 'limit' | 'deleted' | 'directOnly'>> & { cursor?: string; includeTotal?: boolean }): URLSearchParams {
  const p = new URLSearchParams();
  if (q.q) p.set('q', q.q);
  if (q.limit) p.set('limit', String(q.limit));
  if (q.cursor) p.set('cursor', q.cursor);
  if (q.includeTotal) p.set('include_total', 'true');
  if (q.deleted && q.deleted !== 'exclude') p.set('deleted', q.deleted);
  if (q.directOnly) p.set('direct_only', 'true');
  if (q.sort?.length) p.set('sort', q.sort.map((s) => (s.dir === 'desc' ? '-' : '') + s.field).join(','));
  for (const f of q.filters ?? []) {
    const v = Array.isArray(f.value) ? f.value.join(',') : String(f.value);
    p.set(`filter[${f.field}][${f.op}]`, v);
  }
  return p;
}

export const cursorSchema = z.object({ v: z.array(z.unknown()), id: z.string() });

export function encodeCursor(values: unknown[], id: string): string {
  const json = JSON.stringify({ v: values, id });
  const b64 = typeof Buffer !== 'undefined' ? Buffer.from(json).toString('base64') : btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeCursor(cursor: string): { v: unknown[]; id: string } {
  try {
    const b64 = cursor.replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof Buffer !== 'undefined' ? Buffer.from(b64, 'base64').toString('utf8') : decodeURIComponent(escape(atob(b64)));
    return cursorSchema.parse(JSON.parse(json));
  } catch {
    throw new QueryError('invalid_cursor', 'The cursor is not valid.');
  }
}

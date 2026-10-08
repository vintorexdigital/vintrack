import { z } from 'zod';
import { e164, hexColor, hhmm, isoDate, uuid } from './common.js';

export type FieldKind =
  | 'text' | 'textarea' | 'number' | 'boolean' | 'date' | 'time' | 'datetime' | 'email' | 'phone'
  | 'select' | 'multiselect' | 'ref' | 'multiref' | 'color' | 'json';

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  kind: FieldKind;
  label: string;
  required?: boolean;
  help?: string;
  options?: FieldOption[];
  /** Another entity key; renders an async combobox and validates as a UUID. */
  ref?: { entity: string; labelField?: string };
  min?: number;
  max?: number;
  maxLength?: number;
  default?: unknown;
  /** Table column shown by default. */
  list?: boolean;
  filter?: boolean;
  sort?: boolean;
  /** Included in free-text search (pg_trgm). */
  search?: boolean;
  /** JSON fields validate against this schema; the form renders a custom editor named by `editor`. */
  jsonSchema?: z.ZodType;
  editor?: string;
  immutable?: boolean;
  hideInForm?: boolean;
  section?: string;
  width?: 'sm' | 'md' | 'lg' | 'full';
}

type Opts = Partial<Omit<FieldDef, 'kind' | 'label'>>;
const mk = (kind: FieldKind) => (label: string, o: Opts = {}): FieldDef => ({ kind, label, ...o });

/** Field builders: the single place a field's type, label and UI hints are declared. */
export const f = {
  text: mk('text'),
  textarea: mk('textarea'),
  number: mk('number'),
  boolean: mk('boolean'),
  date: mk('date'),
  time: mk('time'),
  datetime: mk('datetime'),
  email: mk('email'),
  phone: mk('phone'),
  color: mk('color'),
  json: (label: string, jsonSchema: z.ZodType, o: Opts = {}): FieldDef => mk('json')(label, { jsonSchema, ...o }),
  select: (label: string, options: FieldOption[] | readonly string[], o: Opts = {}): FieldDef =>
    mk('select')(label, {
      options: options.map((x) => (typeof x === 'string' ? { value: x, label: sentence(x) } : x)),
      ...o,
    }),
  multiselect: (label: string, options: FieldOption[] | readonly string[], o: Opts = {}): FieldDef =>
    mk('multiselect')(label, {
      options: options.map((x) => (typeof x === 'string' ? { value: x, label: sentence(x) } : x)),
      ...o,
    }),
  multiref: (label: string, entity: string, o: Opts = {}): FieldDef => mk('multiref')(label, { ref: { entity }, ...o }),
  ref: (label: string, entity: string, o: Opts & { labelField?: string } = {}): FieldDef => {
    const { labelField, ...rest } = o;
    return mk('ref')(label, { ref: { entity, ...(labelField ? { labelField } : {}) }, ...rest });
  },
};

export function sentence(s: string): string {
  const t = s.replace(/[_-]+/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function unwrapDefault(s: z.ZodType): z.ZodType {
  return s instanceof z.ZodDefault ? (s.def.innerType as z.ZodType) : s;
}

function zodFor(name: string, d: FieldDef): z.ZodType {
  const req = (msg = `${d.label} is required`) => msg;
  let t: z.ZodType;
  switch (d.kind) {
    case 'text': {
      let s = z.string().trim().max(d.maxLength ?? 200);
      if (d.required) s = s.min(1, req());
      t = s;
      break;
    }
    case 'textarea': t = z.string().trim().max(d.maxLength ?? 4000); break;
    case 'number': {
      let n = z.number();
      if (d.min !== undefined) n = n.min(d.min);
      if (d.max !== undefined) n = n.max(d.max);
      t = n;
      break;
    }
    case 'boolean': t = z.boolean(); break;
    case 'date': t = isoDate; break;
    case 'time': t = hhmm; break;
    case 'datetime': t = z.iso.datetime({ offset: true }); break;
    case 'email': t = z.string().trim().toLowerCase().email('Enter a valid email address'); break;
    case 'phone': t = e164; break;
    case 'color': t = hexColor; break;
    case 'ref': t = uuid; break;
    case 'multiref': t = z.array(uuid).max(200); break;
    case 'json': t = d.jsonSchema ?? z.unknown(); break;
    case 'select': {
      const values = (d.options ?? []).map((o) => o.value) as [string, ...string[]];
      t = z.enum(values);
      break;
    }
    case 'multiselect': {
      const values = (d.options ?? []).map((o) => o.value) as [string, ...string[]];
      t = z.array(z.enum(values));
      break;
    }
  }
  void name;
  // JSON fields carry their own defaults; wrapping them in nullish() would skip the inner default.
  return d.required || d.kind === 'json' ? t : t.nullish();
}

export interface EntityDef<F extends Record<string, FieldDef> = Record<string, FieldDef>> {
  /** kebab-case plural, also the URL segment: 'leave-types'. */
  key: string;
  singular: string;
  plural: string;
  /** Permission module and resource: `${module}.${resource}.${action}`. */
  module: string;
  resource: string;
  /** Route under the console: '/leave/types'. */
  path: string;
  /** Prefix for human-readable codes, e.g. 'EMP' gives EMP-0001. Omit for entities without codes. */
  codePrefix?: string;
  titleField: string;
  fields: F;
  /** Fields that must be unique per tenant among non-deleted rows. */
  unique?: string[];
  /** Column holding the employee a row belongs to, for data-scope predicates. Use 'id' for employees. */
  ownerColumn?: string;
  defaultSort?: string;
  softDelete?: boolean;
  /** Modules/bundles that must be licensed for this entity (module key). */
  licenseModule?: string;
  empty: { title: string; hint: string };
  /** Scope applied by default for non-admin viewers. */
  scoped?: 'employee' | 'none';
}

export type FilterOp = 'eq' | 'ne' | 'in' | 'nin' | 'gt' | 'gte' | 'lt' | 'lte' | 'between' | 'contains' | 'empty';

export const OPS_BY_KIND: Record<FieldKind, FilterOp[]> = {
  text: ['eq', 'ne', 'in', 'nin', 'contains', 'empty'],
  textarea: ['contains', 'empty'],
  number: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'in', 'empty'],
  boolean: ['eq'],
  date: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'empty'],
  time: ['eq', 'gt', 'gte', 'lt', 'lte', 'between'],
  datetime: ['gt', 'gte', 'lt', 'lte', 'between', 'empty'],
  email: ['eq', 'ne', 'in', 'contains', 'empty'],
  phone: ['eq', 'in', 'contains', 'empty'],
  select: ['eq', 'ne', 'in', 'nin', 'empty'],
  multiselect: ['contains', 'empty'],
  ref: ['eq', 'ne', 'in', 'nin', 'empty'],
  multiref: ['contains', 'empty'],
  color: ['eq'],
  json: [],
};

export interface Column {
  key: string;
  label: string;
  kind: FieldKind;
  sortable: boolean;
  filterable: boolean;
  defaultVisible: boolean;
  options?: FieldOption[];
  ref?: FieldDef['ref'];
}

export interface FormField extends FieldDef {
  key: string;
}

export interface EntityKit<F extends Record<string, FieldDef> = Record<string, FieldDef>> {
  def: EntityDef<F>;
  /** Fields accepted on create, with defaults applied. */
  createSchema: z.ZodObject<Record<string, z.ZodType>>;
  /** Mutable fields, all optional, for PATCH. */
  updateSchema: z.ZodObject<Record<string, z.ZodType>>;
  /** Shape returned by the API (loose on purpose: derived tables add their own columns). */
  readSchema: z.ZodObject<Record<string, z.ZodType>>;
  columns: Column[];
  formFields: FormField[];
  filterable: Record<string, FieldDef>;
  searchable: string[];
  permissions: Record<'read' | 'create' | 'update' | 'delete' | 'restore' | 'export' | 'import', string>;
}

const BASE_READ = {
  id: uuid,
  code: z.string().nullish(),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullish(),
  version: z.number().int(),
};

/** Derive every schema and UI hint for an entity from its field definitions. */
export function defineEntity<F extends Record<string, FieldDef>>(def: EntityDef<F>): EntityKit<F> {
  const entries = Object.entries(def.fields);
  const createShape: Record<string, z.ZodType> = {};
  const updateShape: Record<string, z.ZodType> = {};
  const readShape: Record<string, z.ZodType> = { ...BASE_READ };
  for (const [key, fd] of entries) {
    const base = zodFor(key, fd);
    createShape[key] = fd.default !== undefined ? base.default(fd.default as never) : base;
    // A PATCH that omits a JSON field must leave it alone, so strip the default used for create.
    if (!fd.immutable) updateShape[key] = (fd.kind === 'json' && fd.jsonSchema ? zodFor(key, { ...fd, jsonSchema: unwrapDefault(fd.jsonSchema) }) : base).optional();
    readShape[key] = zodForRead(fd);
  }
  const perm = (a: string) => `${def.module}.${def.resource}.${a}`;
  return {
    def,
    createSchema: z.object(createShape).strict(),
    updateSchema: z.object(updateShape).strict(),
    readSchema: z.object(readShape).passthrough(),
    columns: entries
      .filter(([, d]) => d.kind !== 'textarea' || d.list)
      .map(([key, d]) => ({
        key,
        label: d.label,
        kind: d.kind,
        sortable: !!d.sort,
        filterable: !!d.filter,
        defaultVisible: !!d.list,
        ...(d.options ? { options: d.options } : {}),
        ...(d.ref ? { ref: d.ref } : {}),
      })),
    formFields: entries.filter(([, d]) => !d.hideInForm).map(([key, d]) => ({ key, ...d })),
    filterable: Object.fromEntries(entries.filter(([, d]) => d.filter)),
    searchable: entries.filter(([, d]) => d.search).map(([k]) => k),
    permissions: {
      read: perm('read'), create: perm('create'), update: perm('update'), delete: perm('delete'),
      restore: perm('restore'), export: perm('export'), import: perm('import'),
    },
  };
}

function zodForRead(d: FieldDef): z.ZodType {
  if (d.kind === 'number') return z.union([z.number(), z.string()]).nullish();
  if (d.kind === 'multiselect' || d.kind === 'multiref') return z.array(z.string()).nullish();
  if (d.kind === 'boolean') return z.boolean().nullish();
  if (d.kind === 'json') return z.unknown();
  return z.string().nullish();
}

export { e164 };

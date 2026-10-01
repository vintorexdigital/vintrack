import type { Column, EntityKit } from '@trackrex/schemas';
import type { ComponentType, ReactNode } from 'react';
import type { MenuItem, TabDef } from '@trackrex/ui';

export type Row = Record<string, unknown> & { id: string; version: number };

export interface EditorProps {
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string | undefined;
  disabled?: boolean;
  field: { key: string; label: string; help?: string | undefined };
}

export interface ResourceContext {
  can: (p: string) => boolean;
  reload: () => void;
}

export interface Resource {
  kit: EntityKit;
  /** API path including /v1. */
  apiPath: string;
  /** Console route for this entity's list; /new and /:id are appended. */
  routeBase: string;
  /** Breadcrumb shown above the title. */
  scope?: string;
  /** Per-field cell renderers. */
  cells?: Record<string, (row: Row) => ReactNode>;
  /** Fields never shown in the list even if the kit marks them as list columns. */
  hiddenColumns?: string[];
  rowActions?: (row: Row, ctx: ResourceContext) => MenuItem[];
  headerActions?: (ctx: ResourceContext) => ReactNode;
  /** Replaces the default JSON editor for json fields by editor name. */
  editors?: Record<string, ComponentType<EditorProps>>;
  /** Extra tabs on the detail page, shown before Audit history. */
  detailTabs?: (row: Row) => TabDef[];
  /** Hide create (entities created elsewhere). */
  noCreate?: boolean;
  /** Read-only detail (no edit form). */
  readOnly?: boolean;
  /** Customise the create button label. */
  createLabel?: string;
  /** Default query for the list (for example a default sort). */
  defaultQuery?: Record<string, string>;
  /** Fields to leave out of the create/edit form. */
  hiddenFields?: string[];
  /** Extra defaults for a new record. */
  newDefaults?: Record<string, unknown>;
}

export function defineResource(kit: EntityKit, routeBase: string, opts: Partial<Omit<Resource, 'kit' | 'apiPath' | 'routeBase'>> = {}): Resource {
  return { kit, apiPath: `/v1${kit.def.path}`, routeBase, ...opts };
}

export const titleOf = (r: Resource, row: Row): string => String(row[r.kit.def.titleField] ?? row.code ?? row.id);

export function columnsFor(r: Resource): Column[] {
  return r.kit.columns.filter((c) => c.kind !== 'json' && !r.hiddenColumns?.includes(c.key));
}

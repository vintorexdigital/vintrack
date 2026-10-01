'use client';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';
import { Skeleton } from './feedback';

export interface DataColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
  /** Right-align and use tabular figures. */
  numeric?: boolean;
  /** Shown as a labelled line on the mobile card (first four are shown collapsed). */
  card?: boolean;
  className?: string;
}

export interface SortState {
  field: string;
  dir: 'asc' | 'desc';
}

export interface DataTableProps<T> {
  columns: DataColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  sort?: SortState | undefined;
  onSort?: (s: SortState | undefined) => void;
  selected?: ReadonlySet<string>;
  onSelect?: (ids: Set<string>) => void;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => ReactNode;
  empty?: ReactNode;
  caption: string;
  density?: 'compact' | 'standard';
}

/**
 * Sticky header, sortable columns, selection and a row menu. Below md each row becomes a card with its
 * key fields; from md the full table scrolls inside its container with the first column pinned.
 */
export function DataTable<T>({ columns, rows, rowKey, loading, sort, onSort, selected, onSelect, onRowClick, rowActions, empty, caption, density = 'standard' }: DataTableProps<T>) {
  const selectable = !!onSelect;
  const allIds = rows.map(rowKey);
  const allSelected = selectable && allIds.length > 0 && allIds.every((id) => selected?.has(id));
  const toggleAll = () => onSelect?.(allSelected ? new Set() : new Set(allIds));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelect?.(next);
  };
  const nextSort = (c: DataColumn<T>) => {
    if (!c.sortable || !onSort) return;
    if (sort?.field !== c.key) onSort({ field: c.key, dir: 'asc' });
    else if (sort.dir === 'asc') onSort({ field: c.key, dir: 'desc' });
    else onSort(undefined);
  };
  const rowH = density === 'compact' ? 'h-9' : 'h-11';
  const cardCols = columns.filter((c) => c.card !== false);

  if (!loading && rows.length === 0) return <div className="border-y border-rule bg-surface">{empty}</div>;

  return (
    <div>
      {/* cards below md */}
      <ul className="divide-y divide-rule border-y border-rule bg-surface md:hidden" aria-label={caption}>
        {loading
          ? Array.from({ length: 5 }, (_, i) => <li key={i} className="space-y-2 p-4"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /></li>)
          : rows.map((r) => {
              const id = rowKey(r);
              return (
                <li key={id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" onClick={() => onRowClick?.(r)} className="min-w-0 flex-1 text-left" disabled={!onRowClick}>
                      <div className="truncate text-sm font-semibold text-ink">{cardCols[0]?.cell(r)}</div>
                    </button>
                    {rowActions?.(r)}
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                    {cardCols.slice(1, 5).map((c) => (
                      <div key={c.key} className="min-w-0">
                        <dt className="text-muted">{c.header}</dt>
                        <dd className="truncate text-ink">{c.cell(r)}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              );
            })}
      </ul>

      {/* table from md */}
      <div className="hidden max-w-full overflow-x-auto border-y border-rule bg-surface md:block">
        <table className="w-full min-w-max border-separate border-spacing-0 text-left text-table">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 z-10 bg-canvas">
            <tr>
              {selectable && (
                <th scope="col" className="w-10 border-b border-rule px-3 py-2">
                  <input type="checkbox" aria-label="Select all rows" checked={allSelected} onChange={toggleAll} className="size-4 accent-[var(--brand-primary)]" />
                </th>
              )}
              {columns.map((c, i) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={sort?.field === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn('border-b border-rule px-3 py-2 text-xs font-semibold text-muted', c.numeric && 'text-right', i === 0 && 'sticky left-0 bg-canvas', c.className)}
                >
                  {c.sortable ? (
                    <button type="button" onClick={() => nextSort(c)} className={cn('inline-flex items-center gap-1 hover:text-ink', c.numeric && 'flex-row-reverse')}>
                      {c.header}
                      {sort?.field === c.key ? (sort.dir === 'asc' ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden />) : <ChevronsUpDown className="size-3 opacity-50" aria-hidden />}
                    </button>
                  ) : c.header}
                </th>
              ))}
              {rowActions && <th scope="col" className="w-12 border-b border-rule"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }, (_, i) => (
                  <tr key={i} className={rowH}>
                    {selectable && <td className="px-3" />}
                    {columns.map((c) => <td key={c.key} className="border-b border-rule px-3"><Skeleton className="h-3 w-3/4" /></td>)}
                    {rowActions && <td className="border-b border-rule" />}
                  </tr>
                ))
              : rows.map((r) => {
                  const id = rowKey(r);
                  return (
                    <tr key={id} className={cn(rowH, 'group hover:bg-canvas', selected?.has(id) && 'bg-pending-tint', onRowClick && 'cursor-pointer')} onClick={() => onRowClick?.(r)}>
                      {selectable && (
                        <td className="border-b border-rule px-3" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" aria-label="Select row" checked={!!selected?.has(id)} onChange={() => toggle(id)} className="size-4 accent-[var(--brand-primary)]" />
                        </td>
                      )}
                      {columns.map((c, i) => (
                        <td key={c.key} className={cn('border-b border-rule px-3 text-ink', c.numeric && 'text-right tabular-nums', i === 0 && 'sticky left-0 bg-surface group-hover:bg-canvas', c.className)}>{c.cell(r)}</td>
                      ))}
                      {rowActions && <td className="border-b border-rule pr-2 text-right" onClick={(e) => e.stopPropagation()}>{rowActions(r)}</td>}
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

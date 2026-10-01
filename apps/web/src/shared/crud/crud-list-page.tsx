'use client';
import { Button, DataTable, EmptyState, IconButton, Menu, PageBody, PageHeader, useToast, type DataColumn, type MenuItem, type SortState } from '@trackrex/ui';
import { Download, MoreHorizontal, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { buildListQuery, toSearchParams, type Column, type Filter } from '@trackrex/schemas';
import { ApiError, api, download } from '../api/client';
import { useAuth } from '../auth/auth';
import { FilterBar } from './filter-bar';
import { columnsFor, titleOf, type Resource, type Row } from './resource';
import { useCrudResource } from './use-crud';
import { Modal, Select } from '@trackrex/ui';

function formatCell(c: Column, row: Row): React.ReactNode {
  const v = row[c.key];
  if (v === null || v === undefined || v === '') return <span className="text-muted">–</span>;
  if (c.kind === 'boolean') return v ? 'Yes' : 'No';
  if (c.kind === 'select') return c.options?.find((o) => o.value === v)?.label ?? String(v);
  if (c.kind === 'multiselect' || c.kind === 'multiref') return (v as string[]).join(', ') || <span className="text-muted">–</span>;
  if (c.kind === 'datetime') return new Date(String(v)).toLocaleString();
  if (c.kind === 'ref') return <RefText entity={c.ref!.entity} id={String(v)} />;
  if (c.kind === 'number') return typeof v === 'number' ? v.toLocaleString() : String(v);
  return String(v);
}

import { useQuery } from '@tanstack/react-query';
import { kitByKey } from '@trackrex/schemas';
function RefText({ entity, id }: { entity: string; id: string }) {
  const kit = kitByKey(entity);
  const q = useQuery({ queryKey: ['ref-one', kit ? `/v1${kit.def.path}` : '', id], queryFn: () => api<Row>(`/v1${kit!.def.path}/${id}`), enabled: !!kit, staleTime: 60_000 });
  if (!kit) return <>{id.slice(0, 8)}</>;
  return <>{q.data ? String(q.data[kit.def.titleField] ?? q.data.code ?? id) : '…'}</>;
}

function useUrlState(r: Resource) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const raw = useMemo(() => Object.fromEntries(sp.entries()), [sp]);
  const parsed = useMemo(() => {
    try { return buildListQuery({ limit: '50', ...r.defaultQuery, ...raw }, r.kit); } catch { return buildListQuery({ limit: '50' }, r.kit); }
  }, [raw, r]);
  const set = (patch: Partial<{ q: string; sort: SortState | undefined; filters: Filter[]; deleted: 'exclude' | 'only'; limit: number }>) => {
    const next = toSearchParams({
      q: 'q' in patch ? patch.q ?? '' : parsed.q ?? '',
      sort: 'sort' in patch ? (patch.sort ? [patch.sort] : []) : raw.sort ? parsed.sort : [],
      filters: patch.filters ?? parsed.filters,
      deleted: patch.deleted ?? parsed.deleted,
      limit: patch.limit ?? parsed.limit,
    });
    router.replace(`${path}?${next.toString()}`, { scroll: false });
  };
  return { parsed, raw, set };
}

function ListInner({ resource: r }: { resource: Resource }) {
  const { can } = useAuth();
  const router = useRouter();
  const toast = useToast();
  const crud = useCrudResource(r);
  const { parsed, raw, set } = useUrlState(r);
  const perms = r.kit.permissions;
  const [search, setSearch] = useState(parsed.q ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<null | { ids: string[]; label: string }>(null);
  const [reason, setReason] = useState('');
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => { const t = setTimeout(() => { if ((parsed.q ?? '') !== search) set({ q: search }); }, 300); return () => clearTimeout(t); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  useEffect(() => { setSelected(new Set()); setTotal(null); }, [raw.deleted, raw.q, raw.sort]);

  const params = useMemo(() => toSearchParams({ q: parsed.q ?? '', sort: raw.sort ? parsed.sort : [], filters: parsed.filters, deleted: parsed.deleted, limit: parsed.limit }), [parsed, raw.sort]);
  const list = crud.useList(params);
  const remove = crud.useRemove();
  const restore = crud.useRestore();
  const bulk = crud.useBulk();
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const bin = parsed.deleted === 'only';
  const columns = columnsFor(r);
  const visible = columns.filter((c) => c.defaultVisible);
  const ctx = { can, reload: () => void crud.invalidate() };

  const dataCols: DataColumn<Row>[] = visible.map((c, i) => ({
    key: c.key, header: c.label, sortable: c.sortable, numeric: c.kind === 'number', card: true,
    cell: (row) => (i === 0 ? <span className="font-medium">{r.cells?.[c.key]?.(row) ?? formatCell(c, row)}</span> : r.cells?.[c.key]?.(row) ?? formatCell(c, row)),
  }));
  if (r.kit.def.codePrefix && !visible.some((c) => c.key === 'code')) dataCols.unshift({ key: 'code', header: 'Code', cell: (row) => <span className="tabular-nums text-muted">{String(row.code ?? '')}</span>, sortable: false });

  const errorText = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
  async function doDelete() {
    if (!confirm) return;
    try {
      if (confirm.ids.length === 1) await remove.mutateAsync({ id: confirm.ids[0]!, ...(reason ? { reason } : {}) });
      else await bulk.mutateAsync({ action: 'delete', ids: confirm.ids, ...(reason ? { reason } : {}) });
      toast('success', `${confirm.ids.length === 1 ? r.kit.def.singular : `${confirm.ids.length} ${r.kit.def.plural.toLowerCase()}`} moved to the recycle bin.`);
      setSelected(new Set());
    } catch (e) { toast('error', errorText(e)); }
    setConfirm(null); setReason('');
  }
  async function doRestore(ids: string[]) {
    try {
      if (ids.length === 1) await restore.mutateAsync(ids[0]!); else await bulk.mutateAsync({ action: 'restore', ids });
      toast('success', 'Restored.'); setSelected(new Set());
    } catch (e) { toast('error', errorText(e)); }
  }
  const rowMenu = (row: Row): MenuItem[] => {
    const items: MenuItem[] = [];
    if (!bin && can(perms.update) && !r.readOnly) items.push({ label: 'Edit', onSelect: () => router.push(`${r.routeBase}/${row.id}`) });
    items.push(...(r.rowActions?.(row, ctx) ?? []));
    items.push({ label: 'Copy ID', onSelect: () => void navigator.clipboard?.writeText(row.id) });
    if (bin && can(perms.restore)) items.push({ label: 'Restore', onSelect: () => void doRestore([row.id]), icon: <RotateCcw className="size-4" aria-hidden /> });
    if (!bin && can(perms.delete)) items.push('separator' as never, { label: 'Delete', danger: true, onSelect: () => setConfirm({ ids: [row.id], label: titleOf(r, row) }), icon: <Trash2 className="size-4" aria-hidden /> });
    return items.filter((i) => i !== ('separator' as never) || items.length > 2);
  };

  return (
    <>
      <PageHeader
        title={r.kit.def.plural} {...(r.scope ? { scope: r.scope } : {})}
        primary={!r.noCreate && can(perms.create) ? <Button variant="primary" icon={<Plus className="size-4" aria-hidden />} onClick={() => router.push(`${r.routeBase}/new`)}>{r.createLabel ?? `Add ${r.kit.def.singular.toLowerCase()}`}</Button> : undefined}
        secondary={<>{r.headerActions?.(ctx)}{can(perms.export) && (
          <Menu trigger={<Button icon={<Download className="size-4" aria-hidden />}>Export</Button>} items={[
            { label: 'CSV', onSelect: () => void download(`${r.apiPath}/export`, new URLSearchParams([...params, ['format', 'csv']]), 'export.csv').catch((e) => toast('error', errorText(e))) },
            { label: 'Excel (XLSX)', onSelect: () => void download(`${r.apiPath}/export`, new URLSearchParams([...params, ['format', 'xlsx']]), 'export.xlsx').catch((e) => toast('error', errorText(e))) },
          ]} />
        )}</>}
      />
      <PageBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-56 flex-1 md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${r.kit.def.plural.toLowerCase()}`} aria-label={`Search ${r.kit.def.plural}`} className="min-h-11 w-full rounded-input border border-rule bg-surface pl-9 pr-3 text-sm focus:border-brand focus:outline-none md:min-h-9" />
          </div>
          {r.kit.def.softDelete !== false && (
            <div role="group" aria-label="Show" className="flex rounded-button border border-rule bg-canvas p-0.5">
              {([['exclude', 'Active'], ['only', 'Recycle bin']] as const).map(([v, label]) => (
                <button key={v} type="button" aria-pressed={parsed.deleted === v} onClick={() => set({ deleted: v })} className={`min-h-8 rounded-input px-3 text-xs font-semibold ${parsed.deleted === v ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink'}`}>{label}</button>
              ))}
            </div>
          )}
          <Select aria-label="Rows per page" className="w-auto" value={String(parsed.limit)} onChange={(e) => set({ limit: Number(e.target.value) })}>{[25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}</Select>
        </div>
        <FilterBar columns={columns} filters={parsed.filters} onChange={(f) => set({ filters: f })} />

        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-input bg-pending-tint px-3 py-2 text-sm" role="status">
            <span className="font-medium tabular-nums">{selected.size} selected</span>
            {bin ? can(perms.restore) && <Button size="sm" icon={<RotateCcw className="size-4" aria-hidden />} onClick={() => void doRestore([...selected])}>Restore</Button>
              : can(perms.delete) && <Button size="sm" variant="danger" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setConfirm({ ids: [...selected], label: `${selected.size} records` })}>Delete</Button>}
            <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-xs font-medium text-brand">Clear selection</button>
          </div>
        )}

        {list.isError ? (
          <EmptyState title="Could not load this list" hint={errorText(list.error)} action={<Button onClick={() => void list.refetch()}>Try again</Button>} />
        ) : (
          <DataTable
            caption={r.kit.def.plural} columns={dataCols} rows={rows} rowKey={(x) => x.id} loading={list.isLoading}
            sort={raw.sort ? { field: parsed.sort[0]!.field, dir: parsed.sort[0]!.dir } : undefined} onSort={(s) => set({ sort: s })}
            selected={selected} onSelect={can(perms.delete) || can(perms.restore) ? setSelected : undefined as never}
            onRowClick={(row) => !bin && !r.readOnly && can(perms.update) ? router.push(`${r.routeBase}/${row.id}`) : r.detailTabs ? router.push(`${r.routeBase}/${row.id}`) : undefined}
            rowActions={(row) => <Menu trigger={<IconButton label={`Actions for ${titleOf(r, row)}`}><MoreHorizontal className="size-5" /></IconButton>} items={rowMenu(row)} />}
            empty={
              <EmptyState
                title={bin ? 'The recycle bin is empty' : parsed.filters.length || parsed.q ? 'Nothing matches those filters' : r.kit.def.empty.title}
                hint={bin ? 'Deleted records stay here for 30 days before they are removed for good.' : parsed.filters.length || parsed.q ? 'Try removing a filter or searching for something else.' : r.kit.def.empty.hint}
                action={!bin && !parsed.q && !parsed.filters.length && !r.noCreate && can(perms.create) ? <Button variant="primary" onClick={() => router.push(`${r.routeBase}/new`)}>{r.createLabel ?? `Add ${r.kit.def.singular.toLowerCase()}`}</Button> : undefined}
              />
            }
          />
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
          <span className="tabular-nums" aria-live="polite">{rows.length} shown{total !== null ? ` of ${total.toLocaleString()}` : ''}</span>
          <div className="flex gap-2">
            {total === null && <Button size="sm" onClick={async () => { const p = new URLSearchParams(params); p.set('limit', '1'); p.set('include_total', 'true'); p.delete('cursor'); const res = await api<{ total: number }>(r.apiPath, { query: p }); setTotal(res.total); }}>Count all</Button>}
            {list.hasNextPage && <Button size="sm" variant="primary" loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>Load more</Button>}
          </div>
        </div>
      </PageBody>
      <Modal open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} title={`Delete ${confirm?.label ?? ''}?`} description="It moves to the recycle bin and can be restored for 30 days."
        footer={<><Button onClick={() => setConfirm(null)}>Keep</Button><Button variant="danger" loading={remove.isPending || bulk.isPending} onClick={() => void doDelete()}>Delete</Button></>}>
        <label className="block text-sm font-medium" htmlFor="del-reason">Reason (optional)</label>
        <input id="del-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="mt-1.5 min-h-11 w-full rounded-input border border-rule bg-surface px-3 text-sm md:min-h-9" />
      </Modal>
    </>
  );
}

/** One list screen for any entity: server-paginated, filterable, sortable, exportable. */
export function CrudListPage({ resource }: { resource: Resource }) {
  return <Suspense><ListInner resource={resource} /></Suspense>;
}

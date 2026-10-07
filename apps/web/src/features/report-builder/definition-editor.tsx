'use client';
import { useMutation } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import { Banner, Button, Field, Input, Select, Skeleton } from '@trackrex/ui';
import { reportDefinitionSchema, type DatasetMeta, type ReportDefinition } from '@trackrex/schemas';
import { Plus, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/shared/api/client';
import type { EditorProps } from '@/shared/crud/resource';
import { ResultView, type BuiltResult } from './result-view';

const OPS = [{ value: 'eq', label: 'is' }, { value: 'ne', label: 'is not' }, { value: 'in', label: 'is one of' }, { value: 'contains', label: 'contains' }, { value: 'gt', label: 'is more than' }, { value: 'gte', label: 'is at least' }, { value: 'lt', label: 'is less than' }, { value: 'lte', label: 'is at most' }];
const RANGES = [{ value: 'last_days:7', label: 'Last 7 days' }, { value: 'last_days:30', label: 'Last 30 days' }, { value: 'last_days:90', label: 'Last 90 days' }, { value: 'this_month', label: 'This month' }, { value: 'last_month', label: 'Last month' }, { value: 'custom', label: 'Choose dates' }];
const CHARTS = [{ value: 'table', label: 'Table' }, { value: 'bar', label: 'Bars' }, { value: 'line', label: 'Line' }, { value: 'pie', label: 'Share (donut)' }];

const rangeKey = (r: ReportDefinition['range']) => (r.mode === 'last_days' ? `last_days:${r.days}` : r.mode);

export const BLANK: ReportDefinition = { dataset: 'attendance', dimensions: ['employee'], measures: ['days'], filters: [], range: { mode: 'last_days', days: 30 }, limit: 500, chart: 'table' };

/** The report builder: choose a data source, how to group it, what to total, filter, pick a period and a look, and try it before saving. */
export function ReportDefinitionEditor({ value, onChange, disabled, error }: EditorProps) {
  const def = { ...BLANK, ...((value as Partial<ReportDefinition> | undefined) ?? {}) } as ReportDefinition;
  const meta = useQuery({ queryKey: ['report-datasets'], queryFn: () => api<DatasetMeta[]>('/v1/report-builder/datasets'), staleTime: 300_000 });
  const ds = meta.data?.find((d) => d.key === def.dataset);
  const set = (patch: Partial<ReportDefinition>) => onChange({ ...def, ...patch });
  const preview = useMutation({ mutationFn: () => api<BuiltResult>('/v1/report-builder/run', { method: 'POST', body: { definition: def } }) });
  const valid = reportDefinitionSchema.safeParse(def).success;

  if (meta.isLoading) return <Skeleton className="h-48" />;
  if (!meta.data?.length) return <Banner tone="warn">You do not have access to any data source for reports.</Banner>;
  const toggle = (list: string[], k: string, max: number) => (list.includes(k) ? list.filter((x) => x !== k) : list.length >= max ? list : [...list, k]);
  return (
    <div className="space-y-5">
      <Field label="Data source" help={ds?.description}>
        {(id, d) => <Select id={id} aria-describedby={d} disabled={disabled} value={def.dataset} onChange={(e) => { const nd = meta.data!.find((x) => x.key === e.target.value)!; set({ dataset: nd.key, dimensions: [], measures: [nd.measures[0]!.key], filters: [], sort: undefined as never }); }}>{meta.data!.map((d2) => <option key={d2.key} value={d2.key}>{d2.label}</option>)}</Select>}
      </Field>
      {ds && (<>
        <fieldset className="space-y-2" disabled={disabled}>
          <legend className="text-sm font-medium">Group by <span className="text-xs font-normal text-muted">(up to 3, in this order)</span></legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {ds.dimensions.map((d2) => <label key={d2.key} className="inline-flex min-h-8 items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--brand-primary)]" checked={def.dimensions.includes(d2.key)} onChange={() => set({ dimensions: toggle(def.dimensions, d2.key, 3) })} />{d2.label}</label>)}
          </div>
          <p className="text-xs text-muted">{def.dimensions.length ? `Grouped by ${def.dimensions.map((k) => ds.dimensions.find((x) => x.key === k)?.label).join(', then ')}.` : 'No grouping: one total row.'}</p>
        </fieldset>
        <fieldset className="space-y-2" disabled={disabled}>
          <legend className="text-sm font-medium">Show <span className="text-xs font-normal text-muted">(up to 4)</span></legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {ds.measures.map((m) => <label key={m.key} className="inline-flex min-h-8 items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--brand-primary)]" checked={def.measures.includes(m.key)} onChange={() => { const next = toggle(def.measures, m.key, 4); if (next.length) set({ measures: next }); }} />{m.label}</label>)}
          </div>
        </fieldset>
        <div className="space-y-2">
          <p className="text-sm font-medium">Only where</p>
          {def.filters.map((f, i) => {
            const fd = ds.filters.find((x) => x.key === f.field);
            return (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <Field label="Field">{(id) => <Select id={id} disabled={disabled} value={f.field} onChange={(e) => set({ filters: def.filters.map((x, j) => (j === i ? { field: e.target.value, op: 'eq', value: '' } : x)) })}>{ds.filters.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</Select>}</Field>
                <Field label="Test">{(id) => <Select id={id} disabled={disabled} value={f.op} onChange={(e) => set({ filters: def.filters.map((x, j) => (j === i ? { ...x, op: e.target.value as 'eq' } : x)) })}>{OPS.filter((o) => (fd?.kind === 'number' ? o.value !== 'contains' : !['gt', 'gte', 'lt', 'lte'].includes(o.value))).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>}</Field>
                <Field label="Value">{(id) => fd?.kind === 'choice' && f.op !== 'in' ? <Select id={id} disabled={disabled} value={String(f.value)} onChange={(e) => set({ filters: def.filters.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })}><option value="">Choose…</option>{fd.options?.map((o) => <option key={o} value={o}>{o}</option>)}</Select> : <Input id={id} disabled={disabled} type={fd?.kind === 'number' ? 'number' : 'text'} placeholder={f.op === 'in' ? 'a, b, c' : ''} value={Array.isArray(f.value) ? f.value.join(', ') : String(f.value)} onChange={(e) => set({ filters: def.filters.map((x, j) => (j === i ? { ...x, value: f.op === 'in' ? e.target.value.split(',').map((v) => v.trim()).filter(Boolean) : fd?.kind === 'number' ? Number(e.target.value) : e.target.value } : x)) })} />}</Field>
                {!disabled && <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => set({ filters: def.filters.filter((_, j) => j !== i) })}>Remove</Button>}
              </div>
            );
          })}
          {!disabled && def.filters.length < 8 && <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => set({ filters: [...def.filters, { field: ds.filters[0]!.key, op: 'eq', value: '' }] })}>Add a condition</Button>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Period">{(id) => <Select id={id} disabled={disabled} value={rangeKey(def.range)} onChange={(e) => { const v = e.target.value; set({ range: v.startsWith('last_days') ? { mode: 'last_days', days: Number(v.split(':')[1]) } : v === 'custom' ? { mode: 'custom', from: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) } : { mode: v as 'this_month' } }); }}>{RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</Select>}</Field>
          {def.range.mode === 'custom' && (<>
            <Field label="From">{(id) => <Input id={id} type="date" disabled={disabled} value={def.range.mode === 'custom' ? def.range.from : ''} onChange={(e) => set({ range: { mode: 'custom', from: e.target.value, to: def.range.mode === 'custom' ? def.range.to : e.target.value } })} />}</Field>
            <Field label="To">{(id) => <Input id={id} type="date" disabled={disabled} value={def.range.mode === 'custom' ? def.range.to : ''} onChange={(e) => set({ range: { mode: 'custom', from: def.range.mode === 'custom' ? def.range.from : e.target.value, to: e.target.value } })} />}</Field>
          </>)}
          <Field label="Look">{(id) => <Select id={id} disabled={disabled} value={def.chart} onChange={(e) => set({ chart: e.target.value as ReportDefinition['chart'] })}>{CHARTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</Select>}</Field>
          <Field label="Sort by">{(id) => <Select id={id} disabled={disabled} value={def.sort ? `${def.sort.key}:${def.sort.dir}` : ''} onChange={(e) => { const [key, dir] = e.target.value.split(':'); set({ sort: e.target.value ? { key: key!, dir: dir as 'asc' } : undefined as never }); }}><option value="">Grouping order</option>{[...def.dimensions, ...def.measures].flatMap((k) => { const l = ds.dimensions.find((x) => x.key === k)?.label ?? ds.measures.find((x) => x.key === k)?.label ?? k; return [<option key={`${k}d`} value={`${k}:desc`}>{l}, high to low</option>, <option key={`${k}a`} value={`${k}:asc`}>{l}, low to high</option>]; })}</Select>}</Field>
          <Field label="Most rows">{(id) => <Input id={id} type="number" min={1} max={5000} disabled={disabled} value={def.limit} onChange={(e) => set({ limit: Math.min(5000, Math.max(1, Number(e.target.value) || 1)) })} />}</Field>
        </div>
      </>)}
      {error && <p role="alert" className="text-sm text-absent">{error}</p>}
      <div className="space-y-3 rounded-overlay border border-rule p-3">
        <Button disabled={!valid || preview.isPending} loading={preview.isPending} onClick={() => preview.mutate()}>Try it</Button>
        {preview.isError && <p role="alert" className="text-sm text-absent">{preview.error instanceof ApiError ? preview.error.message : 'Could not run the report.'}</p>}
        {preview.data && <ResultView result={preview.data} />}
      </div>
    </div>
  );
}

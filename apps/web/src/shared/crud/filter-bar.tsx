'use client';
import * as Popover from '@radix-ui/react-popover';
import { Button, Input, Select } from '@trackrex/ui';
import { Filter as FilterIcon, X } from 'lucide-react';
import { useState } from 'react';
import { OPS_BY_KIND, type Column, type Filter, type FilterOp } from '@trackrex/schemas';
import { RefPicker } from './fields';

const OP_LABEL: Record<FilterOp, string> = {
  eq: 'is', ne: 'is not', in: 'is any of', nin: 'is none of', gt: 'is after', gte: 'is on or after', lt: 'is before', lte: 'is on or before',
  between: 'is between', contains: 'contains', empty: 'is empty',
};
const labelFor = (kind: string, op: FilterOp) => (kind === 'date' || kind === 'datetime' || kind === 'number' ? ({ gt: kind === 'number' ? 'is above' : 'is after', lt: kind === 'number' ? 'is below' : 'is before' } as Record<string, string>)[op] : undefined) ?? OP_LABEL[op];

export function filterChipText(f: Filter, cols: Column[]): string {
  const c = cols.find((x) => x.key === f.field);
  const val = Array.isArray(f.value) ? f.value.map((v) => optionLabel(c, String(v))).join(', ') : f.op === 'empty' ? (f.value ? 'yes' : 'no') : optionLabel(c, String(f.value));
  return `${c?.label ?? f.field} ${labelFor(c?.kind ?? 'text', f.op)} ${c?.kind === 'ref' ? 'selection' : val}`;
}
const optionLabel = (c: Column | undefined, v: string) => c?.options?.find((o) => o.value === v)?.label ?? v;

/** Field, operator and value chips; the whole filter state lives in the URL so views can be shared. */
export function FilterBar({ columns, filters, onChange }: { columns: Column[]; filters: Filter[]; onChange: (f: Filter[]) => void }) {
  const filterable = columns.filter((c) => c.filterable);
  const [open, setOpen] = useState(false);
  const [field, setField] = useState(filterable[0]?.key ?? '');
  const col = filterable.find((c) => c.key === field);
  const ops = col ? OPS_BY_KIND[col.kind] : [];
  const [op, setOp] = useState<FilterOp>('eq');
  const [value, setValue] = useState('');
  const [value2, setValue2] = useState('');
  if (filterable.length === 0) return null;

  const reset = (key: string) => {
    setField(key);
    const c = filterable.find((x) => x.key === key)!;
    setOp(OPS_BY_KIND[c.kind][0] ?? 'eq');
    setValue(''); setValue2('');
  };
  const add = () => {
    if (!col) return;
    const v: unknown =
      op === 'empty' ? true : op === 'between' ? [value, value2] : op === 'in' || op === 'nin' ? value.split(',').map((s) => s.trim()).filter(Boolean)
      : col.kind === 'number' ? Number(value) : col.kind === 'boolean' ? value === 'true' : value;
    onChange([...filters.filter((f) => !(f.field === field && f.op === op)), { field, op, value: v }]);
    setOpen(false);
  };
  const valueInput = () => {
    if (op === 'empty') return null;
    if (col?.kind === 'ref') return <RefPicker entity={col.ref!.entity} value={value || null} onChange={(v) => setValue(v ?? '')} />;
    if (col?.kind === 'select' && (op === 'eq' || op === 'ne')) return <Select aria-label="Value" value={value} onChange={(e) => setValue(e.target.value)}><option value="">Choose…</option>{col.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>;
    if (col?.kind === 'boolean') return <Select aria-label="Value" value={value} onChange={(e) => setValue(e.target.value)}><option value="">Choose…</option><option value="true">Yes</option><option value="false">No</option></Select>;
    const type = col?.kind === 'date' ? 'date' : col?.kind === 'number' ? 'number' : 'text';
    return (
      <div className="flex gap-2">
        <Input aria-label="Value" type={type} value={value} onChange={(e) => setValue(e.target.value)} placeholder={op === 'in' || op === 'nin' ? 'Comma-separated values' : ''} />
        {op === 'between' && <Input aria-label="To" type={type} value={value2} onChange={(e) => setValue2(e.target.value)} />}
      </div>
    );
  };
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
      {filters.map((f, i) => (
        <span key={`${f.field}-${f.op}-${i}`} className="inline-flex min-h-8 items-center gap-1 rounded-pill border border-rule bg-surface py-0.5 pl-3 pr-1 text-xs">
          {filterChipText(f, columns)}
          <button type="button" aria-label={`Remove filter ${filterChipText(f, columns)}`} onClick={() => onChange(filters.filter((_, j) => j !== i))} className="rounded-pill p-1 hover:bg-soft"><X className="size-3" /></button>
        </span>
      ))}
      <Popover.Root open={open} onOpenChange={(o) => { setOpen(o); if (o && !col) reset(filterable[0]!.key); }}>
        <Popover.Trigger asChild><Button size="sm" icon={<FilterIcon className="size-4" aria-hidden />}>Add filter</Button></Popover.Trigger>
        <Popover.Portal>
          <Popover.Content align="start" sideOffset={6} className="z-50 w-[min(22rem,92vw)] space-y-3 rounded-overlay border border-rule bg-surface p-3 shadow-[var(--shadow-overlay)]">
            <Select aria-label="Field" value={field} onChange={(e) => reset(e.target.value)}>{filterable.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</Select>
            <Select aria-label="Operator" value={op} onChange={(e) => setOp(e.target.value as FilterOp)}>{ops.map((o) => <option key={o} value={o}>{labelFor(col?.kind ?? 'text', o)}</option>)}</Select>
            {valueInput()}
            <div className="flex justify-end gap-2"><Button size="sm" onClick={() => setOpen(false)}>Cancel</Button><Button size="sm" variant="primary" onClick={add} disabled={op !== 'empty' && !value}>Apply filter</Button></div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {filters.length > 0 && <button type="button" onClick={() => onChange([])} className="text-xs font-medium text-brand">Clear all</button>}
    </div>
  );
}

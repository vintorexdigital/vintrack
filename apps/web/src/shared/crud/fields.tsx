'use client';
import { useQuery } from '@tanstack/react-query';
import { Field, Input, Select, Textarea, Toggle, cn } from '@trackrex/ui';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { kitByKey, type FormField } from '@trackrex/schemas';
import { api } from '../api/client';
import { useRefOptions, type ListPage } from './use-crud';
import type { EditorProps, Row } from './resource';

function labelOf(kitKey: string, row: Row): string {
  const k = kitByKey(kitKey);
  const title = String(row[k?.def.titleField ?? 'name'] ?? row.id);
  return row.code ? `${title} · ${row.code}` : title;
}

/** Async combobox: type to search, pick one record. Shows the current selection by id even before the list loads. */
export function RefPicker({ entity, value, onChange, disabled, id, describedBy, placeholder }: { entity: string; value: string | null | undefined; onChange: (v: string | null) => void; disabled?: boolean | undefined; id?: string | undefined; describedBy?: string | undefined; placeholder?: string }) {
  const kit = kitByKey(entity);
  const apiPath = kit ? `/v1${kit.def.path}` : '';
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const options = useRefOptions(apiPath, q, open && !!kit);
  const selected = useQuery({ queryKey: ['ref-one', apiPath, value], queryFn: () => api<Row>(`${apiPath}/${value}`), enabled: !!value && !!kit, staleTime: 60_000 });
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  if (!kit) return <Input id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} disabled={disabled} placeholder="ID" />;
  const rows = options.data?.data ?? [];
  const display = value ? (selected.data ? labelOf(entity, selected.data) : '…') : '';
  return (
    <div ref={box} className="relative">
      <div className="relative">
        <Input
          id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list" aria-describedby={describedBy} disabled={disabled}
          value={open ? q : display} placeholder={placeholder ?? `Search ${kit.def.plural.toLowerCase()}`} autoComplete="off"
          onFocus={() => { setOpen(true); setQ(''); }} onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, rows.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === 'Enter' && open && rows[active]) { e.preventDefault(); onChange(rows[active]!.id); setOpen(false); }
            if (e.key === 'Escape') setOpen(false);
          }}
        />
        {value && !disabled && (
          <button type="button" aria-label="Clear" onClick={() => { onChange(null); setQ(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-input p-1 text-muted hover:text-ink"><X className="size-4" /></button>
        )}
      </div>
      {open && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-overlay border border-rule bg-surface p-1 shadow-[var(--shadow-overlay)]">
          {options.isLoading && <li className="px-3 py-2 text-sm text-muted">Searching…</li>}
          {!options.isLoading && rows.length === 0 && <li className="px-3 py-2 text-sm text-muted">No matches</li>}
          {rows.map((r, i) => (
            <li key={r.id} role="option" aria-selected={r.id === value}>
              <button type="button" onMouseEnter={() => setActive(i)} onClick={() => { onChange(r.id); setOpen(false); }} className={cn('flex min-h-10 w-full items-center rounded-input px-3 text-left text-sm', i === active && 'bg-canvas', r.id === value && 'font-semibold')}>
                {labelOf(entity, r)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MultiRef({ entity, value, onChange, id }: { entity: string; value: string[]; onChange: (v: string[]) => void; id: string }) {
  const kit = kitByKey(entity);
  const apiPath = kit ? `/v1${kit.def.path}` : '';
  const chips = useQuery({ queryKey: ['ref-many', apiPath, value.join(',')], queryFn: async () => (await Promise.all(value.map((v) => api<Row>(`${apiPath}/${v}`).catch(() => null)))).filter(Boolean) as Row[], enabled: value.length > 0 && !!kit });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.map((v) => {
          const row = chips.data?.find((r) => r.id === v);
          return (
            <span key={v} className="inline-flex items-center gap-1 rounded-pill border border-rule bg-canvas py-0.5 pl-2.5 pr-1 text-xs">
              {row ? labelOf(entity, row) : '…'}
              <button type="button" aria-label="Remove" onClick={() => onChange(value.filter((x) => x !== v))} className="rounded-pill p-0.5 hover:bg-rule"><X className="size-3" /></button>
            </span>
          );
        })}
      </div>
      <RefPicker id={id} entity={entity} value={null} onChange={(v) => v && !value.includes(v) && onChange([...value, v])} placeholder={`Add ${kit?.def.singular.toLowerCase() ?? 'item'}`} />
    </div>
  );
}

function JsonEditor({ value, onChange, error }: EditorProps) {
  const [text, setText] = useState(() => JSON.stringify(value ?? null, null, 2));
  const [bad, setBad] = useState<string>();
  return (
    <Textarea className="min-h-40 font-mono text-xs" value={text} aria-invalid={!!(bad ?? error)}
      onChange={(e) => { setText(e.target.value); try { onChange(JSON.parse(e.target.value)); setBad(undefined); } catch { setBad('Not valid JSON'); } }} />
  );
}

export interface FieldInputProps {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
  error?: string | undefined;
  disabled?: boolean | undefined;
  editors?: Record<string, React.ComponentType<EditorProps>> | undefined;
  values?: Record<string, unknown> | undefined;
}

/** One form control per field kind, driven entirely by the entity definition. */
export function FieldInput({ field, value, onChange, error, disabled, editors, values }: FieldInputProps) {
  if (field.kind === 'boolean') return <Toggle label={field.label} help={field.help} checked={!!value} onChange={onChange} disabled={disabled ?? false} />;
  return (
    <Field label={field.label} help={field.help} error={error} required={field.required} className={field.width === 'full' || field.kind === 'json' || field.kind === 'textarea' ? 'lg:col-span-2' : ''}>
      {(id, d) => {
        const common = { id, 'aria-describedby': d, 'aria-invalid': !!error, disabled };
        switch (field.kind) {
          case 'textarea': return <Textarea {...common} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
          case 'number': return <Input {...common} type="number" inputMode="decimal" step="any" value={value === null || value === undefined ? '' : String(value)} onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))} />;
          case 'date': return <Input {...common} type="date" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
          case 'time': return <Input {...common} type="time" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
          case 'datetime': return <Input {...common} type="datetime-local" value={value ? String(value).slice(0, 16) : ''} onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : undefined)} />;
          case 'email': return <Input {...common} type="email" autoComplete="off" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
          case 'phone': return <Input {...common} type="tel" inputMode="tel" placeholder="+919876543210" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
          case 'color': return <Input {...common} type="color" className="h-11 w-20 p-1 md:h-9" value={(value as string) ?? '#0F5E73'} onChange={(e) => onChange(e.target.value)} />;
          case 'select': return (
            <Select {...common} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value || undefined)}>
              {!field.required && <option value="">None</option>}
              {field.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          );
          case 'multiselect': {
            const v = (value as string[] | null | undefined) ?? [];
            return (
              <div className="flex flex-wrap gap-x-4 gap-y-2" role="group" aria-label={field.label}>
                {field.options?.map((o) => (
                  <label key={o.value} className="inline-flex min-h-8 items-center gap-2 text-sm">
                    <input type="checkbox" className="size-4 accent-[var(--brand-primary)]" checked={v.includes(o.value)} disabled={disabled} onChange={(e) => onChange(e.target.checked ? [...v, o.value] : v.filter((x) => x !== o.value))} />
                    {o.label}
                  </label>
                ))}
              </div>
            );
          }
          case 'ref': return <RefPicker id={id} describedBy={d} entity={field.ref!.entity} value={(value as string) ?? null} onChange={(v) => onChange(v ?? undefined)} disabled={disabled} />;
          case 'multiref': return <MultiRef id={id} entity={field.ref!.entity} value={(value as string[]) ?? []} onChange={onChange} />;
          case 'json': {
            const Editor = (field.editor && editors?.[field.editor]) || JsonEditor;
            return <Editor value={value} onChange={onChange} error={error} disabled={disabled ?? false} values={values} field={{ key: field.key, label: field.label, help: field.help }} />;
          }
          default: return <Input {...common} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />;
        }
      }}
    </Field>
  );
}
export type { ListPage };

'use client';
import { useQuery } from '@tanstack/react-query';
import { Button, Field, Input, Select } from '@trackrex/ui';
import type { DashboardWidget } from '@trackrex/schemas';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { EditorProps } from '@/shared/crud/resource';

/** The widgets of a dashboard: each is a saved report shown as a number, a chart or a table. */
export function WidgetsEditor({ value, onChange, disabled, error }: EditorProps) {
  const ws = (value as DashboardWidget[] | undefined) ?? [];
  const reports = useQuery({ queryKey: ['saved-reports-all'], queryFn: () => api<{ data: { id: string; name: string }[] }>('/v1/report-builder/reports', { query: { limit: 100 } }) });
  const set = (i: number, patch: Partial<DashboardWidget>) => onChange(ws.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  const move = (i: number, d: -1 | 1) => { const n = [...ws]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x!); onChange(n); };
  const newId = () => { let k = ws.length + 1; while (ws.some((w) => w.id === `w${k}`)) k++; return `w${k}`; };
  return (
    <div className="space-y-3">
      {ws.map((w, i) => (
        <fieldset key={w.id} className="space-y-3 rounded-overlay border border-rule p-3" disabled={disabled}>
          <legend className="px-1 text-sm font-semibold">Widget {i + 1}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Title" required>{(id) => <Input id={id} value={w.title} onChange={(e) => set(i, { title: e.target.value })} />}</Field>
            <Field label="Report" required>{(id) => <Select id={id} value={w.reportId} onChange={(e) => set(i, { reportId: e.target.value })}><option value="">Choose…</option>{reports.data?.data.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>}</Field>
            <Field label="Shown as">{(id) => <Select id={id} value={w.display} onChange={(e) => set(i, { display: e.target.value as DashboardWidget['display'] })}>{[['kpi', 'Big number'], ['bar', 'Bars'], ['line', 'Line'], ['pie', 'Share (donut)'], ['table', 'Table']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
            <Field label="Width">{(id) => <Select id={id} value={w.size} onChange={(e) => set(i, { size: e.target.value as DashboardWidget['size'] })}><option value="sm">Small</option><option value="md">Medium</option><option value="lg">Full width</option></Select>}</Field>
          </div>
          {!disabled && <div className="flex gap-2"><Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} icon={<ArrowUp className="size-4" aria-hidden />}>Up</Button><Button size="sm" variant="ghost" disabled={i === ws.length - 1} onClick={() => move(i, 1)} icon={<ArrowDown className="size-4" aria-hidden />}>Down</Button><Button size="sm" variant="ghost" onClick={() => onChange(ws.filter((_, j) => j !== i))} icon={<Trash2 className="size-4" aria-hidden />}>Remove</Button></div>}
        </fieldset>
      ))}
      {error && <p role="alert" className="text-sm text-absent">{error}</p>}
      {!disabled && <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => onChange([...ws, { id: newId(), title: '', reportId: reports.data?.data[0]?.id ?? '', display: 'bar', size: 'md' }])}>Add widget</Button>}
    </div>
  );
}

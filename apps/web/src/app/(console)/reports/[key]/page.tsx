'use client';
import { useQuery } from '@tanstack/react-query';
import { Banner, Button, DataTable, EmptyState, Field, Input, KpiBand, PageBody, PageHeader, useToast, type DataColumn } from '@trackrex/ui';
import { Download } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError, download } from '@/shared/api/client';
import { RefPicker } from '@/shared/crud/fields';

interface Col { key: string; label: string; type: 'text' | 'number' | 'date' | 'hours' | 'percent'; sum?: boolean }
interface Result { report: { key: string; name: string; description: string }; params: { from: string; to: string }; columns: Col[]; rows: Record<string, string | number | null>[]; totals: Record<string, number> | null; truncated: boolean }
type Row = Record<string, string | number | null> & { __id: number };

const fmt = (c: Col, v: string | number | null): string => {
  if (v === null || v === undefined || v === '') return '–';
  if (c.type === 'hours') { const m = Math.round(Number(v) * 60); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`; }
  if (c.type === 'percent') return `${Number(v)}%`;
  if (c.type === 'number') return Number(v).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(v);
};
const monthStart = () => `${new Date().toISOString().slice(0, 8)}01`;
const today = () => new Date().toISOString().slice(0, 10);

export default function ReportPage() {
  const { key } = useParams<{ key: string }>();
  const toast = useToast();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [dept, setDept] = useState<string | null>(null);
  const query = { from, to, ...(dept ? { departmentId: dept } : {}) };
  const q = useQuery({ queryKey: ['report', key, from, to, dept], queryFn: () => api<Result>(`/v1/reports/${key}`, { query }), retry: false });
  const data = q.data;
  const cols: DataColumn<Row>[] = (data?.columns ?? []).map((c) => ({ key: c.key, header: c.label, numeric: c.type !== 'text', cell: (r) => fmt(c, r[c.key] ?? null) }));
  const rows: Row[] = (data?.rows ?? []).map((r, i) => ({ ...r, __id: i }));
  const save = (format: 'xlsx' | 'csv') => void download(`/v1/reports/${key}/export`, { ...query, format }, `${key}.${format}`).catch((e) => toast('error', e instanceof ApiError ? e.message : 'Could not export.'));

  return (
    <>
      <PageHeader title={data?.report.name ?? 'Report'} scope="Reports" description={data?.report.description}
        secondary={<><Button icon={<Download className="size-4" aria-hidden />} onClick={() => save('xlsx')} disabled={!rows.length}>Excel</Button><Button onClick={() => save('csv')} disabled={!rows.length}>CSV</Button></>} />
      <PageBody className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From">{(id) => <Input id={id} type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label="To">{(id) => <Input id={id} type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />}</Field>
          {key !== 'headcount' && <div className="w-56"><Field label="Department">{() => <RefPicker entity="departments" value={dept} onChange={setDept} placeholder="All departments" />}</Field></div>}
        </div>
        {q.isError && <Banner tone="error">{q.error instanceof ApiError ? q.error.message : 'Could not run this report.'}</Banner>}
        {data?.truncated && <Banner tone="warn">Only the first 5,000 rows are shown. Narrow the period or department.</Banner>}
        {data?.totals && <KpiBand items={data.columns.filter((c) => data.totals![c.key] !== undefined).map((c) => ({ label: `Total ${c.label.toLowerCase()}`, value: fmt(c, data.totals![c.key]!) }))} />}
        <DataTable caption={data?.report.name ?? 'Report'} columns={cols} rows={rows} rowKey={(r) => String(r.__id)} loading={q.isLoading}
          empty={<EmptyState title="Nothing in this period" hint="Try a wider date range." />} />
      </PageBody>
    </>
  );
}

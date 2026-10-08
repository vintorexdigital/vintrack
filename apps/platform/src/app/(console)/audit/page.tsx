'use client';
import { useQuery } from '@tanstack/react-query';
import { DataTable, EmptyState, PageBody, PageHeader, type DataColumn } from '@trackrex/ui';
import { api } from '@/shared/api';

interface Row { id: string; at: string; action: string; tenantId: string | null; actorId: string | null; details: Record<string, unknown> }

export default function PlatformAudit() {
  const q = useQuery({ queryKey: ['platform-audit'], queryFn: () => api<Row[]>('/platform/v1/audit', { query: { limit: 200 } }) });
  const cols: DataColumn<Row>[] = [
    { key: 'at', header: 'When', numeric: true, cell: (r) => new Date(r.at).toLocaleString() },
    { key: 'action', header: 'Action', cell: (r) => <span className="font-mono text-xs">{r.action}</span> },
    { key: 'tenant', header: 'Company', cell: (r) => (r.tenantId ? <a className="underline" href={`/companies/${r.tenantId}`}>{r.tenantId.slice(0, 8)}</a> : <span className="text-muted">platform</span>) },
    { key: 'details', header: 'Details', cell: (r) => <span className="text-xs text-muted">{Object.entries(r.details ?? {}).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ')}</span> },
  ];
  return (
    <>
      <PageHeader title="Platform audit log" scope="Platform" description="Append-only record of staff actions across all companies." />
      <PageBody><DataTable caption="Platform audit log" columns={cols} rows={q.data ?? []} rowKey={(r) => r.id} loading={q.isLoading} empty={<EmptyState title="Nothing recorded yet" />} /></PageBody>
    </>
  );
}

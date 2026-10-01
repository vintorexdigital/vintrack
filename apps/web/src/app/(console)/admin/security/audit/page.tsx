'use client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Button, DataTable, EmptyState, Input, PageBody, PageHeader, StatusPill, type DataColumn } from '@trackrex/ui';
import { useState } from 'react';
import { api } from '@/shared/api/client';

interface Row { id: string; at: string; entity: string; entityId: string | null; action: string; actorName: string | null; source: string; ip: string | null; impersonatorId: string | null; changes: Record<string, { old?: unknown; new?: unknown }> }

export default function AuditPage() {
  const [entity, setEntity] = useState('');
  const q = useInfiniteQuery({
    queryKey: ['audit-log', entity], initialPageParam: '',
    queryFn: ({ pageParam }) => api<{ data: Row[]; nextCursor: string | null }>('/v1/audit', { query: { entity, limit: 50, cursor: pageParam } }),
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  const cols: DataColumn<Row>[] = [
    { key: 'at', header: 'When', numeric: true, cell: (r) => new Date(r.at).toLocaleString() },
    { key: 'actor', header: 'Who', cell: (r) => <>{r.actorName ?? 'System'}{r.impersonatorId && <span className="ml-2"><StatusPill tone="late">Support</StatusPill></span>}</> },
    { key: 'action', header: 'Action', cell: (r) => r.action.replace(/_/g, ' ') },
    { key: 'entity', header: 'Record', cell: (r) => <>{r.entity}{r.entityId ? <span className="ml-1 text-xs text-muted">{r.entityId.slice(0, 8)}</span> : null}</> },
    { key: 'changes', header: 'Changes', cell: (r) => <span className="line-clamp-2 text-xs text-muted">{Object.entries(r.changes).slice(0, 4).map(([k, c]) => `${k}: ${JSON.stringify(c.old ?? null)} → ${JSON.stringify(c.new ?? null)}`).join('; ') || '–'}</span> },
    { key: 'source', header: 'Source', cell: (r) => <>{r.source}{r.ip ? <span className="ml-1 text-xs text-muted">{r.ip}</span> : null}</> },
  ];
  return (
    <>
      <PageHeader title="Audit log" scope="Admin · Security" description="Every change: who made it, from where, and the field-level old and new values." />
      <PageBody className="space-y-3">
        <label className="block text-sm font-medium">Record type<Input className="mt-1.5 max-w-xs" placeholder="employees, shifts, settings…" value={entity} onChange={(e) => setEntity(e.target.value.trim())} /></label>
        <DataTable caption="Audit log" columns={cols} rows={rows} rowKey={(r) => r.id} loading={q.isLoading} empty={<EmptyState title="No entries yet" />} />
        {q.hasNextPage && <div className="flex justify-center"><Button loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Load more</Button></div>}
      </PageBody>
    </>
  );
}

'use client';
import { useQuery } from '@tanstack/react-query';
import { Button, EmptyState, PageBody, PageHeader, StatusPill, TabsView, type TabDef } from '@trackrex/ui';
import { useRouter } from 'next/navigation';
import { api } from '../api/client';
import { CrudFormBody, FormSkeleton } from './crud-form';
import { titleOf, type Resource, type Row } from './resource';
import { useCrudResource } from './use-crud';

interface AuditRow { id: string; at: string; action: string; actorName: string | null; impersonatorId: string | null; source: string; changes: Record<string, { old?: unknown; new?: unknown }> }

const show = (v: unknown) => (v === null || v === undefined ? '–' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** Every configuration object has an audit history: who changed which field, from what to what. */
export function AuditHistory({ entity, entityId }: { entity: string; entityId: string }) {
  const q = useQuery({ queryKey: ['audit', entity, entityId], queryFn: () => api<{ data: AuditRow[] }>('/v1/audit', { query: { entity, entityId, limit: 50 } }), retry: false });
  if (q.isError) return <EmptyState title="Audit history is not available" hint="You need permission to view the audit log." />;
  if (q.isLoading) return <p className="text-sm text-muted">Loading…</p>;
  const rows = q.data?.data ?? [];
  if (!rows.length) return <EmptyState title="No changes recorded yet" />;
  return (
    <ol className="space-y-3">
      {rows.map((a) => (
        <li key={a.id} className="border-l-2 border-rule pl-3">
          <p className="text-sm"><span className="font-medium">{a.actorName ?? 'System'}</span> {a.action.replace(/_/g, ' ')} <span className="text-muted">· {new Date(a.at).toLocaleString()} · {a.source}</span>{a.impersonatorId && <span className="ml-2 text-xs"><StatusPill tone="late">Support</StatusPill></span>}</p>
          {Object.entries(a.changes).length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-muted">
              {Object.entries(a.changes).slice(0, 12).map(([f, c]) => <li key={f}><span className="font-medium text-ink">{f}</span>: <span className="line-through">{show(c.old)}</span> → {show(c.new)}</li>)}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}

export function CrudDetail({ resource: r, id }: { resource: Resource; id: string }) {
  const router = useRouter();
  const crud = useCrudResource(r);
  const q = crud.useOne(id);
  if (q.isLoading) return <FormSkeleton />;
  if (q.isError || !q.data) return <EmptyState title={`${r.kit.def.singular} not found`} hint="It may have been deleted or you may not have access." action={<Button onClick={() => router.push(r.routeBase)}>Back to {r.kit.def.plural.toLowerCase()}</Button>} />;
  const row: Row = q.data;
  const tabs: TabDef[] = [
    { value: 'details', label: 'Details', content: <CrudFormBody resource={r} row={row} onSaved={() => void q.refetch()} /> },
    ...(r.detailTabs?.(row) ?? []),
    { value: 'audit', label: 'Audit history', content: <AuditHistory entity={r.kit.def.key} entityId={row.id} /> },
  ];
  return (
    <>
      <PageHeader title={titleOf(r, row)} scope={`${r.scope ? `${r.scope} · ` : ''}${r.kit.def.plural}`}
        secondary={<>{row.deletedAt ? <StatusPill tone="non-working">Deleted</StatusPill> : typeof row.status === 'string' ? <StatusPill tone={row.status === 'active' || row.status === 'approved' || row.status === 'published' ? 'present' : row.status === 'pending' || row.status === 'draft' ? 'pending' : 'non-working'}>{row.status}</StatusPill> : null}<Button onClick={() => router.push(r.routeBase)}>Back</Button></>} />
      <PageBody wide={false}><TabsView tabs={tabs} /></PageBody>
    </>
  );
}

'use client';
import { useQuery } from '@tanstack/react-query';
import { DataTable, EmptyState, PageBody, PageHeader, Section, StatusPill, type DataColumn } from '@trackrex/ui';
import { api } from '@/shared/api';

interface Reseller { id: string; name: string; slug: string; contactEmail: string | null; marginPct: string; status: string }
interface Group { id: string; name: string; createdAt: string }

export default function Resellers() {
  const r = useQuery({ queryKey: ['resellers'], queryFn: () => api<Reseller[]>('/platform/v1/resellers') });
  const g = useQuery({ queryKey: ['groups'], queryFn: () => api<Group[]>('/platform/v1/company-groups') });
  const rc: DataColumn<Reseller>[] = [
    { key: 'name', header: 'Reseller', cell: (x) => <span><span className="font-medium">{x.name}</span><span className="block text-xs text-muted">{x.slug}</span></span> },
    { key: 'email', header: 'Contact', cell: (x) => x.contactEmail ?? <span className="text-muted">–</span> },
    { key: 'margin', header: 'Margin', numeric: true, cell: (x) => `${Number(x.marginPct)}%` },
    { key: 'status', header: 'Status', cell: (x) => <StatusPill tone={x.status === 'active' ? 'present' : 'non-working'}>{x.status}</StatusPill> },
  ];
  const gc: DataColumn<Group>[] = [
    { key: 'name', header: 'Group', cell: (x) => <span className="font-medium">{x.name}</span> },
    { key: 'created', header: 'Created', numeric: true, cell: (x) => new Date(x.createdAt).toLocaleDateString() },
  ];
  return (
    <>
      <PageHeader title="Resellers and groups" scope="Platform" description="Resellers sell and support companies; groups let one billing owner span several companies." />
      <PageBody className="space-y-6">
        <Section title="Resellers"><DataTable caption="Resellers" columns={rc} rows={r.data ?? []} rowKey={(x) => x.id} loading={r.isLoading} empty={<EmptyState title="No resellers" hint="Resellers are created by the platform team." />} /></Section>
        <Section title="Company groups"><DataTable caption="Company groups" columns={gc} rows={g.data ?? []} rowKey={(x) => x.id} loading={g.isLoading} empty={<EmptyState title="No company groups" />} /></Section>
      </PageBody>
    </>
  );
}

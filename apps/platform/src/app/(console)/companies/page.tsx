'use client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Button, DataTable, EmptyState, Input, PageBody, PageHeader, StatusPill, cn, type DataColumn } from '@trackrex/ui';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/shared/api';
import { useSession } from '@/shared/session';
import { tone } from '@/shared/tone';

interface Row { id: string; slug: string; name: string; status: string; plan: string; seatLimit: number; employeesActive: number; trialEndsAt: string | null; isDemo: boolean; supportAccessEnabled: boolean; createdAt: string }
const TABS = [['', 'All'], ['active', 'Active'], ['trial', 'Trial'], ['past_due', 'Past due'], ['suspended', 'Suspended'], ['cancelled,deleted', 'Closed']] as const;

export default function CompaniesPage() {
  const router = useRouter();
  const { can } = useSession();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const list = useInfiniteQuery({
    queryKey: ['companies', status, q], initialPageParam: '',
    queryFn: ({ pageParam }) => api<{ data: Row[]; nextCursor: string | null; total: number }>('/platform/v1/tenants', { query: { status, q, limit: 25, cursor: pageParam } }),
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const cols: DataColumn<Row>[] = [
    { key: 'name', header: 'Company', cell: (r) => <span><span className="font-medium">{r.name}</span>{r.isDemo && <span className="ml-2 text-xs text-muted">demo</span>}<span className="block text-xs text-muted">{r.slug}</span></span> },
    { key: 'status', header: 'Status', cell: (r) => <StatusPill tone={tone(r.status)}>{r.status.replace('_', ' ')}</StatusPill> },
    { key: 'plan', header: 'Plan', cell: (r) => <span className="capitalize">{r.plan.replace('_', ' ')}</span> },
    { key: 'seats', header: 'Seats', numeric: true, cell: (r) => { const pct = Math.min(100, Math.round((r.employeesActive / Math.max(1, r.seatLimit)) * 100)); return <span className="inline-flex items-center gap-2"><span className="tabular-nums">{r.employeesActive} / {r.seatLimit}</span><span className="hidden h-1.5 w-16 overflow-hidden rounded-pill bg-soft md:inline-block" role="img" aria-label={`${pct}% of seats used`}><span className={cn('block h-full', pct >= 100 ? 'bg-absent' : pct >= 90 ? 'bg-late' : 'bg-brand')} style={{ width: `${pct}%` }} /></span></span>; } },
    { key: 'trial', header: 'Trial ends', numeric: true, cell: (r) => (r.trialEndsAt ? new Date(r.trialEndsAt).toLocaleDateString() : <span className="text-muted">–</span>) },
    { key: 'created', header: 'Created', numeric: true, cell: (r) => new Date(r.createdAt).toLocaleDateString() },
  ];
  return (
    <>
      <PageHeader title="Companies" scope="Platform" description={`${list.data?.pages[0]?.total ?? 0} matching`} primary={can('onboarding') ? <Button variant="primary" icon={<Plus className="size-4" aria-hidden />} onClick={() => router.push('/companies/new')}>Provision company</Button> : undefined} />
      <PageBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Status" className="flex flex-wrap rounded-button border border-rule bg-soft p-0.5">{TABS.map(([v, l]) => <button key={v} type="button" aria-pressed={status === v} onClick={() => setStatus(v)} className={cn('min-h-8 rounded-input px-3 text-xs font-semibold', status === v ? 'bg-brand text-on-brand' : 'text-muted hover:text-ink')}>{l}</button>)}</div>
          <Input aria-label="Search companies" placeholder="Search by company name" className="max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <DataTable caption="Companies" columns={cols} rows={rows} rowKey={(r) => r.id} loading={list.isLoading} onRowClick={(r) => router.push(`/companies/${r.id}`)} empty={<EmptyState title="No companies match" hint="Change the status filter or provision a company." />} />
        {list.hasNextPage && <div className="flex justify-center"><Button loading={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>Load more</Button></div>}
      </PageBody>
    </>
  );
}

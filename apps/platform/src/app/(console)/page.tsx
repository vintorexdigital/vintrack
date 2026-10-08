'use client';
import { useQuery } from '@tanstack/react-query';
import { KpiBand, PageBody, PageHeader, Skeleton, StatusPill } from '@trackrex/ui';
import Link from 'next/link';
import { api } from '@/shared/api';

interface Overview { byStatus: Record<string, number>; seats: { sold: number; used: number }; trialsEnding: { id: string; name: string; trialEndsAt: string }[]; pastDue: { id: string; name: string; since: string }[]; openSupportSessions: number }

export default function OverviewPage() {
  const q = useQuery({ queryKey: ['overview'], queryFn: () => api<Overview>('/platform/v1/overview'), refetchInterval: 30_000 });
  const o = q.data;
  const total = o ? Object.entries(o.byStatus).filter(([k]) => k !== 'deleted').reduce((a, [, n]) => a + n, 0) : 0;
  return (
    <>
      <PageHeader title="Overview" scope="Platform" description="Companies by lifecycle state, seats sold and used, and what needs attention." />
      {q.isLoading || !o ? <Skeleton className="m-4 h-20" /> : (
        <KpiBand items={[
          { label: 'Companies', value: total, hint: `${o.byStatus.active ?? 0} active, ${o.byStatus.trial ?? 0} in trial` },
          { label: 'Seats used', value: o.seats.used, unit: `of ${o.seats.sold} sold`, hint: o.seats.sold ? `${Math.round((o.seats.used / o.seats.sold) * 100)}% utilised` : undefined },
          { label: 'Past due', value: o.byStatus.past_due ?? 0 },
          { label: 'Suspended', value: o.byStatus.suspended ?? 0 },
          { label: 'Open support sessions', value: o.openSupportSessions },
        ]} />
      )}
      <PageBody className="mt-6 grid gap-6 lg:grid-cols-2">
        <section><h2 className="mb-2 text-section font-semibold">Trials ending within 7 days</h2>
          {o?.trialsEnding.length ? <ul className="divide-y divide-rule border-y border-rule bg-surface">{o.trialsEnding.map((t) => <li key={t.id} className="flex min-h-11 items-center justify-between px-3"><Link href={`/companies/${t.id}`}>{t.name}</Link><span className="text-xs tabular-nums text-muted">{new Date(t.trialEndsAt).toLocaleDateString()}</span></li>)}</ul> : <p className="text-sm text-muted">No trials are ending soon.</p>}
        </section>
        <section><h2 className="mb-2 text-section font-semibold">Past due</h2>
          {o?.pastDue.length ? <ul className="divide-y divide-rule border-y border-rule bg-surface">{o.pastDue.map((t) => <li key={t.id} className="flex min-h-11 items-center justify-between px-3"><Link href={`/companies/${t.id}`}>{t.name}</Link><StatusPill tone="late">Since {new Date(t.since).toLocaleDateString()}</StatusPill></li>)}</ul> : <p className="text-sm text-muted">Nothing is overdue.</p>}
        </section>
      </PageBody>
    </>
  );
}

'use client';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, PageBody, PageHeader, Skeleton } from '@trackrex/ui';
import Link from 'next/link';
import { api } from '@/shared/api/client';

interface Entry { key: string; name: string; description: string; category: string }

export default function ReportsIndex() {
  const q = useQuery({ queryKey: ['reports'], queryFn: () => api<Entry[]>('/v1/reports') });
  const cats = [...new Set(q.data?.map((r) => r.category))];
  return (
    <>
      <PageHeader title="Reports" description="Run a report for any period, then download it as Excel or CSV. You see only the people in your scope." />
      <PageBody className="space-y-8">
        {q.isLoading && <Skeleton className="h-40" />}
        {q.data?.length === 0 && <EmptyState title="No reports available" />}
        {cats.map((c) => (
          <section key={c}>
            <h2 className="mb-3 text-section font-semibold">{c}</h2>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {q.data?.filter((r) => r.category === c).map((r) => (
                <li key={r.key}><Link href={`/reports/${r.key}`} className="block h-full rounded-card border border-rule bg-surface p-4 no-underline hover:border-brand"><span className="font-semibold text-ink">{r.name}</span><span className="mt-1 block text-sm text-muted">{r.description}</span></Link></li>
              ))}
            </ul>
          </section>
        ))}
      </PageBody>
    </>
  );
}

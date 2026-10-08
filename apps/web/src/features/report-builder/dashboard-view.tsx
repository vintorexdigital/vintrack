'use client';
import { useQuery } from '@tanstack/react-query';
import { Banner, Button, EmptyState, PageBody, PageHeader, Skeleton } from '@trackrex/ui';
import { Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/auth';
import { ReportsTabs } from './reports-tabs';
import { ResultView, type BuiltResult, type Display } from './result-view';

interface Widget { id: string; title: string; reportId: string; display: Display; size: 'sm' | 'md' | 'lg' }
interface Data { dashboard: { id: string; name: string; description: string | null; widgets: Widget[] }; results: { widgetId: string; result?: BuiltResult; error?: string }[] }
const SPAN = { sm: 'md:col-span-1', md: 'md:col-span-2', lg: 'md:col-span-4' } as const;

/** A dashboard: each widget runs for the person looking at it, so two people can see different numbers on the same page. */
export function DashboardView({ id }: { id: string }) {
  const router = useRouter();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['dashboard-data', id], queryFn: () => api<Data>(`/v1/report-builder/dashboards/${id}/data`), refetchInterval: 5 * 60_000 });
  if (q.isLoading) return <Skeleton className="m-6 h-64" />;
  if (q.isError || !q.data) return <EmptyState title="Dashboard not found" hint={q.error instanceof ApiError ? q.error.message : undefined} action={<Button onClick={() => router.push('/reports/dashboards')}>Back to dashboards</Button>} />;
  const { dashboard, results } = q.data;
  const by = new Map(results.map((r) => [r.widgetId, r]));
  return (
    <>
      <PageHeader title={dashboard.name} scope="Reports · Dashboards" description={dashboard.description ?? 'Numbers refresh every few minutes. You see only the people in your scope.'}
        primary={can('reports.dashboard.update') ? <Button variant="primary" icon={<Pencil className="size-4" aria-hidden />} onClick={() => router.push(`/reports/dashboards/${id}/edit`)}>Edit</Button> : undefined} />
      <ReportsTabs />
      <PageBody>
        {dashboard.widgets.length === 0 && <EmptyState title="Nothing on this dashboard yet" hint="Edit it to add widgets from your saved reports." />}
        <div className="grid gap-4 md:grid-cols-4">
          {dashboard.widgets.map((w) => {
            const r = by.get(w.id);
            return (
              <section key={w.id} aria-labelledby={`w-${w.id}`} className={`min-w-0 rounded-card border border-rule bg-surface p-4 ${SPAN[w.size]}`}>
                <h2 id={`w-${w.id}`} className="mb-3 text-section font-semibold">{w.title}</h2>
                {r?.error ? <Banner tone="warn">{r.error}</Banner> : r?.result ? <ResultView result={r.result} display={w.display} /> : <Skeleton className="h-24" />}
              </section>
            );
          })}
        </div>
      </PageBody>
    </>
  );
}

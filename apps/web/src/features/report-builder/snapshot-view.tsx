'use client';
import { useQuery } from '@tanstack/react-query';
import { Button, EmptyState, PageBody, PageHeader, Skeleton } from '@trackrex/ui';
import { Download } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api, download } from '@/shared/api/client';
import { ReportsTabs } from './reports-tabs';
import { ResultTable, type BuiltResult } from './result-view';

export function SnapshotView({ id }: { id: string }) {
  const router = useRouter();
  const q = useQuery({ queryKey: ['snapshot', id], queryFn: () => api<{ name: string; rangeFrom: string; rangeTo: string; columns: BuiltResult['columns']; rows: BuiltResult['rows']; truncated: boolean; createdAt: string }>(`/v1/report-builder/snapshots/${id}`) });
  if (q.isLoading) return <Skeleton className="m-6 h-64" />;
  if (!q.data) return <EmptyState title="Copy not found" hint="Delivered copies are private to the person they were sent to and are kept for 90 days." action={<Button onClick={() => router.push('/reports/schedules')}>Back</Button>} />;
  const s = q.data;
  return (
    <>
      <PageHeader title={s.name} scope="Reports · Delivered copy" description={`${s.rangeFrom} to ${s.rangeTo}, as it was on ${new Date(s.createdAt).toLocaleString()}.`}
        secondary={<><Button icon={<Download className="size-4" aria-hidden />} onClick={() => void download(`/v1/report-builder/snapshots/${id}/export`, { format: 'xlsx' }, 'report.xlsx')}>Excel</Button><Button onClick={() => void download(`/v1/report-builder/snapshots/${id}/export`, { format: 'csv' }, 'report.csv')}>CSV</Button></>} />
      <ReportsTabs />
      <PageBody><ResultTable result={{ range: { from: s.rangeFrom, to: s.rangeTo }, columns: s.columns, rows: s.rows, truncated: s.truncated, definition: { chart: 'table' } }} /></PageBody>
    </>
  );
}

'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, DataTable, EmptyState, PageBody, PageHeader, StatusPill, useToast, type DataColumn } from '@trackrex/ui';
import Link from 'next/link';
import { api } from '@/shared/api/client';
import { ReportsTabs } from './reports-tabs';

interface Sched { id: string; reportId: string; reportName: string; frequency: string; weekday: number; dayOfMonth: number; hour: number; nextRunAt: string; lastRunAt: string | null; lastStatus: string | null }
interface Snap { id: string; name: string; rangeFrom: string; rangeTo: string; rowCount: number; createdAt: string }
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const when = (s: Sched) => `${s.frequency === 'daily' ? 'Every day' : s.frequency === 'weekly' ? `Every ${WEEKDAYS[s.weekday]}` : `On day ${s.dayOfMonth} of each month`} at ${String(s.hour).padStart(2, '0')}:00`;

export function SchedulesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const sch = useQuery({ queryKey: ['report-schedules'], queryFn: () => api<{ data: Sched[] }>('/v1/report-builder/schedules') });
  const snaps = useQuery({ queryKey: ['report-snapshots'], queryFn: () => api<{ data: Snap[] }>('/v1/report-builder/snapshots') });
  const remove = useMutation({ mutationFn: (id: string) => api(`/v1/report-builder/schedules/${id}`, { method: 'DELETE' }), onSuccess: () => { toast('success', 'Schedule removed.'); void qc.invalidateQueries({ queryKey: ['report-schedules'] }); } });
  const sc: DataColumn<Sched>[] = [
    { key: 'name', header: 'Report', cell: (r) => <Link href={`/reports/saved/${r.reportId}`}>{r.reportName}</Link> },
    { key: 'when', header: 'When', cell: (r) => when(r) },
    { key: 'next', header: 'Next', numeric: true, cell: (r) => new Date(r.nextRunAt).toLocaleString() },
    { key: 'last', header: 'Last run', cell: (r) => (r.lastRunAt ? <>{new Date(r.lastRunAt).toLocaleString()} {r.lastStatus && <StatusPill tone={r.lastStatus === 'sent' ? 'present' : 'absent'}>{r.lastStatus === 'sent' ? 'sent' : 'failed'}</StatusPill>}</> : <span className="text-muted">Not yet</span>) },
    { key: 'x', header: '', cell: (r) => <Button size="sm" variant="ghost" onClick={() => remove.mutate(r.id)}>Remove</Button> },
  ];
  const sn: DataColumn<Snap>[] = [
    { key: 'name', header: 'Report', cell: (r) => <Link href={`/reports/snapshots/${r.id}`}>{r.name}</Link> },
    { key: 'range', header: 'Period', numeric: true, cell: (r) => `${r.rangeFrom} to ${r.rangeTo}` },
    { key: 'rows', header: 'Rows', numeric: true, cell: (r) => r.rowCount },
    { key: 'at', header: 'Created', numeric: true, cell: (r) => new Date(r.createdAt).toLocaleString() },
  ];
  return (
    <>
      <PageHeader title="Scheduled reports" scope="Reports" description="Reports sent to you on a schedule. Each delivery is a saved copy of what you could see at that time, kept for 90 days." />
      <ReportsTabs />
      <PageBody className="space-y-8">
        <section className="space-y-2"><h2 className="text-section font-semibold">Schedules</h2>
          <DataTable caption="Schedules" columns={sc} rows={sch.data?.data ?? []} rowKey={(r) => r.id} loading={sch.isLoading} empty={<EmptyState title="Nothing scheduled" hint="Open a saved report and choose “Send me this…”." />} />
        </section>
        <section className="space-y-2"><h2 className="text-section font-semibold">Delivered copies</h2>
          <DataTable caption="Delivered copies" columns={sn} rows={snaps.data?.data ?? []} rowKey={(r) => r.id} loading={snaps.isLoading} empty={<EmptyState title="No copies yet" />} />
        </section>
      </PageBody>
    </>
  );
}

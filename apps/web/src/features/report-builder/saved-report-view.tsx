'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner, Button, EmptyState, Modal, PageBody, PageHeader, Select, Skeleton, useToast } from '@trackrex/ui';
import { Download, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError, download } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/auth';
import { ReportsTabs } from './reports-tabs';
import { ResultView, type BuiltResult } from './result-view';

interface Saved { id: string; name: string; description: string | null; visibility: string; createdBy: string | null }
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function ScheduleDialog({ reportId, open, onOpenChange }: { reportId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [frequency, setFrequency] = useState('weekly');
  const [weekday, setWeekday] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [hour, setHour] = useState(8);
  const save = useMutation({
    mutationFn: () => api<{ nextRunAt: string }>('/v1/report-builder/schedules', { method: 'POST', body: { reportId, frequency, weekday, dayOfMonth, hour } }),
    onSuccess: (r) => { toast('success', `Scheduled. The first one arrives ${new Date(r.nextRunAt).toLocaleString()}.`); void qc.invalidateQueries({ queryKey: ['report-schedules'] }); onOpenChange(false); },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Could not schedule.'),
  });
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Send me this report" description="You get a notification with a link to a saved copy, built with the people you can see at that time."
      footer={<><Button onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Schedule</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">How often<Select className="mt-1.5 block" value={frequency} onChange={(e) => setFrequency(e.target.value)}><option value="daily">Every day</option><option value="weekly">Every week</option><option value="monthly">Every month</option></Select></label>
        {frequency === 'weekly' && <label className="text-sm font-medium">On<Select className="mt-1.5 block" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</Select></label>}
        {frequency === 'monthly' && <label className="text-sm font-medium">On day<Select className="mt-1.5 block" value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))}>{Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}</Select></label>}
        <label className="text-sm font-medium">At<Select className="mt-1.5 block" value={hour} onChange={(e) => setHour(Number(e.target.value))}>{Array.from({ length: 24 }, (_, h) => h).map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</Select></label>
      </div>
    </Modal>
  );
}

/** Opens a saved report: runs it for the viewer, with download and schedule. */
export function SavedReportView({ id }: { id: string }) {
  const router = useRouter();
  const { can } = useAuth();
  const [scheduling, setScheduling] = useState(false);
  const meta = useQuery({ queryKey: ['saved-report', id], queryFn: () => api<Saved>(`/v1/report-builder/reports/${id}`) });
  const run = useQuery({ queryKey: ['saved-report-run', id], queryFn: () => api<BuiltResult>(`/v1/report-builder/reports/${id}/run`) });
  if (meta.isLoading) return <Skeleton className="m-6 h-64" />;
  if (meta.isError || !meta.data) return <EmptyState title="Report not found" hint="It may have been deleted, or it is private to someone else." action={<Button onClick={() => router.push('/reports/saved')}>Back to saved reports</Button>} />;
  const r = meta.data;
  return (
    <>
      <PageHeader title={r.name} scope="Reports · Saved" description={r.description ?? `${run.data ? `${run.data.range.from} to ${run.data.range.to}. ` : ''}You see only the people in your scope.`}
        secondary={<>
          <Button icon={<Download className="size-4" aria-hidden />} onClick={() => void download(`/v1/report-builder/reports/${id}/export`, { format: 'xlsx' }, 'report.xlsx')}>Excel</Button>
          <Button onClick={() => void download(`/v1/report-builder/reports/${id}/export`, { format: 'csv' }, 'report.csv')}>CSV</Button>
          <Button onClick={() => setScheduling(true)}>Send me this…</Button>
        </>}
        primary={can('reports.builder.update') ? <Button variant="primary" icon={<Pencil className="size-4" aria-hidden />} onClick={() => router.push(`/reports/saved/${id}/edit`)}>Edit</Button> : undefined} />
      <ReportsTabs />
      <PageBody className="space-y-3">
        {run.isLoading ? <Skeleton className="h-48" /> : run.isError ? <Banner tone="error">{run.error instanceof ApiError ? run.error.message : 'Could not run the report.'}</Banner> : run.data && <ResultView result={run.data} />}
      </PageBody>
      <ScheduleDialog reportId={id} open={scheduling} onOpenChange={setScheduling} />
    </>
  );
}

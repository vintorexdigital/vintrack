'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner, DataTable, EmptyState, PageBody, PageHeader, Skeleton, Toggle, useToast, type DataColumn } from '@trackrex/ui';
import { api, ApiError } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/auth';

interface Session { id: string; staffName: string; reason: string; startedAt: string; expiresAt: string; endedAt: string | null }

export default function SupportPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const auth = useAuth();
  const q = useQuery({ queryKey: ['support-access'], queryFn: () => api<{ session: Session | null; history: Session[] }>('/v1/company/support-access') });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => api('/v1/company/support-access', { method: 'PUT', body: { enabled } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['support-access'] }); void auth.reload(); },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Could not change support access.'),
  });
  const cols: DataColumn<Session>[] = [
    { key: 'staff', header: 'Support agent', cell: (r) => r.staffName },
    { key: 'reason', header: 'Reason', cell: (r) => r.reason },
    { key: 'start', header: 'Started', numeric: true, cell: (r) => new Date(r.startedAt).toLocaleString() },
    { key: 'end', header: 'Ended', numeric: true, cell: (r) => (r.endedAt ? new Date(r.endedAt).toLocaleString() : new Date(r.expiresAt) > new Date() ? 'Active' : 'Expired') },
  ];
  return (
    <>
      <PageHeader title="Support access" scope="Admin · Security" description="Vintorex support can only look at your company when you allow it. Each session needs a reason, is time-boxed and appears below." />
      <PageBody wide={false} className="space-y-6">
        {q.isLoading ? <Skeleton className="h-24" /> : (
          <>
            <Toggle label="Allow Vintorex support to access this company" help="Support staff see configuration to help you. They never see attendance, locations, productivity or payroll data." checked={!!auth.me?.company.supportAccessEnabled} onChange={(v) => toggle.mutate(v)} />
            {q.data?.session && <Banner tone="warn">{q.data.session.staffName} has access until {new Date(q.data.session.expiresAt).toLocaleString()}. Turning access off ends the session immediately.</Banner>}
            <section><h2 className="mb-2 text-section font-semibold">Session history</h2><DataTable caption="Support sessions" columns={cols} rows={q.data?.history ?? []} rowKey={(r) => r.id} empty={<EmptyState title="No support sessions yet" hint="When support needs access, a session appears here." />} /></section>
          </>
        )}
      </PageBody>
    </>
  );
}

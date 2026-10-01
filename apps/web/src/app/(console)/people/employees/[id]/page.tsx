'use client';
import { useQuery } from '@tanstack/react-query';
import { Button, DayRibbon, EmptyState, PageBody, PageHeader, Skeleton, StatusPill, TabsView } from '@trackrex/ui';
import { useParams, useRouter } from 'next/navigation';
import { addDays, addMonths, enumerateDates, zonedToUtcMs } from '@trackrex/rules';
import { api } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/auth';
import { resources } from '@/features/resources';
import { CodeCell } from '@/features/attendance/code-cell';
import { BalanceStrip } from '@/features/leave/balances';
import { CrudFormBody } from '@/shared/crud/crud-form';
import { AuditHistory } from '@/shared/crud/crud-detail';
import { useCrudResource, type Row } from '@/shared/crud';

interface DayDetail { day: { statusCode: string; workedMinutes: number; lateMinutes: number }; punches: { type: string; at: string }[]; breaks: { startedAt: string; endedAt: string | null }[] }
interface Day { date: string; statusCode: string; secondaryCode: string | null; lateMark: boolean; deductionUnits: number; overrideCode: string | null }

function TodayRibbon({ employeeId, tz }: { employeeId: string; tz: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const q = useQuery({ queryKey: ['ribbon', employeeId, today], queryFn: () => api<DayDetail>(`/v1/attendance/days/${employeeId}/${today}`), refetchInterval: 60_000 });
  if (!q.data) return <Skeleton className="h-10" />;
  const from = zonedToUtcMs(today, '07:00', tz);
  const to = zonedToUtcMs(today, '22:00', tz);
  const now = Date.now();
  const ins = q.data.punches.filter((p) => p.type === 'in').map((p) => new Date(p.at).getTime());
  const outs = q.data.punches.filter((p) => p.type === 'out').map((p) => new Date(p.at).getTime());
  const segments = ins.map((s, i) => ({ start: s, end: outs[i] ?? Math.min(now, to), kind: 'worked' as const, label: 'Working' }));
  for (const b of q.data.breaks) segments.push({ start: new Date(b.startedAt).getTime(), end: b.endedAt ? new Date(b.endedAt).getTime() : now, kind: 'break' as never, label: 'Break' });
  const pins = q.data.punches.map((p) => ({ at: new Date(p.at).getTime(), type: p.type as 'in' | 'out' }));
  return (
    <div className="space-y-2">
      <DayRibbon from={from} to={to} now={now} segments={segments} pins={pins} summary={`Today: ${q.data.day.statusCode}, worked ${Math.floor(q.data.day.workedMinutes / 60)} hours ${q.data.day.workedMinutes % 60} minutes.`} formatTime={(ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: tz })} />
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted"><li>Green: working</li><li>Violet: break</li><li>Green pin: punch in</li><li>Red pin: punch out</li><li>Marigold line: now</li></ul>
    </div>
  );
}

function MonthTab({ employeeId }: { employeeId: string }) {
  const month = new Date().toISOString().slice(0, 7) + '-01';
  const q = useQuery({ queryKey: ['emp-month', employeeId, month], queryFn: () => api<Day[]>('/v1/attendance/days', { query: { from: month, to: addDays(addMonths(month, 1), -1), employeeId } }) });
  if (q.isLoading) return <Skeleton className="h-24" />;
  const byDate = new Map(q.data?.map((d) => [d.date, d]));
  return <div className="flex flex-wrap gap-1.5">{enumerateDates(month, addDays(addMonths(month, 1), -1)).map((d) => { const x = byDate.get(d); return <div key={d} className="flex w-10 flex-col items-center gap-0.5 text-xs"><span className="tabular-nums text-muted">{d.slice(8)}</span>{x ? <CodeCell code={x.statusCode} secondary={x.secondaryCode ?? undefined} late={x.lateMark} deduction={x.deductionUnits > 0} overridden={!!x.overrideCode} /> : <span className="h-7 text-muted">·</span>}</div>; })}</div>;
}

export default function EmployeeProfile() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { me } = useAuth();
  const r = resources.employees;
  const q = useCrudResource(r).useOne(id);
  if (q.isLoading) return <Skeleton className="m-6 h-64" />;
  if (!q.data) return <EmptyState title="Employee not found" hint="They may have been deleted, or are outside your scope." action={<Button onClick={() => router.push('/people/employees')}>Back to employees</Button>} />;
  const row = q.data as Row;
  const tz = me?.company.timezone ?? 'Asia/Kolkata';
  return (
    <>
      <PageHeader title={String(row.displayName)} scope={`People · Employees · ${row.code}`} secondary={<><StatusPill tone={row.status === 'active' ? 'present' : row.status === 'exited' ? 'non-working' : 'pending'}>{String(row.status)}</StatusPill><Button onClick={() => router.push('/people/employees')}>Back</Button></>} />
      <PageBody wide={false} className="space-y-6">
        {row.status === 'active' && <section aria-label="Today"><h2 className="mb-2 text-sm font-semibold">Today</h2><TodayRibbon employeeId={id} tz={tz} /></section>}
        <TabsView tabs={[
          { value: 'overview', label: 'Overview', content: <CrudFormBody resource={r} row={row} onSaved={() => void q.refetch()} /> },
          { value: 'attendance', label: 'Attendance', content: <MonthTab employeeId={id} /> },
          { value: 'leave', label: 'Leave', content: <><BalanceStrip employeeId={id} /><p className="text-sm text-muted">Requests for this employee appear under <a href="/leave/requests">Leave, Requests</a>.</p></> },
          { value: 'audit', label: 'Audit history', content: <AuditHistory entity="employees" entityId={id} /> },
        ]} />
      </PageBody>
    </>
  );
}

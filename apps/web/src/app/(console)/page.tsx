'use client';
import { useQuery } from '@tanstack/react-query';
import { KpiBand, PageBody, PageHeader, Skeleton, StatusPill } from '@trackrex/ui';
import Link from 'next/link';
import { api } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/auth';
import { Meter, Widget } from '@/shared/crud/widget';
import { useShell } from '@/shared/layout/shell-state';
import { PunchWidget, fmtDuration, usePunchStatus } from '@/shared/layout/punch-widget';

interface Summary {
  date: string;
  attendance?: { present: number; absent: number; leave: number; late: number; total: number };
  punchedIn?: number;
  approvals?: { leave?: number; regularization?: number };
  holidays?: { name: string; startDate: string; endDate: string }[];
  birthdays?: { name: string; dateOfBirth: string }[];
}
interface Balance { leaveTypeId: string; code: string; name: string; balance: number; pending: number; color: string }

const fmtDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

function useSummary() {
  const { me } = useAuth();
  return useQuery({ queryKey: ['home', me?.company.id], queryFn: () => api<Summary>('/v1/home/summary'), refetchInterval: 60_000 });
}

function Lists({ s }: { s?: Summary }) {
  return (
    <>
      {s?.holidays && <Widget title="Upcoming holidays">{s.holidays.length ? <ul className="space-y-1.5 text-sm">{s.holidays.map((h) => <li key={h.name + h.startDate} className="flex justify-between gap-2"><span>{h.name}</span><span className="tabular-nums text-muted">{fmtDate(h.startDate)}</span></li>)}</ul> : <p className="text-sm text-muted">No holidays coming up. Add them under Admin, Leave.</p>}</Widget>}
      {s?.birthdays && s.birthdays.length > 0 && <Widget title="Birthdays">{<ul className="space-y-1.5 text-sm">{s.birthdays.map((b) => <li key={b.name} className="flex justify-between gap-2"><span>{b.name}</span><span className="tabular-nums text-muted">{fmtDate(`${s.date.slice(0, 4)}-${b.dateOfBirth.slice(5)}`)}</span></li>)}</ul>}</Widget>}
    </>
  );
}

function ManagerHome() {
  const s = useSummary();
  const { can } = useAuth();
  const a = s.data?.attendance;
  const approvals = s.data?.approvals;
  return (
    <>
      <PageHeader title="Home" scope="Today" />
      <div className="mb-4 border-b border-rule">
        {s.isLoading ? <Skeleton className="m-4 h-16" /> : (
          <KpiBand items={[
            { label: 'Present today', value: a?.present ?? 0, unit: `of ${a?.total ?? 0}` },
            { label: 'Absent', value: a?.absent ?? 0 },
            { label: 'On leave', value: a?.leave ?? 0 },
            { label: 'Late marks', value: a?.late ?? 0 },
            { label: 'Punched in now', value: s.data?.punchedIn ?? 0 },
          ]} />
        )}
      </div>
      <PageBody>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
          {a && <Widget title="Attendance today" action={<Link href="/attendance/register" className="text-xs font-medium">Open register</Link>}>
            <div className="space-y-3"><Meter label="Present" value={a.present} total={a.total} tone="present" /><Meter label="Absent" value={a.absent} total={a.total} tone="absent" /><Meter label="On leave" value={a.leave} total={a.total} tone="leave" /><Meter label="Late" value={a.late} total={a.total} tone="late" /></div>
          </Widget>}
          {approvals && <Widget title="Pending approvals">
            <ul className="space-y-2 text-sm">
              {approvals.leave !== undefined && <li className="flex items-center justify-between"><Link href="/leave/requests?filter[status][eq]=pending">Leave requests</Link><StatusPill tone="pending" code={String(approvals.leave)} /></li>}
              {approvals.regularization !== undefined && <li className="flex items-center justify-between"><Link href="/attendance/regularizations?filter[status][eq]=pending">Regularizations</Link><StatusPill tone="pending" code={String(approvals.regularization)} /></li>}
              {!approvals.leave && !approvals.regularization && <li className="text-muted">Nothing is waiting for you.</li>}
            </ul>
          </Widget>}
          <Lists s={s.data} />
          {can('feed.event.read') && <Widget title="Activity feed" action={<Link href="/feed" className="text-xs font-medium">See all</Link>}><FeedMini /></Widget>}
        </div>
      </PageBody>
    </>
  );
}

function FeedMini() {
  const q = useQuery({ queryKey: ['feed-mini'], queryFn: () => api<{ data: { id: string; at: string; type: string; employeeName: string | null }[] }>('/v1/feed', { query: { limit: 6 } }), refetchInterval: 60_000 });
  if (q.isLoading) return <Skeleton className="h-24" />;
  if (!q.data?.data.length) return <p className="text-sm text-muted">Activity appears here as people punch and request leave.</p>;
  return <ul className="space-y-1.5 text-sm">{q.data.data.map((f) => <li key={f.id} className="flex justify-between gap-2"><span className="truncate">{f.employeeName ?? 'System'} · {f.type.replace('.', ' ')}</span><span className="shrink-0 tabular-nums text-muted">{new Date(f.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></li>)}</ul>;
}

function EmployeeHome() {
  const { me } = useAuth();
  const status = usePunchStatus();
  const s = useSummary();
  const bal = useQuery({ queryKey: ['my-balances'], queryFn: () => api<Balance[]>('/v1/leave/balances'), enabled: !!me?.membership.employeeId });
  const t = status.data?.today;
  return (
    <>
      <PageHeader title={`Hello, ${me?.user?.name.split(' ')[0] ?? ''}`} scope="Today" />
      <PageBody>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Widget title="Today">
            {status.data?.linked ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-3"><PunchWidget /></div>
                <KpiBand items={[{ label: 'Worked', value: t ? fmtDuration(t.workedMinutes) : '–' }, { label: 'Break', value: t ? fmtDuration(t.breakMinutes) : '–' }, { label: 'Status', value: t?.statusCode ?? '–' }]} />
                {status.data.shift && <p className="text-xs text-muted">Shift {status.data.shift.name}, starts {status.data.shift.startTime} ({status.data.shift.timezone}).</p>}
              </div>
            ) : status.isLoading ? <Skeleton className="h-24" /> : <p className="text-sm text-muted">Your account is not linked to an employee record, so punching is not available. Ask your admin.</p>}
          </Widget>
          <Widget title="Leave balances" action={<Link href="/me/leave" className="text-xs font-medium">Apply</Link>}>
            {bal.isLoading ? <Skeleton className="h-24" /> : bal.data?.length ? <ul className="space-y-2 text-sm">{bal.data.map((b) => <li key={b.leaveTypeId} className="flex items-center justify-between"><span className="flex items-center gap-2"><span aria-hidden className="size-2.5 rounded-pill" style={{ background: b.color }} />{b.name}</span><span className="tabular-nums"><span className="font-semibold">{b.balance}</span> <span className="text-muted">{b.pending > 0 ? `(${b.pending} pending)` : 'days'}</span></span></li>)}</ul> : <p className="text-sm text-muted">No leave types are set up for you yet.</p>}
          </Widget>
          <Lists s={s.data} />
        </div>
      </PageBody>
    </>
  );
}

export default function HomePage() {
  const { mode } = useShell();
  return mode === 'manager' ? <ManagerHome /> : <EmployeeHome />;
}

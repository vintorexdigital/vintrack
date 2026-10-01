'use client';
import { useQuery } from '@tanstack/react-query';
import { Button, EmptyState, IconButton, PageBody, PageHeader, Select, Skeleton, Toggle, cn } from '@trackrex/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { addDays, addMonths, enumerateDates, isNonWorkingDay, weekday } from '@trackrex/rules';
import { api } from '@/shared/api/client';

interface Cal {
  requests: { id: string; employeeName: string; typeCode: string; typeName: string; color: string; fromDate: string; toDate: string; duration: string; status: string }[];
  holidays: { id: string; name: string; startDate: string; endDate: string }[];
  nonWorking: { name: string; weekday: string; weeks: string[] | null }[];
}
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function LeaveCalendarPage() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7) + '-01');
  const [status, setStatus] = useState('pending,approved');
  const [offDays, setOffDays] = useState(true);
  const gridStart = addDays(month, -weekday(month));
  const end = addDays(addMonths(month, 1), -1);
  const gridEnd = addDays(end, 6 - weekday(end));
  const q = useQuery({ queryKey: ['leave-cal', gridStart, gridEnd, status], queryFn: () => api<Cal>('/v1/leave/calendar', { query: { from: gridStart, to: gridEnd, status } }) });
  const days = useMemo(() => enumerateDates(gridStart, gridEnd), [gridStart, gridEnd]);
  const rules = useMemo(() => (q.data?.nonWorking ?? []).map((n) => ({ weekday: Number(n.weekday), ...(n.weeks?.length ? { weeks: n.weeks.map(Number) } : {}) })), [q.data]);
  const holidayOn = (d: string) => q.data?.holidays.find((h) => h.startDate <= d && h.endDate >= d);
  const today = new Date().toISOString().slice(0, 10);
  const counts = { pending: q.data?.requests.filter((r) => r.status === 'pending').length ?? 0, approved: q.data?.requests.filter((r) => r.status === 'approved').length ?? 0 };
  return (
    <>
      <PageHeader title="Leave calendar" scope="Leave" description="Who is away, with holidays and weekly offs."
        secondary={<><div className="flex items-center gap-1"><IconButton label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="size-5" /></IconButton><span className="min-w-36 text-center text-sm font-semibold tabular-nums">{new Date(`${month}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span><IconButton label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="size-5" /></IconButton></div><Button size="sm" onClick={() => setMonth(new Date().toISOString().slice(0, 7) + '-01')}>Today</Button></>} />
      <PageBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          <Select aria-label="Status" className="w-auto" value={status} onChange={(e) => setStatus(e.target.value)}><option value="pending,approved">Pending and approved</option><option value="approved">Approved</option><option value="pending">Pending</option><option value="rejected,cancelled">Rejected and cancelled</option></Select>
          <div className="w-72"><Toggle label="Show holidays and non-working days" checked={offDays} onChange={setOffDays} /></div>
          <p className="text-sm text-muted tabular-nums">{counts.approved} approved, {counts.pending} pending</p>
        </div>
        {q.isLoading ? <Skeleton className="h-96" /> : q.isError ? <EmptyState title="Could not load the calendar" /> : (
          <div className="overflow-x-auto"><div className="grid min-w-[44rem] grid-cols-7 border-l border-t border-rule bg-surface">
            {WD.map((d) => <div key={d} className="border-b border-r border-rule bg-canvas px-2 py-1.5 text-xs font-semibold text-muted">{d}</div>)}
            {days.map((d) => {
              const hol = offDays ? holidayOn(d) : undefined;
              const nw = offDays && isNonWorkingDay(d, rules);
              const reqs = q.data!.requests.filter((r) => r.fromDate <= d && r.toDate >= d);
              return (
                <div key={d} className={cn('min-h-24 border-b border-r border-rule p-1', d.slice(0, 7) !== month.slice(0, 7) && 'opacity-50', hol && 'bg-holiday-tint', !hol && nw && 'bg-non-working-tint')}>
                  <p className={cn('mb-1 text-xs tabular-nums', d === today ? 'inline-block rounded-pill bg-live px-1.5 font-semibold text-on-live' : 'text-muted')}>{Number(d.slice(8))}</p>
                  {hol && <p className="mb-1 truncate text-xs font-medium text-ink" title={hol.name}>{hol.name} <span className="font-semibold">H</span></p>}
                  <ul className="space-y-0.5">
                    {reqs.slice(0, 4).map((r) => (
                      <li key={r.id} title={`${r.employeeName}: ${r.typeName} (${r.status})`} className="truncate rounded-[2px] border-l-4 bg-canvas px-1 text-xs" style={{ borderColor: r.color }}>
                        {r.employeeName.split(' ')[0]} <span className="font-semibold">{r.typeCode}</span>{r.duration !== 'full' ? ' ½' : ''}{r.status === 'pending' ? ' ?' : ''}
                      </li>
                    ))}
                    {reqs.length > 4 && <li className="text-xs text-muted">+{reqs.length - 4} more</li>}
                  </ul>
                </div>
              );
            })}
          </div></div>
        )}
      </PageBody>
    </>
  );
}

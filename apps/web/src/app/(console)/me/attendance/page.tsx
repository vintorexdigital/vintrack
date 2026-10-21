'use client';
import { useQuery } from '@tanstack/react-query';
import { Button, EmptyState, IconButton, PageBody, PageHeader, Skeleton } from '@trackrex/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { addDays, addMonths, enumerateDates, weekday } from '@trackrex/rules';
import { api } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/auth';
import { CodeCell } from '@/features/attendance/code-cell';
import { DayDrawer } from '@/features/attendance/day-drawer';
import { PunchWidget } from '@/shared/layout/punch-widget';

interface Day { date: string; statusCode: string; secondaryCode: string | null; lateMark: boolean; deductionUnits: number; overrideCode: string | null; workedMinutes: number }

export default function MyAttendancePage() {
  const { me } = useAuth();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7) + '-01');
  const [open, setOpen] = useState<string | null>(null);
  const eid = me?.membership.employeeId;
  const end = addDays(addMonths(month, 1), -1);
  const q = useQuery({ queryKey: ['my-days', month], queryFn: () => api<Day[]>('/v1/attendance/days', { query: { from: month, to: end, employeeId: eid } }), enabled: !!eid });
  const byDate = new Map(q.data?.map((d) => [d.date, d]));
  const dates = enumerateDates(addDays(month, -weekday(month)), addDays(end, 6 - weekday(end)));
  const today = new Date().toISOString().slice(0, 10);
  if (!eid) return <EmptyState title="Your account is not linked to an employee record" hint="Ask your admin to link it so you can punch and see your attendance." />;
  return (
    <>
      <PageHeader title="My attendance" scope="Employee" secondary={<><PunchWidget /><div className="flex items-center gap-1"><IconButton label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="size-5" /></IconButton><span className="min-w-32 text-center text-sm font-semibold">{new Date(`${month}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span><IconButton label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="size-5" /></IconButton></div></>} />
      <PageBody className="space-y-3">
        {q.isLoading ? <Skeleton className="h-80" /> : (
          <div className="grid grid-cols-7 border-l border-t border-rule bg-surface">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} className="border-b border-r border-rule bg-soft py-1 text-center text-xs font-semibold text-muted">{d}</div>)}
            {dates.map((d) => {
              const x = byDate.get(d);
              const inMonth = d.slice(0, 7) === month.slice(0, 7);
              return (
                <button key={d} type="button" disabled={!x} onClick={() => setOpen(d)} className={`flex min-h-16 flex-col items-center gap-1 border-b border-r border-rule p-1 text-xs ${inMonth ? '' : 'opacity-40'} ${d === today ? 'bg-live/20' : ''} disabled:cursor-default`} aria-label={`${d}${x ? `, ${x.statusCode}` : ''}`}>
                  <span className="tabular-nums text-muted">{Number(d.slice(8))}</span>
                  {x && <CodeCell code={x.statusCode} secondary={x.secondaryCode ?? undefined} late={x.lateMark} deduction={x.deductionUnits > 0} overridden={!!x.overrideCode} />}
                </button>
              );
            })}
          </div>
        )}
        <p className="text-sm text-muted">Missed a punch? <Link href={`/attendance/regularizations/new?date=${today}`} className="font-medium">Request regularization</Link> or open a day to see how it was calculated.</p>
        <Button onClick={() => setMonth(new Date().toISOString().slice(0, 7) + '-01')} size="sm">This month</Button>
      </PageBody>
      <DayDrawer employee={open && me ? { id: eid, name: me.user?.name ?? 'Me' } : null} date={open} onClose={() => setOpen(null)} />
    </>
  );
}

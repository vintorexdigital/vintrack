'use client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Button, EmptyState, IconButton, PageBody, PageHeader, Skeleton, Toggle, Input, useToast } from '@trackrex/ui';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useMemo, useState } from 'react';
import { addDays, addMonths } from '@trackrex/rules';
import { api, ApiError, download } from '@/shared/api/client';
import { useAuth, useCan } from '@/shared/auth/auth';
import { RefPicker } from '@/shared/crud/fields';
import { CodeCell } from './code-cell';
import { DayDrawer } from './day-drawer';
import { useViewport } from '@/shared/hooks/use-viewport';

interface RegisterResponse {
  cycle: { start: string; end: string; label: string };
  days: { date: string; weekday: number }[];
  rows: { employee: { id: string; code: string; name: string }; cells: Record<string, { code: string; secondary?: string; late?: boolean; deduction?: boolean; overridden?: boolean }>; summary: Record<string, number> }[];
  legend: { code: string; title: string; token: string }[];
  nextCursor: string | null;
}
const SUMMARY = ['P', 'A', 'L', 'HL', 'H', 'PA', 'HP', 'AH', 'AP', 'D', 'NW'] as const;
const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** The monthly register: sticky name column, one cell per day, summary columns, legend, day drawer. */
export function Register() {
  const toast = useToast();
  const { scopeOf } = useAuth();
  const canExport = useCan('attendance.register.export');
  const viewport = useViewport();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [q, setQ] = useState('');
  const [dept, setDept] = useState<string | null>(null);
  const [direct, setDirect] = useState(false);
  const [open, setOpen] = useState<{ employee: { id: string; name: string }; date: string } | null>(null);
  const [weekStart, setWeekStart] = useState(0);
  const wide = !['self', 'direct'].includes(scopeOf('attendance.register.read') ?? 'self');
  const params = { date, q, departmentId: dept ?? '', directOnly: direct ? 'true' : '' };

  const reg = useInfiniteQuery({
    queryKey: ['register', params], initialPageParam: '',
    queryFn: ({ pageParam }) => api<RegisterResponse>('/v1/attendance/register', { query: { ...params, limit: 50, cursor: pageParam } }),
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const first = reg.data?.pages[0];
  const rows = reg.data?.pages.flatMap((p) => p.rows) ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const days = first?.days ?? [];
  // Below md the register is a week view with a date pager.
  const phone = viewport === 'phone';
  const shown = useMemo(() => (phone ? days.slice(weekStart, weekStart + 7) : days), [phone, days, weekStart]);
  const move = (n: number) => { setDate(addMonths(first?.cycle.start ?? date, n)); setWeekStart(0); };

  return (
    <>
      <PageHeader title="Monthly register" scope="Attendance" description={first ? `Attendance cycle ${first.cycle.start} to ${first.cycle.end}` : undefined}
        secondary={<>
          <div className="flex items-center gap-1" role="group" aria-label="Cycle"><IconButton label="Previous cycle" onClick={() => move(-1)}><ChevronLeft className="size-5" /></IconButton><Button size="sm" onClick={() => { setDate(today); setWeekStart(0); }}>This cycle</Button><IconButton label="Next cycle" onClick={() => move(1)}><ChevronRight className="size-5" /></IconButton></div>
          {canExport && <Button icon={<Download className="size-4" aria-hidden />} onClick={() => void download('/v1/attendance/register/export', { date, q, departmentId: dept ?? '', directOnly: direct ? 'true' : '' }, 'attendance.xlsx').catch((e) => toast('error', e instanceof ApiError ? e.message : 'Export failed'))}>Payroll export</Button>}
        </>} />
      <PageBody className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1 md:max-w-xs"><Input aria-label="Search employees" placeholder="Search employees" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="min-w-52 md:w-64"><RefPicker entity="departments" value={dept} onChange={setDept} placeholder="Any department" /></div>
          {wide && <div className="w-64"><Toggle label="Direct reportees only" checked={direct} onChange={setDirect} /></div>}
        </div>
        {phone && days.length > 0 && (
          <div className="flex items-center justify-between rounded-input bg-soft px-2" role="group" aria-label="Week">
            <IconButton label="Previous week" disabled={weekStart === 0} onClick={() => setWeekStart(Math.max(0, weekStart - 7))}><ChevronLeft className="size-5" /></IconButton>
            <span className="text-sm tabular-nums">{shown[0]?.date.slice(5)} to {shown.at(-1)?.date.slice(5)}</span>
            <IconButton label="Next week" disabled={weekStart + 7 >= days.length} onClick={() => setWeekStart(weekStart + 7)}><ChevronRight className="size-5" /></IconButton>
          </div>
        )}
        {reg.isLoading ? <Skeleton className="h-64" /> : reg.isError ? <EmptyState title="Could not load the register" hint={reg.error instanceof ApiError ? reg.error.message : undefined} action={<Button onClick={() => void reg.refetch()}>Try again</Button>} /> : rows.length === 0 ? <EmptyState title="No employees to show" hint="Try another cycle or remove a filter." /> : (
          <div className="max-w-full overflow-x-auto border-y border-rule bg-surface">
            <table className="w-full min-w-max border-separate border-spacing-0 text-table">
              <caption className="sr-only">Attendance register for {first?.cycle.label}</caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 min-w-48 border-b border-rule bg-soft px-3 py-2 text-left text-xs font-semibold text-muted">Employee</th>
                  {shown.map((d) => (
                    <th key={d.date} scope="col" className={`w-9 border-b border-rule px-0.5 py-1 text-center text-xs font-semibold ${d.date === today ? 'bg-live text-on-live' : 'bg-soft text-muted'}`}>
                      <span className="block tabular-nums">{d.date.slice(8)}</span><span className="block font-normal">{WD[d.weekday]}</span>
                    </th>
                  ))}
                  {!phone && SUMMARY.map((s) => <th key={s} scope="col" className="border-b border-rule bg-soft px-2 py-2 text-right text-xs font-semibold text-muted">{s}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.employee.id} className="group hover:bg-soft">
                    <th scope="row" className="sticky left-0 z-10 border-b border-rule bg-surface px-3 py-1.5 text-left font-normal group-hover:bg-soft"><span className="block truncate font-medium">{r.employee.name}</span><span className="text-xs tabular-nums text-muted">{r.employee.code}</span></th>
                    {shown.map((d) => {
                      const c = r.cells[d.date];
                      return (
                        <td key={d.date} className="border-b border-rule p-0.5 text-center">
                          {c ? <button type="button" className="rounded-[2px] outline-offset-1 focus-visible:outline-2 focus-visible:outline-brand" aria-label={`${r.employee.name}, ${d.date}`} onClick={() => setOpen({ employee: { id: r.employee.id, name: r.employee.name }, date: d.date })}><CodeCell code={c.code} secondary={c.secondary} late={c.late} deduction={c.deduction} overridden={c.overridden} /></button> : <span className="text-muted" aria-hidden>·</span>}
                        </td>
                      );
                    })}
                    {!phone && SUMMARY.map((s) => <td key={s} className="border-b border-rule px-2 text-right tabular-nums text-ink">{r.summary[s] || <span className="text-muted">0</span>}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {reg.hasNextPage && <div className="flex justify-center"><Button loading={reg.isFetchingNextPage} onClick={() => void reg.fetchNextPage()}>Load more employees</Button></div>}
        {first && (
          <details className="rounded-overlay border border-rule bg-surface p-3 text-sm">
            <summary className="cursor-pointer font-semibold">Legend</summary>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{first.legend.map((l) => <li key={l.code} className="flex items-center gap-2"><CodeCell code={l.code} /><span>{l.title}</span></li>)}</ul>
          </details>
        )}
      </PageBody>
      <DayDrawer employee={open?.employee ?? null} date={open?.date ?? null} onClose={() => setOpen(null)} />
    </>
  );
}
export { addDays };

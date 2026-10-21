'use client';
import { useQuery } from '@tanstack/react-query';
import { Banner, DataTable, Drawer, EmptyState, Field, Input, KpiBand, PageBody, PageHeader, Skeleton, cn, type DataColumn } from '@trackrex/ui';
import { useState } from 'react';
import { api, ApiError } from '@/shared/api/client';

interface Row { employeeId: string; code: string | null; name: string; department: string | null; workingMinutes: number; recordedMinutes: number; idleMinutes: number; unrecordedMinutes: number; productiveMinutes: number; unproductiveMinutes: number; neutralMinutes: number; productivityPct: number }
interface Summary { rows: Row[]; totals: Omit<Row, 'employeeId' | 'code' | 'name' | 'department'> }
interface Day { employee: string; date: string; summary: Row; apps: { name: string; site: boolean; class: string; minutes: number; activeMinutes: number }[]; hours: { hour: number; class: string; activeMinutes: number; idleMinutes: number }[] }

const hm = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
const today = () => new Date().toISOString().slice(0, 10);
const TONE: Record<string, string> = { productive: 'bg-present', unproductive: 'bg-absent', neutral: 'bg-non-working' };

/** Stacked bar: productive, unproductive and neutral activity, idle shown separately, over the person's working time. */
function Bar({ r }: { r: Row }) {
  const total = Math.max(r.workingMinutes, r.recordedMinutes, 1);
  const w = (m: number) => `${Math.min(100, (m / total) * 100)}%`;
  return (
    <span className="flex h-3 w-40 overflow-hidden rounded-pill bg-soft" role="img" aria-label={`${hm(r.productiveMinutes)} productive, ${hm(r.unproductiveMinutes)} unproductive, ${hm(r.neutralMinutes)} neutral, ${hm(r.idleMinutes)} idle of ${hm(r.workingMinutes)} working`}>
      <span className="bg-present" style={{ width: w(r.productiveMinutes) }} /><span className="bg-absent" style={{ width: w(r.unproductiveMinutes) }} /><span className="bg-non-working" style={{ width: w(r.neutralMinutes) }} />
    </span>
  );
}

export default function Productivity() {
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [open, setOpen] = useState<{ id: string; date: string } | null>(null);
  const q = useQuery({ queryKey: ['productivity', from, to], queryFn: () => api<Summary>('/v1/productivity/summary', { query: { from, to } }), retry: false });
  const day = useQuery({ queryKey: ['productivity-day', open?.id, open?.date], enabled: !!open, queryFn: () => api<Day>('/v1/productivity/day', { query: { employeeId: open!.id, date: open!.date } }) });
  const cols: DataColumn<Row>[] = [
    { key: 'name', header: 'Employee', cell: (r) => <span><span className="font-medium">{r.name}</span><span className="block text-xs text-muted">{r.department ?? ''}</span></span> },
    { key: 'bar', header: 'Time', cell: (r) => <Bar r={r} />, card: false },
    { key: 'pct', header: 'Productivity', numeric: true, cell: (r) => `${r.productivityPct}%` },
    { key: 'working', header: 'Working', numeric: true, cell: (r) => hm(r.workingMinutes) },
    { key: 'recorded', header: 'Recorded', numeric: true, cell: (r) => hm(r.recordedMinutes) },
    { key: 'idle', header: 'Idle', numeric: true, cell: (r) => hm(r.idleMinutes) },
  ];
  const t = q.data?.totals;
  return (
    <>
      <PageHeader title="Productivity" scope="Insights" description="From the desktop app, during working time only. Working is punched-in time; recorded is what the app saw; productive is active time in applications your company marked productive." />
      <PageBody className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From">{(id) => <Input id={id} type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label="To">{(id) => <Input id={id} type="date" value={to} min={from} max={today()} onChange={(e) => setTo(e.target.value)} />}</Field>
        </div>
        {q.isError && <Banner tone="error">{q.error instanceof ApiError ? q.error.message : 'Could not load productivity.'}</Banner>}
        {t && <KpiBand items={[{ label: 'Productivity', value: `${t.productivityPct}%` }, { label: 'Productive', value: hm(t.productiveMinutes) }, { label: 'Unproductive', value: hm(t.unproductiveMinutes) }, { label: 'Idle', value: hm(t.idleMinutes) }, { label: 'Not recorded', value: hm(t.unrecordedMinutes) }]} />}
        {q.isLoading ? <Skeleton className="h-48" /> : (
          <DataTable caption="Productivity by employee" columns={cols} rows={q.data?.rows ?? []} rowKey={(r) => r.employeeId} onRowClick={(r) => setOpen({ id: r.employeeId, date: to })}
            empty={<EmptyState title="No data for this period" hint="People appear once their desktop app has reported activity while punched in." />} />
        )}
      </PageBody>
      <Drawer open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }} title={day.data ? `${day.data.employee} · ${day.data.date}` : 'Activity'} width="lg">
        {day.isLoading && <Skeleton className="h-40" />}
        {day.data && (
          <div className="space-y-6">
            <Field label="Day">{(id) => <Input id={id} type="date" value={open?.date ?? ''} max={today()} onChange={(e) => open && setOpen({ ...open, date: e.target.value })} />}</Field>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {([['Productivity', `${day.data.summary.productivityPct}%`], ['Productive', hm(day.data.summary.productiveMinutes)], ['Idle', hm(day.data.summary.idleMinutes)], ['Working', hm(day.data.summary.workingMinutes)]] as const).map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-semibold tabular-nums">{v}</dd></div>)}
            </dl>
            <section aria-label="By hour"><h3 className="mb-2 text-sm font-semibold">By hour (active minutes)</h3>
              <div className="flex h-24 items-end gap-1">{Array.from({ length: 24 }, (_, h) => { const hs = day.data!.hours.filter((x) => x.hour === h); return (
                <div key={h} className="flex flex-1 flex-col-reverse" title={`${h}:00`}>{hs.map((x) => <span key={x.class} className={cn('w-full', TONE[x.class])} style={{ height: `${Math.min(100, (x.activeMinutes / 60) * 100)}%` }} />)}<span className="mt-1 text-center text-[9px] text-muted">{h % 3 === 0 ? h : ''}</span></div>); })}</div>
            </section>
            <section aria-label="Applications"><h3 className="mb-2 text-sm font-semibold">Applications and websites</h3>
              {day.data.apps.length === 0 ? <p className="text-sm text-muted">Nothing recorded this day.</p> : (
                <ul className="divide-y divide-rule border-y border-rule">{day.data.apps.map((a) => <li key={`${a.name}${a.site}`} className="flex min-h-11 items-center justify-between gap-2 text-sm"><span className="flex items-center gap-2"><span className={cn('size-2.5 rounded-pill', TONE[a.class])} aria-hidden /><span>{a.name}</span><span className="text-xs text-muted">{a.site ? 'website' : 'app'} · {a.class}</span></span><span className="tabular-nums">{hm(a.activeMinutes)}</span></li>)}</ul>
              )}
            </section>
          </div>
        )}
      </Drawer>
    </>
  );
}

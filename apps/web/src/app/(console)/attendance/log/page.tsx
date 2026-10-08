'use client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Button, DataTable, EmptyState, Input, PageBody, PageHeader, StatusPill, type DataColumn } from '@trackrex/ui';
import { useState } from 'react';
import { api } from '@/shared/api/client';
import { RefPicker } from '@/shared/crud/fields';

interface Punch { id: string; employeeName: string; employeeCode: string; type: string; at: string; attendanceDate: string; source: string; latitude: number | null; longitude: number | null; address: string | null; comment: string | null; mockLocation: boolean; offline: boolean; selfieKey: string | null }

export default function DailyLogPage() {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [employee, setEmployee] = useState<string | null>(null);
  const q = useInfiniteQuery({
    queryKey: ['punch-log', date, employee], initialPageParam: '',
    queryFn: ({ pageParam }) => api<{ data: Punch[]; nextCursor: string | null }>('/v1/attendance/punches', { query: { date, employeeId: employee ?? '', limit: 100, cursor: pageParam } }),
    getNextPageParam: (l) => l.nextCursor ?? undefined,
  });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  const cols: DataColumn<Punch>[] = [
    { key: 'employee', header: 'Employee', cell: (r) => <span className="font-medium">{r.employeeName} <span className="text-xs tabular-nums text-muted">{r.employeeCode}</span></span> },
    { key: 'type', header: 'Punch', cell: (r) => <StatusPill tone={r.type === 'in' ? 'present' : 'non-working'}>{r.type === 'in' ? 'In' : 'Out'}</StatusPill> },
    { key: 'at', header: 'Time', numeric: true, cell: (r) => new Date(r.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) },
    { key: 'source', header: 'Source', cell: (r) => <>{r.source}{r.offline ? ' · offline' : ''}{r.mockLocation ? ' · mock location' : ''}{r.selfieKey ? ' · selfie' : ''}</> },
    { key: 'where', header: 'Location', cell: (r) => (r.latitude !== null ? <a href={`https://www.openstreetmap.org/?mlat=${r.latitude}&mlon=${r.longitude}#map=17/${r.latitude}/${r.longitude}`} target="_blank" rel="noreferrer">{r.address ?? `${r.latitude?.toFixed(4)}, ${r.longitude?.toFixed(4)}`}</a> : <span className="text-muted">–</span>) },
    { key: 'comment', header: 'Comment', cell: (r) => r.comment ?? <span className="text-muted">–</span> },
  ];
  return (
    <>
      <PageHeader title="Daily log" scope="Attendance" description="Every punch with its source and location." />
      <PageBody className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium">Date<Input type="date" className="mt-1.5 w-44" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <div className="min-w-56 flex-1 md:max-w-xs"><span className="text-sm font-medium">Employee</span><div className="mt-1.5"><RefPicker entity="employees" value={employee} onChange={setEmployee} placeholder="Everyone in scope" /></div></div>
        </div>
        <DataTable caption="Punches" columns={cols} rows={rows} rowKey={(r) => r.id} loading={q.isLoading} empty={<EmptyState title="No punches on this day" hint="Punches appear as employees punch in and out." />} />
        {q.hasNextPage && <div className="flex justify-center"><Button loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Load more</Button></div>}
      </PageBody>
    </>
  );
}

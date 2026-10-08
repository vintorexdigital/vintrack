'use client';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Button, EmptyState, PageBody, PageHeader, Select, Skeleton } from '@trackrex/ui';
import { Fingerprint, CalendarDays, ClipboardList, Cpu, Smartphone, Globe } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/shared/api/client';

interface Item { id: string; at: string; type: string; employeeName: string | null; employeeCode: string | null; platform: string | null }
const LABEL: Record<string, string> = {
  'punch.in': 'punched in', 'punch.out': 'punched out', 'punch.auto_out': 'was punched out automatically', 'leave.requested': 'applied for leave', 'leave.approved': 'had leave approved',
  'leave.rejected': 'had leave rejected', 'leave.cancelled': 'cancelled leave', 'regularization.requested': 'asked to regularize a day', 'regularization.approved': 'had a regularization approved',
  'regularization.rejected': 'had a regularization rejected', 'employee.exited': 'exited the company',
};
const ICON = (t: string) => (t.startsWith('punch') ? Fingerprint : t.startsWith('leave') ? CalendarDays : ClipboardList);
const PLATFORM = { android: Smartphone, ios: Smartphone, desktop: Cpu, web: Globe, system: Cpu } as const;
const GROUPS = [['', 'All activity'], ['punch.in,punch.out,punch.auto_out', 'Punches'], ['leave.requested,leave.approved,leave.rejected,leave.cancelled', 'Leave'], ['regularization.requested,regularization.approved,regularization.rejected', 'Regularization']];

export default function FeedPage() {
  const [type, setType] = useState('');
  const q = useInfiniteQuery({
    queryKey: ['feed', type], initialPageParam: '',
    queryFn: ({ pageParam }) => api<{ data: Item[]; nextCursor: string | null }>('/v1/feed', { query: { type, limit: 40, cursor: pageParam } }),
    getNextPageParam: (l) => l.nextCursor ?? undefined, refetchInterval: 30_000,
  });
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <>
      <PageHeader title="Activity feed" scope="Live" description="Punches, leave and approvals as they happen. Updates every 30 seconds." secondary={<Select aria-label="Event type" className="w-auto" value={type} onChange={(e) => setType(e.target.value)}>{GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>} />
      <PageBody>
        {q.isLoading ? <div className="space-y-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div> : rows.length === 0 ? <EmptyState title="No activity yet" hint="Events appear here as people punch in, apply for leave and get approvals." /> : (
          <ol className="divide-y divide-rule border-y border-rule bg-surface">
            {rows.map((r) => {
              const Icon = ICON(r.type);
              const P = PLATFORM[(r.platform ?? 'web') as keyof typeof PLATFORM] ?? Globe;
              return (
                <li key={r.id} className="flex min-h-12 items-center gap-3 px-4 py-2">
                  <Icon className="size-5 shrink-0 text-brand" aria-hidden />
                  <p className="min-w-0 flex-1 text-sm"><span className="font-medium">{r.employeeName ?? 'Someone'}</span> {LABEL[r.type] ?? r.type}</p>
                  <span className="hidden items-center gap-1 text-xs text-muted sm:flex"><P className="size-3.5" aria-hidden />{r.platform}</span>
                  <time dateTime={r.at} className="shrink-0 text-xs tabular-nums text-muted">{new Date(r.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
                </li>
              );
            })}
          </ol>
        )}
        {q.hasNextPage && <div className="mt-4 flex justify-center"><Button loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Load more</Button></div>}
      </PageBody>
    </>
  );
}

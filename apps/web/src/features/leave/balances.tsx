'use client';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@trackrex/ui';
import { api } from '@/shared/api/client';

export interface Balance { leaveTypeId: string; code: string; name: string; color: string; paid: boolean; accrued: number; taken: number; balance: number; pending: number; available: number; yearAccrual: number; expired: number }

export function BalanceStrip({ employeeId }: { employeeId?: string }) {
  const q = useQuery({ queryKey: ['balances', employeeId ?? 'me'], queryFn: () => api<Balance[]>('/v1/leave/balances', { query: { employeeId } }) });
  if (q.isLoading) return <Skeleton className="mx-4 h-20 md:mx-6" />;
  if (!q.data?.length) return null;
  return (
    <dl className="mx-4 mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-overlay border border-rule bg-rule md:mx-6 md:grid-cols-4 xl:grid-cols-6">
      {q.data.map((b) => (
        <div key={b.leaveTypeId} className="bg-surface px-3 py-2.5">
          <dt className="flex items-center gap-1.5 text-xs text-muted"><span aria-hidden className="size-2 rounded-pill" style={{ background: b.color }} />{b.name}</dt>
          <dd className="mt-0.5 flex items-baseline gap-1"><span className="text-kpi font-semibold tabular-nums">{b.balance}</span><span className="text-xs text-muted">days{b.pending ? ` · ${b.pending} pending` : ''}</span></dd>
          <dd className="text-xs tabular-nums text-muted">{b.taken} taken of {b.accrued} accrued</dd>
        </div>
      ))}
    </dl>
  );
}

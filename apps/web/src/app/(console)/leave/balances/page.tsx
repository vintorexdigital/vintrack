'use client';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, PageBody, PageHeader, Skeleton } from '@trackrex/ui';
import { api } from '@/shared/api/client';
import type { Balance } from '@/features/leave/balances';

export default function BalancesPage() {
  const q = useQuery({ queryKey: ['team-balances'], queryFn: () => api<{ employee: { id: string; code: string; name: string }; balances: Balance[] }[]>('/v1/leave/balances/team', { query: { limit: 100 } }) });
  const types = q.data?.[0]?.balances ?? [];
  return (
    <>
      <PageHeader title="Leave balances" scope="Leave" description="Balance for every employee in your scope, by leave type, for the current session." />
      <PageBody>
        {q.isLoading ? <Skeleton className="h-64" /> : !q.data?.length ? <EmptyState title="No employees to show" /> : (
          <div className="max-w-full overflow-x-auto border-y border-rule bg-surface">
            <table className="w-full min-w-max border-separate border-spacing-0 text-table">
              <caption className="sr-only">Leave balances</caption>
              <thead><tr><th scope="col" className="sticky left-0 border-b border-rule bg-canvas px-3 py-2 text-left text-xs font-semibold text-muted">Employee</th>{types.map((t) => <th key={t.leaveTypeId} scope="col" className="border-b border-rule bg-canvas px-3 py-2 text-right text-xs font-semibold text-muted"><span aria-hidden className="mr-1.5 inline-block size-2 rounded-pill" style={{ background: t.color }} />{t.code}</th>)}</tr></thead>
              <tbody>
                {q.data.map((r) => (
                  <tr key={r.employee.id} className="hover:bg-canvas">
                    <th scope="row" className="sticky left-0 border-b border-rule bg-surface px-3 py-1.5 text-left font-normal"><span className="font-medium">{r.employee.name}</span> <span className="text-xs tabular-nums text-muted">{r.employee.code}</span></th>
                    {r.balances.map((b) => <td key={b.leaveTypeId} className="border-b border-rule px-3 text-right tabular-nums" title={`${b.accrued} accrued, ${b.taken} taken, ${b.pending} pending`}>{b.balance}{b.pending ? <span className="ml-1 text-xs text-muted">({b.pending})</span> : null}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </PageBody>
    </>
  );
}

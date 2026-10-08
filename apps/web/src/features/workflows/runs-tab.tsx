'use client';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, Skeleton, StatusPill } from '@trackrex/ui';
import { api } from '@/shared/api/client';

interface Run { id: string; status: string; error: string | null; createdAt: string; resumeAt: string | null; log: { step: number; type: string; at: string; result: string }[] }
const tone = (s: string) => (s === 'completed' ? 'present' : s === 'failed' || s === 'rejected' ? 'absent' : 'pending') as 'present' | 'absent' | 'pending';

export function RunsTab({ workflowId }: { workflowId: string }) {
  const q = useQuery({ queryKey: ['workflow-runs', workflowId], refetchInterval: 15_000, queryFn: () => api<{ data: Run[] }>('/v1/automation/runs', { query: { workflowId, limit: 30 } }) });
  if (q.isLoading) return <Skeleton className="h-24" />;
  if (!q.data?.data.length) return <EmptyState title="It has not run yet" hint="Runs appear here when the event happens and the conditions hold." />;
  return (
    <ul className="space-y-3">
      {q.data.data.map((r) => (
        <li key={r.id} className="space-y-1 rounded-card border border-rule p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm"><StatusPill tone={tone(r.status)}>{r.status}</StatusPill><span className="text-xs text-muted">{new Date(r.createdAt).toLocaleString()}</span>{r.resumeAt && r.status === 'waiting' && <span className="text-xs text-muted">resumes {new Date(r.resumeAt).toLocaleString()}</span>}</div>
          <ol className="list-decimal pl-5 text-sm">{r.log.map((l, i) => <li key={i}><span className="text-muted">{l.type.replace('_', ' ')}:</span> {l.result}</li>)}</ol>
          {r.error && <p className="text-xs text-absent">{r.error}</p>}
        </li>
      ))}
    </ul>
  );
}

'use client';
import { useQuery } from '@tanstack/react-query';
import { Skeleton, StatusPill } from '@trackrex/ui';
import { api } from '@/shared/api/client';

interface Trail { levels: number; steps: { level: number; decision: string; by: string | null; override: boolean; comment: string | null; at: string }[]; waitingFor: { level: number; name: string } | null }

/** Who has approved a request so far and who is next. */
export function ApprovalTrailTab({ subject, id }: { subject: 'leave' | 'regularization' | 'expense'; id: string }) {
  const q = useQuery({ queryKey: ['approval-trail', subject, id], queryFn: () => api<Trail>(`/v1/approvals/${subject}/${id}`) });
  if (q.isLoading) return <Skeleton className="h-20" />;
  const t = q.data;
  if (!t) return <p className="text-sm text-muted">Not available.</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">{t.levels === 1 ? 'One approval is needed.' : `${t.levels} approvals are needed, one level at a time up the reporting line.`}</p>
      <ol className="space-y-2">
        {t.steps.map((s) => (
          <li key={s.level} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="tabular-nums text-muted">Level {s.level}</span>
            <StatusPill tone={s.decision === 'approved' ? 'present' : 'absent'}>{s.decision}</StatusPill>
            <span>{s.by ?? 'Someone'}{s.override ? ' (stepped in)' : ''}</span>
            <span className="text-xs text-muted">{new Date(s.at).toLocaleString()}</span>
            {s.comment && <span className="text-xs text-muted">“{s.comment}”</span>}
          </li>
        ))}
        {t.waitingFor && <li className="flex flex-wrap items-center gap-2 text-sm"><span className="tabular-nums text-muted">Level {t.waitingFor.level}</span><StatusPill tone="pending">waiting</StatusPill><span>{t.waitingFor.name}</span></li>}
      </ol>
    </div>
  );
}

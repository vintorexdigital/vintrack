'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, Modal, PageBody, PageHeader, Skeleton, StatusPill, Textarea, useToast } from '@trackrex/ui';
import { useState } from 'react';
import { api, ApiError } from '@/shared/api/client';

interface Item { id: string; title: string; body: string | null; status: 'pending' | 'approved' | 'rejected'; createdAt: string; decidedAt: string | null; comment: string | null; workflowName: string }

/** Approvals that workflows have asked this person for. Leave, regularizations and expenses are approved where they are listed. */
export default function ApprovalsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [all, setAll] = useState(false);
  const [deciding, setDeciding] = useState<{ item: Item; decision: 'approved' | 'rejected' } | null>(null);
  const [comment, setComment] = useState('');
  const q = useQuery({ queryKey: ['wf-approvals', all], queryFn: () => api<{ data: Item[] }>('/v1/automation/approvals', { query: { status: all ? 'all' : 'pending' } }) });
  const decide = useMutation({
    mutationFn: () => api(`/v1/automation/approvals/${deciding!.item.id}/decide`, { method: 'POST', body: { decision: deciding!.decision, ...(comment.trim() ? { comment: comment.trim() } : {}) } }),
    onSuccess: () => { toast('success', deciding!.decision === 'approved' ? 'Approved.' : 'Rejected.'); setDeciding(null); setComment(''); void qc.invalidateQueries({ queryKey: ['wf-approvals'] }); },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Could not record your decision.'),
  });
  return (
    <>
      <PageHeader title="Approvals" scope="Automation" description="Things your company's workflows have asked you to approve." />
      <PageBody wide={false} className="space-y-3">
        <label className="inline-flex min-h-8 items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-[var(--brand-primary)]" checked={all} onChange={(e) => setAll(e.target.checked)} />Show ones I already decided</label>
        {q.isLoading ? <Skeleton className="h-24" /> : !q.data?.data.length ? <EmptyState title="Nothing waiting for you" hint="When a workflow needs your approval it shows up here and you are notified." /> : (
          <ul className="space-y-3">
            {q.data.data.map((a) => (
              <li key={a.id} className="space-y-2 rounded-card border border-rule bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="font-semibold">{a.title}</p>{a.body && <p className="text-sm text-muted">{a.body}</p>}<p className="text-xs text-muted">{a.workflowName} · {new Date(a.createdAt).toLocaleString()}</p></div>
                  {a.status !== 'pending' && <StatusPill tone={a.status === 'approved' ? 'present' : 'absent'}>{a.status}</StatusPill>}
                </div>
                {a.comment && <p className="text-xs text-muted">“{a.comment}”</p>}
                {a.status === 'pending' && <div className="flex gap-2"><Button variant="primary" onClick={() => setDeciding({ item: a, decision: 'approved' })}>Approve</Button><Button onClick={() => setDeciding({ item: a, decision: 'rejected' })}>Reject</Button></div>}
              </li>
            ))}
          </ul>
        )}
      </PageBody>
      <Modal open={!!deciding} onOpenChange={(o) => { if (!o) setDeciding(null); }} title={deciding ? `${deciding.decision === 'approved' ? 'Approve' : 'Reject'}: ${deciding.item.title}` : ''}
        footer={<><Button onClick={() => setDeciding(null)}>Cancel</Button><Button variant="primary" loading={decide.isPending} onClick={() => decide.mutate()}>{deciding?.decision === 'approved' ? 'Approve' : 'Reject'}</Button></>}>
        <label className="block text-sm font-medium">Comment (optional)<Textarea className="mt-1.5" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} /></label>
      </Modal>
    </>
  );
}

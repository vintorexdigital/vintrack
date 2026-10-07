'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner, Button, EmptyState, Field, Modal, PageBody, PageHeader, StatusPill, Textarea, useToast } from '@trackrex/ui';
import Link from 'next/link';
import { useState } from 'react';
import { api, ApiError } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/auth';
import { RefText } from '@/shared/crud/crud-list-page';
import { position } from '@/shared/layout/punch-widget';
import { TaskFormFill, useTaskForm } from '@/features/forms/task-form';

interface Task { id: string; code: string; title: string; taskType: string; customerId: string | null; dueAt: string | null; priority: string; status: 'open' | 'in_progress'; description: string | null }
type Result = Task & { warnings: string[] };
const WARN: Record<string, string> = { far_from_customer: 'You were far from the customer when you did this. Your manager can see the distance.' };

function FormButton({ taskId, onOpen }: { taskId: string; onOpen: () => void }) {
  const f = useTaskForm(taskId).data?.form;
  if (!f) return null;
  return <Button onClick={onOpen}>{f.status === 'submitted' ? 'View form' : f.requiredToComplete ? 'Fill form (required)' : 'Fill form'}</Button>;
}

/** The employee's work list: start a visit with a location check, finish it with an outcome. */
export default function MyTasks() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [finishing, setFinishing] = useState<Task | null>(null);
  const [outcome, setOutcome] = useState('');
  const [formFor, setFormFor] = useState<Task | null>(null);
  const q = useQuery({
    queryKey: ['my-tasks'], enabled: !!me?.membership.employeeId,
    queryFn: () => api<{ data: Task[] }>('/v1/field/tasks', { query: { 'filter[assigneeId][eq]': me!.membership.employeeId!, 'filter[status][in]': 'open,in_progress', sort: 'dueAt', limit: 100 } }),
  });
  const done = (r: Result, ok: string) => { void qc.invalidateQueries({ queryKey: ['my-tasks'] }); toast('success', ok); r.warnings.forEach((w) => toast('info', WARN[w] ?? w)); };
  const fail = (e: unknown) => toast('error', e instanceof ApiError ? e.message : 'Something went wrong.');
  const start = useMutation({ mutationFn: async (t: Task) => api<Result>(`/v1/field/tasks/${t.id}/check-in`, { method: 'POST', body: await position() ?? {} }), onSuccess: (r) => done(r, 'Task started.'), onError: fail });
  const finish = useMutation({
    mutationFn: async () => { const p = await position(); return api<Result>(`/v1/field/tasks/${finishing!.id}/complete`, { method: 'POST', body: { outcome, ...(p ? { latitude: p.latitude, longitude: p.longitude } : {}) } }); },
    onSuccess: (r) => { setFinishing(null); setOutcome(''); done(r, 'Task completed.'); }, onError: fail,
  });
  const rows = q.data?.data ?? [];
  const overdue = (t: Task) => !!t.dueAt && new Date(t.dueAt).getTime() < Date.now();

  return (
    <>
      <PageHeader title="My tasks" scope="Field" description="Your visits and jobs. Starting or finishing one records where you were." />
      <PageBody wide={false} className="space-y-3">
        {!me?.membership.employeeId && <Banner tone="warn">Your account is not linked to an employee record, so no tasks can be assigned to you.</Banner>}
        {!q.isLoading && rows.length === 0 && <EmptyState title="Nothing assigned" hint="New tasks from your manager show up here." />}
        <ul className="space-y-3">
          {rows.map((t) => (
            <li key={t.id} className="space-y-2 rounded-card border border-rule bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link href={`/field/tasks/${t.id}`} className="font-semibold underline-offset-2 hover:underline">{t.title}</Link>
                  <p className="text-xs text-muted">{t.code} · {t.taskType}{t.customerId && <> · <RefText entity="customers" id={t.customerId} /></>}</p>
                </div>
                <div className="flex items-center gap-2">
                  {t.priority !== 'normal' && <StatusPill tone={t.priority === 'urgent' ? 'absent' : t.priority === 'high' ? 'late' : 'non-working'}>{t.priority}</StatusPill>}
                  <StatusPill tone={t.status === 'in_progress' ? 'pending' : 'non-working'}>{t.status.replace('_', ' ')}</StatusPill>
                </div>
              </div>
              {t.description && <p className="text-sm">{t.description}</p>}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className={overdue(t) ? 'text-xs font-medium text-absent' : 'text-xs text-muted'}>{t.dueAt ? `${overdue(t) ? 'Overdue · ' : 'Due '}${new Date(t.dueAt).toLocaleString()}` : 'No due time'}</p>
                <div className="flex gap-2">
                  {t.status === 'open' && <Button variant="primary" loading={start.isPending && start.variables?.id === t.id} onClick={() => start.mutate(t)}>Start and check in</Button>}
                  <FormButton taskId={t.id} onOpen={() => setFormFor(t)} />
                  {t.status === 'in_progress' && <Button variant="primary" onClick={() => setFinishing(t)}>Complete</Button>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </PageBody>
      <Modal open={!!formFor} onOpenChange={(o) => { if (!o) setFormFor(null); }} title={formFor ? `Form for “${formFor.title}”` : ''} description="Save a draft any time. Submit when it is complete.">
        {formFor && <TaskFormFill taskId={formFor.id} onSubmitted={() => setFormFor(null)} />}
      </Modal>
      <Modal open={!!finishing} onOpenChange={(o) => { if (!o) setFinishing(null); }} title={finishing ? `Complete “${finishing.title}”` : ''} description="Say how it went. Your current location is attached if your browser allows it."
        footer={<><Button onClick={() => setFinishing(null)}>Cancel</Button><Button variant="primary" loading={finish.isPending} disabled={outcome.trim().length < 2} onClick={() => finish.mutate()}>Mark complete</Button></>}>
        <Field label="Outcome" required>{(id) => <Textarea id={id} rows={4} value={outcome} onChange={(e) => setOutcome(e.target.value)} />}</Field>
      </Modal>
    </>
  );
}

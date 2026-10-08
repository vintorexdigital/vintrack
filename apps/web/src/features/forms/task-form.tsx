'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner, Button, EmptyState, Select, Skeleton, StatusPill, useToast } from '@trackrex/ui';
import { validateAnswers, type Answers, type Question } from '@trackrex/schemas';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/auth';
import { AnswerList, FormFill } from './form-fill';

export interface TaskFormView { id: string; templateName: string; questions: Question[]; requiredToComplete: boolean; answers: Answers; status: 'draft' | 'submitted'; submittedAt: string | null }

export const useTaskForm = (taskId: string, enabled = true) => useQuery({ queryKey: ['task-form', taskId], enabled, queryFn: () => api<{ form: TaskFormView | null }>(`/v1/field/tasks/${taskId}/form`) });

/** The employee's form on a task: fill, save a draft, submit. Validation runs locally with the same rules as the server. */
export function TaskFormFill({ taskId, onSubmitted }: { taskId: string; onSubmitted?: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useTaskForm(taskId);
  const form = q.data?.form;
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => { if (form) setAnswers(form.answers); }, [form]);
  const save = useMutation({
    mutationFn: (submit: boolean) => api(`/v1/field/tasks/${taskId}/form/answers`, { method: 'POST', body: { answers, submit } }),
    onSuccess: (_r, submit) => { void qc.invalidateQueries({ queryKey: ['task-form', taskId] }); toast('success', submit ? 'Form submitted.' : 'Draft saved.'); if (submit) onSubmitted?.(); },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Could not save the form.'),
  });
  if (q.isLoading) return <Skeleton className="h-32" />;
  if (!form) return <EmptyState title="No form on this task" />;
  const submit = () => { const check = validateAnswers(form.questions, answers, { final: true }); setErrors(check.errors); if (check.ok) save.mutate(true); };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{form.templateName}</h3><StatusPill tone={form.status === 'submitted' ? 'present' : 'pending'}>{form.status}</StatusPill></div>
      <FormFill questions={form.questions} answers={answers} onChange={setAnswers} errors={errors} />
      <div className="flex gap-2">
        <Button loading={save.isPending && save.variables === false} onClick={() => save.mutate(false)}>Save draft</Button>
        <Button variant="primary" loading={save.isPending && save.variables === true} onClick={submit}>{form.status === 'submitted' ? 'Submit again' : 'Submit'}</Button>
      </div>
    </div>
  );
}

/** Detail tab for managers: the answers, or a way to attach a form. */
export function TaskFormTab({ taskId, status }: { taskId: string; status: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const q = useTaskForm(taskId);
  const [templateId, setTemplateId] = useState('');
  const templates = useQuery({ queryKey: ['form-templates-active'], enabled: can('field.task.update'), queryFn: () => api<{ data: { id: string; name: string }[] }>('/v1/field/forms', { query: { 'filter[status][eq]': 'active', limit: 100 } }) });
  const attach = useMutation({
    mutationFn: () => api(`/v1/field/tasks/${taskId}/form`, { method: 'POST', body: { templateId } }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['task-form', taskId] }); toast('success', 'Form attached.'); },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Could not attach the form.'),
  });
  const form = q.data?.form;
  if (q.isLoading) return <Skeleton className="h-24" />;
  const open = status === 'open' || status === 'in_progress';
  return (
    <div className="space-y-4">
      {form ? (
        <>
          <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{form.templateName}</h3><StatusPill tone={form.status === 'submitted' ? 'present' : 'pending'}>{form.status === 'submitted' ? `Submitted${form.submittedAt ? ` ${new Date(form.submittedAt).toLocaleString()}` : ''}` : 'Not submitted'}</StatusPill></div>
          {Object.keys(form.answers).length ? <AnswerList questions={form.questions} answers={form.answers} /> : <p className="text-sm text-muted">No answers yet.</p>}
        </>
      ) : <EmptyState title="No form on this task" hint={open && can('field.task.update') ? 'Attach one so the person doing it has something to fill in.' : undefined} />}
      {open && can('field.task.update') && (!form || Object.keys(form.answers).length === 0) && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm font-medium">Attach a form<Select className="mt-1.5 block" value={templateId} onChange={(e) => setTemplateId(e.target.value)}><option value="">Choose…</option>{templates.data?.data.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></label>
          <Button disabled={!templateId} loading={attach.isPending} onClick={() => attach.mutate()}>Attach</Button>
        </div>
      )}
      {form?.requiredToComplete && form.status !== 'submitted' && open && <Banner tone="info">The task cannot be completed until this form is submitted.</Banner>}
    </div>
  );
}

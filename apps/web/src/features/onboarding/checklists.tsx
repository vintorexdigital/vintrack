'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, DataTable, EmptyState, Field, Input, Modal, PageBody, PageHeader, Select, Skeleton, StatusPill, useToast, type DataColumn } from '@trackrex/ui';
import { onboardingItemsSchema, type OnboardingItemDef } from '@trackrex/schemas';
import { Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { api, ApiError } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/auth';
import { RefPicker } from '@/shared/crud/fields';
import type { EditorProps } from '@/shared/crud/resource';

interface Case { id: string; employeeId: string; employeeName: string; templateName: string; kind: string; status: string; total: number; done: number; startedAt: string }
interface Item { id: string; title: string; who: string; assigneeId: string | null; assigneeName: string | null; dueDate: string | null; doneAt: string | null; note: string | null }
const WHO: Record<string, string> = { employee: 'The person', manager: 'Their manager', hr: 'HR', it: 'IT', admin: 'Admin' };
const tone = (s: string) => (s === 'completed' ? 'present' : s === 'cancelled' ? 'absent' : 'pending') as 'present' | 'absent' | 'pending';

export function CasesList() {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState('');
  const q = useQuery({ queryKey: ['onboarding-cases'], queryFn: () => api<{ data: Case[] }>('/v1/onboarding/cases') });
  const templates = useQuery({ queryKey: ['onboarding-templates'], enabled: open && can('onboarding.template.read'), queryFn: () => api<{ data: { id: string; name: string; kind: string }[] }>('/v1/onboarding/templates', { query: { 'filter[status][eq]': 'active', limit: 100 } }) });
  const start = useMutation({
    mutationFn: () => api('/v1/onboarding/cases', { method: 'POST', body: { employeeId, templateId } }),
    onSuccess: () => { toast('success', 'Checklist started.'); setOpen(false); void qc.invalidateQueries({ queryKey: ['onboarding-cases'] }); },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Could not start the checklist.'),
  });
  const cols: DataColumn<Case>[] = [
    { key: 'who', header: 'Person', cell: (c) => <Link href={`/onboarding/cases/${c.id}`}>{c.employeeName}</Link> },
    { key: 'tpl', header: 'Checklist', cell: (c) => <>{c.templateName}<span className="ml-2 text-xs text-muted">{c.kind === 'exit' ? 'Leaving' : 'Joining'}</span></> },
    { key: 'progress', header: 'Done', numeric: true, cell: (c) => `${c.done} of ${c.total}` },
    { key: 'status', header: 'Status', cell: (c) => <StatusPill tone={tone(c.status)}>{c.status}</StatusPill> },
    { key: 'at', header: 'Started', numeric: true, cell: (c) => new Date(c.startedAt).toLocaleDateString() },
  ];
  return (
    <>
      <PageHeader title="Checklists" scope="People" description="What has to happen when someone joins or leaves, step by step, with the person each step is for."
        primary={can('onboarding.case.create') ? <Button variant="primary" onClick={() => setOpen(true)}>Start a checklist</Button> : undefined} />
      <PageBody><DataTable caption="Checklists" columns={cols} rows={q.data?.data ?? []} rowKey={(c) => c.id} loading={q.isLoading} empty={<EmptyState title="No checklists running" hint="Start one for a new joiner or someone who is leaving." />} /></PageBody>
      <Modal open={open} onOpenChange={setOpen} title="Start a checklist" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={!employeeId || !templateId} loading={start.isPending} onClick={() => start.mutate()}>Start</Button></>}>
        <div className="space-y-3">
          <Field label="Employee" required>{(id) => <RefPicker id={id} entity="employees" value={employeeId} onChange={setEmployeeId} />}</Field>
          <Field label="Checklist" required>{(id) => <Select id={id} value={templateId} onChange={(e) => setTemplateId(e.target.value)}><option value="">Choose…</option>{templates.data?.data.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.kind === 'exit' ? 'leaving' : 'joining'})</option>)}</Select>}</Field>
        </div>
      </Modal>
    </>
  );
}

export function CaseDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { me, can } = useAuth();
  const q = useQuery({ queryKey: ['onboarding-case', id], queryFn: () => api<Case & { items: Item[] }>(`/v1/onboarding/cases/${id}`) });
  const toggle = useMutation({
    mutationFn: ({ item, done }: { item: Item; done: boolean }) => api(`/v1/onboarding/items/${item.id}/${done ? 'complete' : 'reopen'}`, { method: 'POST', body: {} }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['onboarding-case', id] }); void qc.invalidateQueries({ queryKey: ['onboarding-cases'] }); },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'That step is not yours to change.'),
  });
  if (q.isLoading) return <Skeleton className="m-6 h-64" />;
  if (!q.data) return <EmptyState title="Checklist not found" />;
  const c = q.data;
  const mine = (i: Item) => i.assigneeId && i.assigneeId === me?.membership.employeeId;
  return (
    <>
      <PageHeader title={`${c.templateName}: ${c.employeeName}`} scope="People · Checklists" description={`${c.done} of ${c.total} steps done`} secondary={<StatusPill tone={tone(c.status)}>{c.status}</StatusPill>}
        primary={c.status === 'open' && can('onboarding.case.update') ? <Button onClick={() => { if (window.confirm('Cancel this checklist?')) void api(`/v1/onboarding/cases/${id}/cancel`, { method: 'POST', body: {} }).then(() => qc.invalidateQueries({ queryKey: ['onboarding-case', id] })); }}>Cancel checklist</Button> : undefined} />
      <PageBody wide={false}>
        <ol className="divide-y divide-rule border-y border-rule">
          {c.items.map((i) => {
            const can2 = c.status === 'open' && (mine(i) || can('onboarding.case.update'));
            return (
              <li key={i.id} className="flex items-start gap-3 py-3">
                <input type="checkbox" className="mt-1 size-5 accent-[var(--brand-primary)]" aria-label={i.title} checked={!!i.doneAt} disabled={!can2 || toggle.isPending} onChange={(e) => toggle.mutate({ item: i, done: e.target.checked })} />
                <div className="min-w-0 flex-1">
                  <p className={i.doneAt ? 'text-muted line-through' : 'font-medium'}>{i.title}</p>
                  <p className="text-xs text-muted">{i.assigneeName ?? WHO[i.who] ?? i.who}{i.dueDate ? ` · due ${i.dueDate}` : ''}{i.doneAt ? ` · done ${new Date(i.doneAt).toLocaleDateString()}` : ''}{i.note ? ` · “${i.note}”` : ''}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </PageBody>
    </>
  );
}

/** The steps of a checklist template. */
export function ChecklistItemsEditor({ value, onChange, disabled, error }: EditorProps) {
  const items = (value as OnboardingItemDef[] | undefined) ?? [];
  const set = (i: number, patch: Partial<OnboardingItemDef>) => onChange(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  void onboardingItemsSchema;
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_9rem_6rem_auto]">
          <Field label={`Step ${i + 1}`}>{(id) => <Input id={id} disabled={disabled} value={it.title} onChange={(e) => set(i, { title: e.target.value })} />}</Field>
          <Field label="For">{(id) => <Select id={id} disabled={disabled} value={it.who} onChange={(e) => set(i, { who: e.target.value as OnboardingItemDef['who'] })}>{Object.entries(WHO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>}</Field>
          <Field label="Due after (days)">{(id) => <Input id={id} type="number" min={0} disabled={disabled} value={it.dueDays} onChange={(e) => set(i, { dueDays: Number(e.target.value) || 0 })} />}</Field>
          {!disabled && <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => onChange(items.filter((_, j) => j !== i))}>Remove</Button>}
        </div>
      ))}
      {error && <p role="alert" className="text-sm text-absent">{error}</p>}
      {!disabled && <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => onChange([...items, { title: '', who: 'hr', dueDays: 0 }])}>Add a step</Button>}
    </div>
  );
}

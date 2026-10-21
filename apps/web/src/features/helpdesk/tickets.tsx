'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner, Button, EmptyState, Field, Input, PageBody, PageHeader, Select, Skeleton, StatusPill, Textarea, Toggle, useToast } from '@trackrex/ui';
import { TICKET_CATEGORIES, TICKET_PRIORITIES } from '@trackrex/schemas';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/auth';
import { RefPicker } from '@/shared/crud/fields';

interface Ticket { id: string; code: string; subject: string; description: string | null; requesterId: string; category: string; priority: string; status: string; assigneeId: string | null; firstResponseDueAt: string | null; resolutionDueAt: string | null; firstRespondedAt: string | null; resolvedAt: string | null; rating: number | null; version: number }
interface Comment { id: string; body: string; internal: boolean; createdAt: string; authorName: string | null; fromRequester: boolean }
const label = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const statusTone = (s: string) => (s === 'resolved' || s === 'closed' ? 'present' : s === 'waiting' ? 'late' : s === 'in_progress' ? 'pending' : 'non-working') as 'present' | 'late' | 'pending' | 'non-working';
const priorityTone = (p: string) => (p === 'urgent' ? 'absent' : p === 'high' ? 'late' : 'non-working') as 'absent' | 'late' | 'non-working';

export function NewTicket() {
  const router = useRouter();
  const toast = useToast();
  const { can } = useAuth();
  const [v, setV] = useState({ subject: '', description: '', category: 'it', priority: 'normal' });
  const agent = can('helpdesk.ticket.assign');
  const create = useMutation({
    mutationFn: () => api<Ticket>('/v1/helpdesk/tickets', { method: 'POST', body: { subject: v.subject, ...(v.description ? { description: v.description } : {}), category: v.category, ...(agent ? { priority: v.priority } : {}) } }),
    onSuccess: (t) => { toast('success', `Raised as ${t.code}.`); router.push(`/helpdesk/tickets/${t.id}`); },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Could not raise the ticket.'),
  });
  return (
    <>
      <PageHeader title="Raise a request" scope="Help desk" description="Tell the help desk what you need. You will be told when someone replies." />
      <PageBody wide={false}>
        <form className="grid max-w-2xl gap-4" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <Field label="What do you need?" required>{(id) => <Input id={id} maxLength={160} value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} />}</Field>
          <Field label="Who can help">{(id) => <Select id={id} value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })}>{TICKET_CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select>}</Field>
          {agent && <Field label="Priority">{(id) => <Select id={id} value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value })}>{TICKET_PRIORITIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}</Select>}</Field>}
          <Field label="Details">{(id) => <Textarea id={id} rows={5} maxLength={4000} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />}</Field>
          <div><Button type="submit" variant="primary" loading={create.isPending} disabled={v.subject.trim().length < 3}>Send request</Button></div>
        </form>
      </PageBody>
    </>
  );
}

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '–');
const overdue = (iso: string | null, done: boolean) => !!iso && !done && new Date(iso).getTime() < Date.now();

export function TicketDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { me, can } = useAuth();
  const agent = can('helpdesk.ticket.assign');
  const [reply, setReply] = useState('');
  const [internal, setInternal] = useState(false);
  const t = useQuery({ queryKey: ['ticket', id], queryFn: () => api<Ticket>(`/v1/helpdesk/tickets/${id}`) });
  const c = useQuery({ queryKey: ['ticket-comments', id], queryFn: () => api<{ data: Comment[] }>(`/v1/helpdesk/tickets/${id}/comments`) });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['ticket', id] }); void qc.invalidateQueries({ queryKey: ['ticket-comments', id] }); void qc.invalidateQueries({ queryKey: ['tickets-list'] }); };
  const fail = (e: unknown) => toast('error', e instanceof ApiError ? e.message : 'That did not work.');
  const post = useMutation({ mutationFn: () => api(`/v1/helpdesk/tickets/${id}/comments`, { method: 'POST', body: { body: reply, internal } }), onSuccess: () => { setReply(''); setInternal(false); refresh(); }, onError: fail });
  const act = useMutation({ mutationFn: ({ path, body }: { path: string; body?: unknown }) => api(`/v1/helpdesk/tickets/${id}/${path}`, { method: 'POST', body: body ?? {} }), onSuccess: refresh, onError: fail });
  if (t.isLoading) return <Skeleton className="m-6 h-64" />;
  if (!t.data) return <EmptyState title="Ticket not found" hint="It may belong to someone else." />;
  const x = t.data;
  const mine = x.requesterId === me?.membership.employeeId;
  const done = x.status === 'resolved' || x.status === 'closed';
  return (
    <>
      <PageHeader title={`${x.code}: ${x.subject}`} scope="Help desk"
        secondary={<><StatusPill tone={statusTone(x.status)}>{label(x.status)}</StatusPill><StatusPill tone={priorityTone(x.priority)}>{label(x.priority)}</StatusPill></>}
        primary={mine && x.status === 'resolved' ? <Button variant="primary" onClick={() => act.mutate({ path: 'close' })}>It is fixed, close it</Button> : undefined} />
      <PageBody wide={false} className="space-y-5">
        {x.description && <p className="whitespace-pre-wrap text-sm">{x.description}</p>}
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-muted">Category</dt><dd>{label(x.category)}</dd></div>
          <div><dt className="text-xs text-muted">First reply due</dt><dd className={overdue(x.firstResponseDueAt, !!x.firstRespondedAt) ? 'font-medium text-absent' : ''}>{x.firstRespondedAt ? 'Replied' : when(x.firstResponseDueAt)}</dd></div>
          <div><dt className="text-xs text-muted">Resolve by</dt><dd className={overdue(x.resolutionDueAt, done) ? 'font-medium text-absent' : ''}>{done ? 'Done' : when(x.resolutionDueAt)}</dd></div>
          <div><dt className="text-xs text-muted">Rating</dt><dd>{x.rating ? `${x.rating} of 5` : '–'}</dd></div>
        </dl>
        {agent && x.status !== 'closed' && (
          <div className="flex flex-wrap items-end gap-3 rounded-card border border-rule p-3">
            <Field label="Assigned to">{(id) => <RefPicker id={id} entity="employees" value={x.assigneeId} onChange={(v) => act.mutate({ path: 'assign', body: { assigneeId: v } })} />}</Field>
            <Field label="Status">{(id) => <Select id={id} value={['in_progress', 'waiting', 'resolved'].includes(x.status) ? x.status : ''} onChange={(e) => e.target.value && act.mutate({ path: 'status', body: { status: e.target.value } })}><option value="">{label(x.status)}</option><option value="in_progress">In progress</option><option value="waiting">Waiting for the requester</option><option value="resolved">Resolved</option></Select>}</Field>
          </div>
        )}
        <section aria-labelledby="conv" className="space-y-3"><h2 id="conv" className="text-section font-semibold">Conversation</h2>
          {c.data?.data.length === 0 && <p className="text-sm text-muted">No replies yet.</p>}
          <ul className="space-y-3">{c.data?.data.map((m) => (
            <li key={m.id} className={`rounded-card border p-3 ${m.internal ? 'border-late bg-late-tint' : m.fromRequester ? 'border-rule bg-surface' : 'border-rule bg-soft'}`}>
              <p className="text-xs text-muted">{m.authorName ?? 'Someone'} · {new Date(m.createdAt).toLocaleString()}{m.internal ? ' · internal note' : ''}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
            </li>))}</ul>
        </section>
        {x.status === 'closed' ? (
          <Banner tone="info">This ticket is closed.{mine || agent ? ' ' : ''}{(mine || agent) && <button type="button" className="underline" onClick={() => act.mutate({ path: 'reopen' })}>Reopen it</button>}</Banner>
        ) : (
          <div className="space-y-2">
            <Field label={internal ? 'Internal note (the requester will not see it)' : 'Reply'}>{(id) => <Textarea id={id} rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />}</Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" disabled={!reply.trim()} loading={post.isPending} onClick={() => post.mutate()}>{internal ? 'Add note' : 'Send reply'}</Button>
              {agent && <Toggle label="Internal note" checked={internal} onChange={setInternal} disabled={false} />}
              {x.status === 'resolved' && mine && <Button onClick={() => act.mutate({ path: 'reopen' })}>It is not fixed, reopen</Button>}
            </div>
          </div>
        )}
        {done && mine && !x.rating && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Rate the help you got"><span className="text-sm">How was the help?</span>{[1, 2, 3, 4, 5].map((n) => <Button key={n} size="sm" onClick={() => act.mutate({ path: 'rate', body: { rating: n } })}>{n}</Button>)}</div>
        )}
      </PageBody>
    </>
  );
}

'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner, Button, Field, Input, Modal, PageBody, PageHeader, Section, Select, Skeleton, StatusPill, Textarea, Toggle } from '@trackrex/ui';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/shared/api';
import { money } from '@/shared/money';
import { useSession } from '@/shared/session';
import { tone } from '@/shared/tone';

interface Inv { id: string; number: string; periodStart: string; status: string; totalMinor: number; currency: string; dueAt: string }
interface Detail {
  id: string; slug: string; name: string; status: string; planKey: string; seatLimit: number; trialEndsAt: string | null; isDemo: boolean;
  supportAccessEnabled: boolean; featureFlags: Record<string, boolean>; internalNotes: string | null; suspendedReason: string | null; purgeAfter: string | null;
  usage: { employeesActive: number } | null; owner: { name: string; email: string } | null;
  supportSessions: { id: string; reason: string; startedAt: string; expiresAt: string; endedAt: string | null; endedReason: string | null }[];
  audit: { id: string; at: string; action: string; details: Record<string, unknown> }[];
}
type Action = 'suspend' | 'restore' | 'cancel' | 'extend_trial' | 'activate' | 'mark_past_due' | 'delete' | 'undelete';
const ACTIONS: { action: Action; label: string; from: string[]; needsReason?: boolean; danger?: boolean }[] = [
  { action: 'activate', label: 'Activate', from: ['trial'] },
  { action: 'extend_trial', label: 'Extend trial', from: ['trial'] },
  { action: 'mark_past_due', label: 'Mark past due', from: ['active'] },
  { action: 'suspend', label: 'Suspend', from: ['trial', 'active', 'past_due'], needsReason: true, danger: true },
  { action: 'restore', label: 'Restore', from: ['suspended', 'past_due'] },
  { action: 'cancel', label: 'Cancel', from: ['active', 'past_due', 'suspended'], danger: true },
  { action: 'delete', label: 'Delete', from: ['cancelled', 'suspended', 'trial'], needsReason: true, danger: true },
  { action: 'undelete', label: 'Undelete', from: ['deleted'] },
];
const FLAGS = ['field_tracking', 'productivity', 'calls', 'expenses', 'workflows', 'whatsapp'];

export default function CompanyDetail() {
  const { id } = useParams<{ id: string }>();
  const { can } = useSession();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['company', id], queryFn: () => api<Detail>(`/platform/v1/tenants/${id}`) });
  const [pending, setPending] = useState<(typeof ACTIONS)[number]>();
  const [reason, setReason] = useState('');
  const [days, setDays] = useState('7');
  const [error, setError] = useState('');
  const [support, setSupport] = useState(false);
  const [sReason, setSReason] = useState('');
  const [sMinutes, setSMinutes] = useState('60');
  const t = q.data;
  const fail = (e: unknown) => setError(e instanceof ApiError ? e.message : 'Something went wrong.');
  const invoices = useQuery({ queryKey: ['company-invoices', id], queryFn: () => api<Inv[]>('/platform/v1/invoices', { query: { tenantId: id, limit: 24 } }) });
  const gen = useMutation({ mutationFn: () => api(`/platform/v1/tenants/${id}/invoices`, { method: 'POST', body: {} }), onSuccess: () => void invoices.refetch(), onError: fail });
  const markPaid = useMutation({
    mutationFn: (i: Inv) => api(`/platform/v1/invoices/${i.id}/payments`, { method: 'POST', body: { amountMinor: i.totalMinor, reference: window.prompt('Bank reference (optional)') ?? undefined } }),
    onSuccess: () => { void invoices.refetch(); void qc.invalidateQueries({ queryKey: ['company', id] }); }, onError: fail,
  });
  const [edit, setEdit] = useState<{ plan: string; seats: string; notes: string; flags: Record<string, boolean> }>();
  const form = edit ?? (t ? { plan: t.planKey, seats: String(t.seatLimit), notes: t.internalNotes ?? '', flags: t.featureFlags ?? {} } : undefined);
  const refresh = (d: Detail) => { qc.setQueryData(['company', id], d); void qc.invalidateQueries({ queryKey: ['companies'] }); };

  const run = useMutation({
    mutationFn: () => api<Detail>(`/platform/v1/tenants/${id}/lifecycle`, { method: 'POST', body: { action: pending!.action, ...(reason ? { reason } : {}), ...(pending!.action === 'extend_trial' ? { days: Number(days) } : {}) } }),
    onSuccess: (d) => { refresh(d); setPending(undefined); setReason(''); setError(''); }, onError: fail,
  });
  const save = useMutation({
    mutationFn: () => api<Detail>(`/platform/v1/tenants/${id}`, { method: 'PATCH', body: { planKey: form!.plan, seatLimit: Number(form!.seats), internalNotes: form!.notes, featureFlags: form!.flags } }),
    onSuccess: (d) => { refresh(d); setEdit(undefined); setError(''); }, onError: fail,
  });
  const start = useMutation({
    mutationFn: () => api<{ consoleUrl: string }>(`/platform/v1/tenants/${id}/support-sessions`, { method: 'POST', body: { reason: sReason, minutes: Number(sMinutes) } }),
    onSuccess: (r) => { setSupport(false); setSReason(''); void qc.invalidateQueries({ queryKey: ['company', id] }); window.open(r.consoleUrl, '_blank', 'noopener'); },
    onError: fail,
  });
  const end = useMutation({ mutationFn: (sid: string) => api(`/platform/v1/support-sessions/${sid}/end`, { method: 'POST' }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['company', id] }), onError: fail });

  if (q.isLoading || !t || !form) return <><PageHeader title="Company" scope="Platform · Companies" /><PageBody><Skeleton className="h-40" /></PageBody></>;
  const editable = can('onboarding', 'finance');
  const available = ACTIONS.filter((a) => a.from.includes(t.status));
  const now = Date.now();

  return (
    <>
      <PageHeader title={t.name} scope="Platform · Companies" description={`${t.slug} · owner ${t.owner ? `${t.owner.name} (${t.owner.email})` : 'not yet joined'}`}
        primary={can('support') ? <Button variant="primary" disabled={!t.supportAccessEnabled || t.status === 'deleted'} onClick={() => setSupport(true)} title={t.supportAccessEnabled ? undefined : 'The company has not allowed support access'}>Start support session</Button> : undefined} />
      <PageBody className="space-y-6">
        {error && <Banner tone="error" onDismiss={() => setError('')}>{error}</Banner>}
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill tone={tone(t.status)}>{t.status.replace('_', ' ')}</StatusPill>
          {t.isDemo && <span className="text-xs text-muted">Demo company</span>}
          {t.trialEndsAt && t.status === 'trial' && <span className="text-xs text-muted">Trial ends {new Date(t.trialEndsAt).toLocaleDateString()}</span>}
          {t.suspendedReason && <span className="text-xs text-muted">Reason: {t.suspendedReason}</span>}
          {t.purgeAfter && <span className="text-xs text-muted">Permanent removal after {new Date(t.purgeAfter).toLocaleDateString()}</span>}
          <span className="text-xs text-muted">Support access {t.supportAccessEnabled ? 'allowed by the company' : 'off'}</span>
        </div>

        {editable && available.length > 0 && (
          <Section title="Lifecycle" description="Every transition is recorded in the platform audit log.">
            <div className="flex flex-wrap gap-2">{available.map((a) => <Button key={a.action} variant={a.danger ? 'danger' : 'secondary'} onClick={() => { setError(''); setPending(a); }}>{a.label}</Button>)}</div>
          </Section>
        )}

        <Section title="Plan and entitlements" actions={editable ? <Button variant="primary" loading={save.isPending} disabled={!edit} onClick={() => save.mutate()}>Save changes</Button> : undefined}>
          <div className="grid gap-4 lg:grid-cols-3">
            <Field label="Plan">{(fid) => <Select id={fid} disabled={!editable} value={form.plan} onChange={(e) => setEdit({ ...form, plan: e.target.value })}><option value="trial">Trial</option><option value="all_in_one">All in one</option><option value="field">Field bundle</option><option value="office">Office bundle</option></Select>}</Field>
            <Field label="Seat limit" help={`${t.usage?.employeesActive ?? 0} in use`}>{(fid, d) => <Input id={fid} aria-describedby={d} type="number" min={1} disabled={!editable} value={form.seats} onChange={(e) => setEdit({ ...form, seats: e.target.value })} />}</Field>
          </div>
          <fieldset className="mt-4"><legend className="mb-2 text-sm font-semibold">Feature flags</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{FLAGS.map((f) => <Toggle key={f} label={f.replace('_', ' ')} disabled={!editable} checked={form.flags[f] ?? true} onChange={(v) => setEdit({ ...form, flags: { ...form.flags, [f]: v } })} />)}</div>
          </fieldset>
          <div className="mt-4"><Field label="Internal notes" help="Visible to platform staff only.">{(fid, d) => <Textarea id={fid} aria-describedby={d} rows={3} disabled={!editable} value={form.notes} onChange={(e) => setEdit({ ...form, notes: e.target.value })} />}</Field></div>
        </Section>

        <Section title="Invoices" actions={can('finance') && t.planKey !== 'trial' ? <Button size="sm" loading={gen.isPending} onClick={() => gen.mutate()}>Issue this month's invoice</Button> : undefined}>
          {(invoices.data ?? []).length === 0 ? <p className="text-sm text-muted">{t.planKey === 'trial' ? 'On trial: nothing to bill yet.' : 'No invoices yet.'}</p> : (
            <ul className="divide-y divide-rule rounded-card border border-rule">{invoices.data!.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span><span className="font-medium tabular-nums">{i.number}</span><span className="block text-xs text-muted">From {i.periodStart} · due {new Date(i.dueAt).toLocaleDateString()}</span></span>
                <span className="flex items-center gap-3"><span className="tabular-nums">{money(i.totalMinor, i.currency)}</span><StatusPill tone={i.status === 'paid' ? 'present' : i.status === 'open' ? 'pending' : 'non-working'}>{i.status}</StatusPill>
                  {i.status === 'open' && can('finance') && <Button size="sm" loading={markPaid.isPending} onClick={() => markPaid.mutate(i)}>Mark paid</Button>}</span>
              </li>))}</ul>
          )}
        </Section>

        <Section title="Support sessions" description="Time-boxed access the company has allowed. Customer data is read through a restricted session.">
          {t.supportSessions.length === 0 ? <p className="text-sm text-muted">No support sessions yet.</p> : (
            <ul className="divide-y divide-rule rounded-card border border-rule">{t.supportSessions.map((s) => {
              const live = !s.endedAt && new Date(s.expiresAt).getTime() > now;
              return <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span><span className="font-medium">{s.reason}</span><span className="block text-xs text-muted">{new Date(s.startedAt).toLocaleString()} · {live ? `expires ${new Date(s.expiresAt).toLocaleTimeString()}` : (s.endedReason ?? 'expired')}</span></span>
                {live && can('support') && <Button size="sm" loading={end.isPending} onClick={() => end.mutate(s.id)}>End now</Button>}
              </li>;
            })}</ul>
          )}
        </Section>

        <Section title="Audit trail">
          {t.audit.length === 0 ? <p className="text-sm text-muted">Nothing recorded.</p> : (
            <ol className="divide-y divide-rule rounded-card border border-rule">{t.audit.map((a) => <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2 text-sm"><span className="font-mono text-xs">{a.action}</span><span className="text-xs text-muted tabular-nums">{new Date(a.at).toLocaleString()}</span></li>)}</ol>
          )}
        </Section>
      </PageBody>

      <Modal open={!!pending} onOpenChange={(o) => { if (!o) setPending(undefined); }} title={pending ? `${pending.label} ${t.name}?` : ''} description="This is recorded in the audit log."
        footer={<><Button onClick={() => setPending(undefined)}>Cancel</Button><Button variant={pending?.danger ? 'danger' : 'primary'} loading={run.isPending} onClick={() => run.mutate()}>{pending?.label}</Button></>}>
        {pending?.action === 'extend_trial' && <Field label="Extra days">{(fid) => <Input id={fid} type="number" min={1} max={90} value={days} onChange={(e) => setDays(e.target.value)} />}</Field>}
        {(pending?.needsReason || pending?.action === 'cancel') && <Field label="Reason" required={!!pending?.needsReason}>{(fid) => <Textarea id={fid} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>}
        {error && <div className="mt-3"><Banner tone="error">{error}</Banner></div>}
      </Modal>

      <Modal open={support} onOpenChange={setSupport} title="Start support session" description="The company is told this happened. Access is read-restricted and expires automatically."
        footer={<><Button onClick={() => setSupport(false)}>Cancel</Button><Button variant="primary" loading={start.isPending} disabled={sReason.trim().length < 10} onClick={() => start.mutate()}>Open console</Button></>}>
        <div className="space-y-3">
          <Field label="Why do you need access?" required help="At least 10 characters. Ticket reference helps.">{(fid, d) => <Textarea id={fid} aria-describedby={d} rows={3} value={sReason} onChange={(e) => setSReason(e.target.value)} />}</Field>
          <Field label="Duration">{(fid) => <Select id={fid} value={sMinutes} onChange={(e) => setSMinutes(e.target.value)}>{[['15', '15 minutes'], ['30', '30 minutes'], ['60', '1 hour'], ['240', '4 hours']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>}</Field>
          {error && <Banner tone="error">{error}</Banner>}
        </div>
      </Modal>
    </>
  );
}

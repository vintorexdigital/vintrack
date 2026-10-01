'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner, Button, DataTable, EmptyState, Field, Input, Modal, PageBody, PageHeader, Section, Skeleton, StatusPill, useToast, type DataColumn } from '@trackrex/ui';
import { useState } from 'react';
import { api, ApiError } from '@/shared/api/client';
import { useAuth, useCan } from '@/shared/auth/auth';

interface Sub {
  status: string; planKey: string; planName: string; trialEndsAt: string | null; currency: string; seatLimit: number; seatsUsed: number; pricePerSeatMinor: number; monthlyMinor: number; paymentMethod: 'bank_transfer' | 'online';
  plans: { key: string; name: string; tagline: string; highlights: string[]; pricePerSeatMinor: number }[];
}
interface Invoice { id: string; number: string; periodStart: string; periodEnd: string; status: 'open' | 'paid' | 'void'; totalMinor: number; currency: string; dueAt: string }
const money = (minor: number, cur: string) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: cur }).format(minor / 100);
const tone = (s: string) => (s === 'paid' ? 'present' : s === 'open' ? 'pending' : 'non-working') as 'present' | 'pending' | 'non-working';

/** Opens the printable invoice. The endpoint needs the bearer token, so it is fetched and shown from a blob URL. */
async function openInvoice(id: string) {
  const res = await api<Response>(`/v1/billing/invoices/${id}/print`, { raw: true });
  const url = URL.createObjectURL(await res.blob());
  window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export default function BillingPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { reload } = useAuth();
  const manage = useCan('billing.subscription.manage');
  const sub = useQuery({ queryKey: ['billing-sub'], queryFn: () => api<Sub>('/v1/billing/subscription') });
  const inv = useQuery({ queryKey: ['billing-invoices'], queryFn: () => api<Invoice[]>('/v1/billing/invoices') });
  const [choose, setChoose] = useState(false);
  const [plan, setPlan] = useState('field');
  const [seats, setSeats] = useState('');
  const [howTo, setHowTo] = useState('');
  const fail = (e: unknown) => toast('error', e instanceof ApiError ? e.message : 'Something went wrong.');
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['billing-sub'] }); void qc.invalidateQueries({ queryKey: ['billing-invoices'] }); void reload(); };

  const save = useMutation({
    mutationFn: () => (sub.data?.planKey === 'trial'
      ? api('/v1/billing/subscribe', { method: 'POST', body: { planKey: plan, seats: Number(seats) } })
      : api('/v1/billing/change', { method: 'POST', body: { planKey: plan, seats: Number(seats) } })),
    onSuccess: () => { setChoose(false); refresh(); toast('success', sub.data?.planKey === 'trial' ? 'Plan chosen. Your first invoice is ready below.' : 'Saved. The new plan or seat count is billed from your next invoice.'); },
    onError: fail,
  });
  const pay = useMutation({
    mutationFn: (id: string) => api<{ method: string; url?: string; message?: string }>(`/v1/billing/invoices/${id}/pay`, { method: 'POST', body: { returnUrl: `${window.location.origin}/admin/billing` } }),
    onSuccess: (r) => { if (r.url) window.location.assign(r.url); else setHowTo(r.message ?? ''); },
    onError: fail,
  });

  if (sub.isLoading || !sub.data) return <><PageHeader title="Plan and billing" scope="Admin · Company settings" /><PageBody><Skeleton className="h-48" /></PageBody></>;
  const s = sub.data;
  const pct = Math.min(100, Math.round((s.seatsUsed / Math.max(1, s.seatLimit)) * 100));
  const openCols: DataColumn<Invoice>[] = [
    { key: 'number', header: 'Invoice', cell: (r) => <span className="font-medium tabular-nums">{r.number}</span> },
    { key: 'period', header: 'Period', numeric: true, cell: (r) => `${r.periodStart} to ${r.periodEnd}` },
    { key: 'total', header: 'Amount', numeric: true, cell: (r) => money(r.totalMinor, r.currency) },
    { key: 'due', header: 'Due', numeric: true, cell: (r) => new Date(r.dueAt).toLocaleDateString() },
    { key: 'status', header: 'Status', cell: (r) => <StatusPill tone={tone(r.status)}>{r.status}</StatusPill> },
    { key: 'actions', header: 'Actions', cell: (r) => (
      <span className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => void openInvoice(r.id).catch(fail)}>View</Button>
        {manage && r.status === 'open' && <Button size="sm" variant="primary" loading={pay.isPending && pay.variables === r.id} onClick={() => pay.mutate(r.id)}>Pay</Button>}
      </span>
    ) },
  ];

  return (
    <>
      <PageHeader title="Plan and billing" scope="Admin · Company settings" description="Your plan, seats and invoices." primary={manage ? <Button variant="primary" onClick={() => { setPlan(s.planKey === 'trial' ? 'field' : s.planKey); setSeats(String(Math.max(s.seatsUsed, s.seatLimit))); setChoose(true); }}>{s.planKey === 'trial' ? 'Choose a plan' : 'Change plan or seats'}</Button> : undefined} />
      <PageBody className="space-y-6">
        {s.status === 'trial' && <Banner tone="info">You are on a free trial{s.trialEndsAt ? ` until ${new Date(s.trialEndsAt).toLocaleDateString()}` : ''}. Choose a plan to keep going.</Banner>}
        {s.status === 'past_due' && <Banner tone="warn">Payment is overdue. Pay the open invoice to avoid your account being suspended.</Banner>}
        {s.status === 'suspended' && <Banner tone="error">This account is suspended for non-payment. Pay the open invoice to restore access.</Banner>}
        {howTo && <Banner tone="info" onDismiss={() => setHowTo('')}>{howTo}</Banner>}
        <Section title="Current plan">
          <dl className="grid gap-4 sm:grid-cols-3">
            <div><dt className="text-xs text-muted">Plan</dt><dd className="text-section font-semibold">{s.planName}</dd></div>
            <div><dt className="text-xs text-muted">Price</dt><dd className="tabular-nums">{s.planKey === 'trial' ? 'Free during trial' : `${money(s.pricePerSeatMinor, s.currency)} per seat per month`}</dd></div>
            <div><dt className="text-xs text-muted">Monthly total (before tax)</dt><dd className="tabular-nums">{s.planKey === 'trial' ? '–' : money(s.monthlyMinor, s.currency)}</dd></div>
          </dl>
          <div className="mt-4 max-w-md">
            <p className="mb-1 flex justify-between text-sm"><span>Seats in use</span><span className="tabular-nums">{s.seatsUsed} of {s.seatLimit}</span></p>
            <div className="h-2 overflow-hidden rounded-pill bg-canvas" role="img" aria-label={`${pct}% of seats used`}><div className={pct >= 100 ? 'h-full bg-absent' : pct >= 90 ? 'h-full bg-late' : 'h-full bg-brand'} style={{ width: `${pct}%` }} /></div>
          </div>
        </Section>
        <Section title="Invoices">
          <DataTable caption="Invoices" columns={openCols} rows={inv.data ?? []} rowKey={(r) => r.id} loading={inv.isLoading} empty={<EmptyState title="No invoices yet" hint="Your first invoice appears after you choose a plan." />} />
        </Section>
      </PageBody>
      <Modal open={choose} onOpenChange={setChoose} title={s.planKey === 'trial' ? 'Choose a plan' : 'Change plan or seats'} description={s.planKey === 'trial' ? 'You will be invoiced now and your account becomes active when the invoice is paid.' : 'Changes apply now and are billed from your next invoice.'}
        footer={<><Button onClick={() => setChoose(false)}>Cancel</Button><Button variant="primary" loading={save.isPending} disabled={!Number(seats)} onClick={() => save.mutate()}>{s.planKey === 'trial' ? 'Create invoice' : 'Save'}</Button></>}>
        <div className="space-y-4">
          <fieldset><legend className="mb-2 text-sm font-semibold">Plan</legend>
            <div className="grid gap-2">{s.plans.map((p) => (
              <label key={p.key} className="flex cursor-pointer items-start gap-3 rounded-card border border-rule p-3 has-[:checked]:border-brand has-[:checked]:bg-canvas">
                <input type="radio" name="plan" className="mt-1" checked={plan === p.key} onChange={() => setPlan(p.key)} />
                <span className="text-sm"><span className="font-semibold">{p.name}</span> <span className="tabular-nums text-muted">{money(p.pricePerSeatMinor, s.currency)} / seat / month</span><span className="block text-muted">{p.tagline}</span></span>
              </label>
            ))}</div>
          </fieldset>
          <Field label="Seats" help={`${s.seatsUsed} in use. Prices exclude tax.`} required>{(id, d) => <Input id={id} aria-describedby={d} type="number" min={Math.max(1, s.seatsUsed)} value={seats} onChange={(e) => setSeats(e.target.value)} />}</Field>
        </div>
      </Modal>
    </>
  );
}

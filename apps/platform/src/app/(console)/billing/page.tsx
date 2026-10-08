'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner, Button, DataTable, EmptyState, Field, Input, KpiBand, Modal, PageBody, PageHeader, Section, StatusPill, type DataColumn } from '@trackrex/ui';
import Link from 'next/link';
import { useState } from 'react';
import { api, ApiError } from '@/shared/api';
import { money } from '@/shared/money';
import { useSession } from '@/shared/session';

interface Overview { mrrMinor: Record<string, number>; payingCompanies: number; outstanding: { currency: string; invoices: number; totalMinor: number; overdue: number }[] }
interface Plan { key: string; name: string; prices: Record<string, number>; active: boolean }
interface Invoice { id: string; tenantId: string; number: string; periodStart: string; status: string; totalMinor: number; currency: string; dueAt: string }

export default function BillingPage() {
  const { can } = useSession();
  const qc = useQueryClient();
  const ov = useQuery({ queryKey: ['billing-overview'], queryFn: () => api<Overview>('/platform/v1/billing/overview'), enabled: can('finance', 'analyst') });
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api<Plan[]>('/platform/v1/plans') });
  const inv = useQuery({ queryKey: ['all-invoices'], queryFn: () => api<Invoice[]>('/platform/v1/invoices', { query: { status: 'open', limit: 100 } }) });
  const [edit, setEdit] = useState<Plan>();
  const [inr, setInr] = useState('');
  const [usd, setUsd] = useState('');
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: () => api(`/platform/v1/plans/${edit!.key}`, { method: 'PUT', body: { prices: { ...edit!.prices, INR: Math.round(Number(inr) * 100), USD: Math.round(Number(usd) * 100) } } }),
    onSuccess: () => { setEdit(undefined); void qc.invalidateQueries({ queryKey: ['plans'] }); }, onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not save.'),
  });
  const cols: DataColumn<Invoice>[] = [
    { key: 'number', header: 'Invoice', cell: (r) => <Link className="font-medium tabular-nums underline-offset-2 hover:underline" href={`/companies/${r.tenantId}`}>{r.number}</Link> },
    { key: 'period', header: 'Period from', numeric: true, cell: (r) => r.periodStart },
    { key: 'total', header: 'Amount', numeric: true, cell: (r) => money(r.totalMinor, r.currency) },
    { key: 'due', header: 'Due', numeric: true, cell: (r) => new Date(r.dueAt).toLocaleDateString() },
    { key: 'overdue', header: 'State', cell: (r) => (new Date(r.dueAt).getTime() < Date.now() ? <StatusPill tone="absent">overdue</StatusPill> : <StatusPill tone="pending">open</StatusPill>) },
  ];
  return (
    <>
      <PageHeader title="Billing" scope="Platform" description="Recurring revenue, receivables and plan prices." />
      <PageBody className="space-y-6">
        {ov.data && <KpiBand items={[
          ...Object.entries(ov.data.mrrMinor).map(([c, v]) => ({ label: `Monthly recurring (${c})`, value: money(v, c) })),
          { label: 'Paying companies', value: String(ov.data.payingCompanies) },
          ...ov.data.outstanding.map((o) => ({ label: `Outstanding (${o.currency})`, value: money(o.totalMinor, o.currency), unit: `${o.invoices} invoices, ${o.overdue} overdue` })),
        ]} />}
        <Section title="Plan prices" description="Per seat per month, before tax. Changes apply to invoices issued from now on.">
          <ul className="divide-y divide-rule rounded-card border border-rule">
            {plans.data?.map((p) => (
              <li key={p.key} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="font-medium">{p.name}</span>
                <span className="tabular-nums text-muted">{Object.entries(p.prices).map(([c, v]) => money(v, c)).join(' · ')}</span>
                {can('finance') && p.key !== 'trial' && <Button size="sm" onClick={() => { setEdit(p); setInr(String((p.prices.INR ?? 0) / 100)); setUsd(String((p.prices.USD ?? 0) / 100)); setError(''); }}>Edit prices</Button>}
              </li>
            ))}
          </ul>
        </Section>
        <Section title="Open invoices"><DataTable caption="Open invoices" columns={cols} rows={inv.data ?? []} rowKey={(r) => r.id} loading={inv.isLoading} empty={<EmptyState title="Nothing outstanding" />} /></Section>
      </PageBody>
      <Modal open={!!edit} onOpenChange={(o) => { if (!o) setEdit(undefined); }} title={`Edit ${edit?.name ?? ''} prices`} description="Whole currency units per seat per month."
        footer={<><Button onClick={() => setEdit(undefined)}>Cancel</Button><Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>Save prices</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="INR (₹)">{(id) => <Input id={id} type="number" min={0} step="0.01" value={inr} onChange={(e) => setInr(e.target.value)} />}</Field>
          <Field label="USD ($)">{(id) => <Input id={id} type="number" min={0} step="0.01" value={usd} onChange={(e) => setUsd(e.target.value)} />}</Field>
        </div>
        {error && <div className="mt-3"><Banner tone="error">{error}</Banner></div>}
      </Modal>
    </>
  );
}

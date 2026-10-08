'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner, Button, DataTable, EmptyState, Input, Modal, PageBody, PageHeader, Skeleton, StatusPill, useToast, type DataColumn } from '@trackrex/ui';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError, download } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/auth';

interface Run { id: string; cycleStart: string; cycleEnd: string; label: string; status: 'draft' | 'finalized' | 'paid'; employees: number; gross: number; deductions: number; net: number; employerCost: number; paidAt: string | null; paymentReference: string | null }
interface Slip { id: string; employeeId: string; code: string | null; name: string; gross: number; totalDeductions: number; net: number; payableDays: number; cycleDays: number; lopDays: number; warnings: string[] }
const inr = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
const tone = (s: string) => (s === 'paid' ? 'present' : s === 'finalized' ? 'pending' : 'non-working') as 'present' | 'pending' | 'non-working';
const lastMonthEnd = () => { const n = new Date(); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 0)).toISOString().slice(0, 10); };

export function RunsList() {
  const router = useRouter();
  const toast = useToast();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(lastMonthEnd());
  const q = useQuery({ queryKey: ['payroll-runs'], queryFn: () => api<{ data: Run[] }>('/v1/payroll/runs') });
  const create = useMutation({
    mutationFn: () => api<{ run: Run; missingStructure: string[] }>('/v1/payroll/runs', { method: 'POST', body: { date } }),
    onSuccess: (r) => { if (r.missingStructure.length) toast('info', `${r.missingStructure.length} people have no salary structure and were left out.`); router.push(`/payroll/runs/${r.run.id}`); },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Could not draft the run.'),
  });
  const cols: DataColumn<Run>[] = [
    { key: 'label', header: 'Pay cycle', cell: (r) => <Link href={`/payroll/runs/${r.id}`}>{r.label}</Link> },
    { key: 'range', header: 'Dates', numeric: true, cell: (r) => `${r.cycleStart} to ${r.cycleEnd}` },
    { key: 'status', header: 'Status', cell: (r) => <StatusPill tone={tone(r.status)}>{r.status}</StatusPill> },
    { key: 'emp', header: 'People', numeric: true, cell: (r) => r.employees },
    { key: 'gross', header: 'Gross', numeric: true, cell: (r) => inr(r.gross) },
    { key: 'net', header: 'Net pay', numeric: true, cell: (r) => inr(r.net) },
  ];
  return (
    <>
      <PageHeader title="Payroll" scope="People" description="Draft a pay cycle from attendance and salary structures, check it, finalize it (this locks the attendance behind it), then mark it paid."
        primary={can('payroll.run.create') ? <Button variant="primary" onClick={() => setOpen(true)}>Draft a payroll run</Button> : undefined}
        secondary={<Link href="/payroll/salary-structures"><Button>Salary structures</Button></Link>} />
      <PageBody className="space-y-3">
        <DataTable caption="Payroll runs" columns={cols} rows={q.data?.data ?? []} rowKey={(r) => r.id} loading={q.isLoading} empty={<EmptyState title="No payroll runs yet" hint="Give people salary structures, then draft the first run for a finished pay cycle." />} />
      </PageBody>
      <Modal open={open} onOpenChange={setOpen} title="Draft a payroll run" description="Pick any date inside a finished pay cycle. A draft for that cycle is rebuilt from the latest attendance and salary structures."
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={create.isPending} onClick={() => create.mutate()}>Draft</Button></>}>
        <label className="block text-sm font-medium">A date in the cycle<Input className="mt-1.5" type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} /></label>
      </Modal>
    </>
  );
}

export function RunDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const [paying, setPaying] = useState(false);
  const [reference, setReference] = useState('');
  const q = useQuery({ queryKey: ['payroll-run', id], queryFn: () => api<{ run: Run; payslips: Slip[] }>(`/v1/payroll/runs/${id}`) });
  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api(`/v1/payroll/runs/${id}/${path}`, { method: 'POST', body: body ?? {} }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['payroll-run', id] }); void qc.invalidateQueries({ queryKey: ['payroll-runs'] }); setPaying(false); },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'That did not work.'),
  });
  if (q.isLoading) return <Skeleton className="m-6 h-64" />;
  if (!q.data) return <EmptyState title="Run not found" />;
  const { run, payslips } = q.data;
  const warned = payslips.filter((s) => s.warnings.length);
  const cols: DataColumn<Slip>[] = [
    { key: 'name', header: 'Employee', cell: (s) => <><span className="font-medium">{s.name}</span>{s.code && <span className="ml-2 text-xs text-muted">{s.code}</span>}</> },
    { key: 'days', header: 'Paid days', numeric: true, cell: (s) => `${s.payableDays} / ${s.cycleDays}` },
    { key: 'lop', header: 'Loss of pay', numeric: true, cell: (s) => (s.lopDays > 0 ? s.lopDays : '–') },
    { key: 'gross', header: 'Gross', numeric: true, cell: (s) => inr(s.gross) },
    { key: 'ded', header: 'Deductions', numeric: true, cell: (s) => inr(s.totalDeductions) },
    { key: 'net', header: 'Net pay', numeric: true, cell: (s) => inr(s.net) },
    { key: 'w', header: '', cell: (s) => (s.warnings.length ? <span title={s.warnings.join(' ')}><StatusPill tone="late">Check</StatusPill></span> : null) },
  ];
  return (
    <>
      <PageHeader title={`Payroll for ${run.label}`} scope="People · Payroll" description={`${run.cycleStart} to ${run.cycleEnd}${run.paidAt ? `. Paid ${new Date(run.paidAt).toLocaleDateString()}${run.paymentReference ? `, reference ${run.paymentReference}` : ''}` : ''}`}
        secondary={<>
          <StatusPill tone={tone(run.status)}>{run.status}</StatusPill>
          <Button icon={<Download className="size-4" aria-hidden />} onClick={() => void download(`/v1/payroll/runs/${id}/export`, { format: 'xlsx' }, 'payroll.xlsx')}>Excel</Button>
          <Button onClick={() => void download(`/v1/payroll/runs/${id}/export`, { format: 'csv' }, 'payroll.csv')}>CSV</Button>
        </>}
        primary={run.status === 'draft' && can('payroll.run.finalize') ? <Button variant="primary" loading={act.isPending} onClick={() => { if (window.confirm('Finalizing locks attendance for this cycle. Continue?')) act.mutate({ path: 'finalize' }); }}>Finalize</Button>
          : run.status === 'finalized' && can('payroll.run.pay') ? <Button variant="primary" onClick={() => setPaying(true)}>Mark as paid</Button> : undefined} />
      <PageBody className="space-y-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">{[['People', String(run.employees)], ['Gross', inr(run.gross)], ['Deductions', inr(run.deductions)], ['Net pay', inr(run.net)]].map(([l, v]) => <div key={l}><dt className="text-xs text-muted">{l}</dt><dd className="text-kpi font-semibold tabular-nums">{v}</dd></div>)}</dl>
        <p className="text-xs text-muted">Employer contributions (provident fund, state insurance) add {inr(run.employerCost)} to the cost of this run. Tax deducted at source is not calculated: add it as an “other deduction” on the salary structure.</p>
        {warned.length > 0 && <Banner tone="warn">{warned.length} payslip{warned.length === 1 ? ' needs' : 's need'} a look. Hover “Check” for the reason.</Banner>}
        <DataTable caption="Payslips in this run" columns={cols} rows={payslips} rowKey={(s) => s.id} empty={<EmptyState title="No payslips" hint="Nobody in this cycle has a salary structure yet." />} />
        <div className="flex flex-wrap gap-2">
          {run.status === 'draft' && can('payroll.run.create') && <Button loading={act.isPending} onClick={() => void api('/v1/payroll/runs', { method: 'POST', body: { date: run.cycleEnd } }).then(() => qc.invalidateQueries({ queryKey: ['payroll-run', id] })).catch((e: Error) => toast('error', e.message))}>Rebuild from latest data</Button>}
          {run.status === 'finalized' && can('payroll.run.finalize') && <Button onClick={() => act.mutate({ path: 'reopen' })}>Reopen (unlocks attendance)</Button>}
        </div>
      </PageBody>
      <Modal open={paying} onOpenChange={setPaying} title="Mark as paid" description="Everyone in this run is told their payslip is ready."
        footer={<><Button onClick={() => setPaying(false)}>Cancel</Button><Button variant="primary" loading={act.isPending} onClick={() => act.mutate({ path: 'pay', body: reference.trim() ? { reference: reference.trim() } : {} })}>Mark as paid</Button></>}>
        <label className="block text-sm font-medium">Payment reference (optional)<Input className="mt-1.5" value={reference} onChange={(e) => setReference(e.target.value)} /></label>
      </Modal>
    </>
  );
}

interface SlipRow { id: string; name: string; label: string; cycleStart: string; cycleEnd: string; net: number; gross: number }
/** A person's payslips. The printable page needs the sign-in token, so it opens from a downloaded copy. */
export function MyPayslips() {
  const toast = useToast();
  const q = useQuery({ queryKey: ['my-payslips'], queryFn: () => api<{ data: SlipRow[] }>('/v1/payroll/payslips') });
  const open = async (id: string) => {
    try {
      const res = await api<Response>(`/v1/payroll/payslips/${id}/print`, { raw: true });
      const url = URL.createObjectURL(new Blob([await res.text()], { type: 'text/html' }));
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) { toast('error', e instanceof ApiError ? e.message : 'Could not open the payslip.'); }
  };
  const cols: DataColumn<SlipRow>[] = [
    { key: 'label', header: 'Pay period', cell: (r) => r.label },
    { key: 'range', header: 'Dates', numeric: true, cell: (r) => `${r.cycleStart} to ${r.cycleEnd}` },
    { key: 'gross', header: 'Gross', numeric: true, cell: (r) => inr(r.gross) },
    { key: 'net', header: 'Net pay', numeric: true, cell: (r) => inr(r.net) },
    { key: 'open', header: '', cell: (r) => <Button size="sm" onClick={() => void open(r.id)}>Open / print</Button> },
  ];
  return (
    <>
      <PageHeader title="My payslips" scope="Employee" description="Your payslips appear here once payroll for a month is finalized. Open one to print it or save it as a PDF." />
      <PageBody wide={false}><DataTable caption="My payslips" columns={cols} rows={q.data?.data ?? []} rowKey={(r) => r.id} loading={q.isLoading} empty={<EmptyState title="No payslips yet" hint="You will be told when one is ready." />} /></PageBody>
    </>
  );
}

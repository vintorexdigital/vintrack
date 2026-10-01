'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Field, Input, PageBody, PageHeader, Skeleton, useToast } from '@trackrex/ui';
import { useEffect, useState } from 'react';
import { api, ApiError, download } from '@/shared/api/client';
import { useAuth, useCan } from '@/shared/auth/auth';

export default function CompanyPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const auth = useAuth();
  const canEdit = useCan('company.settings.update');
  const canExport = useCan('company.export');
  const q = useQuery({ queryKey: ['company'], queryFn: () => api<{ name: string; legalName: string | null; timezone: string; locale: string; slug: string; plan: string; status: string; country: string; currency: string }>('/v1/company') });
  const [v, setV] = useState({ name: '', legalName: '', timezone: '', locale: '' });
  useEffect(() => { if (q.data) setV({ name: q.data.name, legalName: q.data.legalName ?? '', timezone: q.data.timezone, locale: q.data.locale }); }, [q.data]);
  const save = useMutation({
    mutationFn: () => api('/v1/company', { method: 'PATCH', body: { name: v.name, ...(v.legalName ? { legalName: v.legalName } : {}), timezone: v.timezone, locale: v.locale } }),
    onSuccess: () => { toast('success', 'Company profile saved.'); void qc.invalidateQueries({ queryKey: ['company'] }); void auth.reload(); },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Could not save.'),
  });
  if (q.isLoading) return <Skeleton className="m-6 h-64" />;
  return (
    <>
      <PageHeader title="Company profile" scope="Admin · Company settings" />
      <PageBody wide={false}>
        <form className="grid gap-4 lg:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Company name" required>{(id) => <Input id={id} value={v.name} disabled={!canEdit} onChange={(e) => setV({ ...v, name: e.target.value })} />}</Field>
          <Field label="Legal name">{(id) => <Input id={id} value={v.legalName} disabled={!canEdit} onChange={(e) => setV({ ...v, legalName: e.target.value })} />}</Field>
          <Field label="Timezone" help="IANA name, for example Asia/Kolkata. Shifts keep their own timezone.">{(id, d) => <Input id={id} aria-describedby={d} value={v.timezone} disabled={!canEdit} onChange={(e) => setV({ ...v, timezone: e.target.value })} />}</Field>
          <Field label="Locale" help="For example en-IN.">{(id, d) => <Input id={id} aria-describedby={d} value={v.locale} disabled={!canEdit} onChange={(e) => setV({ ...v, locale: e.target.value })} />}</Field>
          <dl className="grid grid-cols-2 gap-3 text-sm lg:col-span-2"><div><dt className="text-xs text-muted">Company address</dt><dd className="tabular-nums">{q.data?.slug}</dd></div><div><dt className="text-xs text-muted">Plan</dt><dd className="capitalize">{q.data?.plan.replace('_', ' ')}</dd></div><div><dt className="text-xs text-muted">Status</dt><dd className="capitalize">{q.data?.status.replace('_', ' ')}</dd></div><div><dt className="text-xs text-muted">Currency</dt><dd>{q.data?.currency}</dd></div></dl>
          {canEdit && <div className="lg:col-span-2"><Button type="submit" variant="primary" loading={save.isPending}>Save changes</Button></div>}
        </form>
        {canExport && (
          <section className="mt-8 max-w-xl space-y-2 border-t border-rule pt-6" aria-labelledby="export-h">
            <h2 id="export-h" className="text-section font-semibold">Your data</h2>
            <p className="text-sm text-muted">Download everything your company holds in Trackrex as one Excel workbook, a sheet per table. It excludes other companies and sign-in secrets. Each download is recorded in the audit log.</p>
            <Button onClick={() => void download('/v1/company/export', undefined, 'company-export.xlsx').catch((e) => toast('error', e instanceof ApiError ? e.message : 'Could not export.'))}>Download all company data</Button>
          </section>
        )}
      </PageBody>
    </>
  );
}

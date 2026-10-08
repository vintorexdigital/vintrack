'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Banner, Button, DataTable, EmptyState, Field, Input, Modal, PageBody, PageHeader, Section, StatusPill, type DataColumn } from '@trackrex/ui';
import { api, ApiError } from '@/shared/api';
import { useSession } from '@/shared/session';

interface Reseller { id: string; name: string; slug: string; contactEmail: string | null; marginPct: string; status: string }
interface Group { id: string; name: string; createdAt: string }

export default function Resellers() {
  const { can } = useSession();
  const qc = useQueryClient();
  const [dlg, setDlg] = useState<'reseller' | 'group' | null>(null);
  const [v, setV] = useState({ name: '', slug: '', email: '', margin: '0' });
  const [error, setError] = useState('');
  const create = useMutation({
    mutationFn: () => (dlg === 'group'
      ? api('/platform/v1/company-groups', { method: 'POST', body: { name: v.name } })
      : api('/platform/v1/resellers', { method: 'POST', body: { name: v.name, slug: v.slug, ...(v.email ? { contactEmail: v.email } : {}), marginPct: Number(v.margin) } })),
    onSuccess: () => { setDlg(null); setV({ name: '', slug: '', email: '', margin: '0' }); void qc.invalidateQueries({ queryKey: ['resellers'] }); void qc.invalidateQueries({ queryKey: ['groups'] }); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not save.'),
  });
  const toggle = useMutation({ mutationFn: (x: Reseller) => api(`/platform/v1/resellers/${x.id}`, { method: 'PATCH', body: { status: x.status === 'active' ? 'suspended' : 'active' } }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['resellers'] }) });
  const canEdit = can('onboarding', 'finance');
  const r = useQuery({ queryKey: ['resellers'], queryFn: () => api<Reseller[]>('/platform/v1/resellers') });
  const g = useQuery({ queryKey: ['groups'], queryFn: () => api<Group[]>('/platform/v1/company-groups') });
  const rc: DataColumn<Reseller>[] = [
    { key: 'name', header: 'Reseller', cell: (x) => <span><span className="font-medium">{x.name}</span><span className="block text-xs text-muted">{x.slug}</span></span> },
    { key: 'email', header: 'Contact', cell: (x) => x.contactEmail ?? <span className="text-muted">–</span> },
    { key: 'margin', header: 'Margin', numeric: true, cell: (x) => `${Number(x.marginPct)}%` },
    { key: 'status', header: 'Status', cell: (x) => <StatusPill tone={x.status === 'active' ? 'present' : 'non-working'}>{x.status}</StatusPill> },
    ...(canEdit ? [{ key: 'actions', header: 'Actions', cell: (x: Reseller) => <Button size="sm" onClick={() => toggle.mutate(x)}>{x.status === 'active' ? 'Suspend' : 'Reactivate'}</Button> }] : []),
  ];
  const gc: DataColumn<Group>[] = [
    { key: 'name', header: 'Group', cell: (x) => <span className="font-medium">{x.name}</span> },
    { key: 'created', header: 'Created', numeric: true, cell: (x) => new Date(x.createdAt).toLocaleDateString() },
  ];
  return (
    <>
      <PageHeader title="Resellers and groups" scope="Platform" description="Resellers sell and support companies; groups let one billing owner span several companies." />
      <PageBody className="space-y-6">
        <Section title="Resellers" actions={canEdit ? <Button size="sm" variant="primary" onClick={() => { setError(''); setDlg('reseller'); }}>Add reseller</Button> : undefined}><DataTable caption="Resellers" columns={rc} rows={r.data ?? []} rowKey={(x) => x.id} loading={r.isLoading} empty={<EmptyState title="No resellers" hint="Resellers are created by the platform team." />} /></Section>
        <Section title="Company groups" actions={canEdit ? <Button size="sm" onClick={() => { setError(''); setDlg('group'); }}>Add group</Button> : undefined}><DataTable caption="Company groups" columns={gc} rows={g.data ?? []} rowKey={(x) => x.id} loading={g.isLoading} empty={<EmptyState title="No company groups" />} /></Section>
      </PageBody>
      <Modal open={!!dlg} onOpenChange={(o) => { if (!o) setDlg(null); }} title={dlg === 'group' ? 'Add company group' : 'Add reseller'}
        footer={<><Button onClick={() => setDlg(null)}>Cancel</Button><Button variant="primary" loading={create.isPending} disabled={!v.name || (dlg === 'reseller' && !v.slug)} onClick={() => create.mutate()}>Save</Button></>}>
        <div className="space-y-3">
          <Field label="Name" required>{(id) => <Input id={id} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value, ...(dlg === 'reseller' && !v.slug ? { slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) } : {}) })} />}</Field>
          {dlg === 'reseller' && <>
            <Field label="Short name" required help="Lowercase letters, digits and hyphens.">{(id, d) => <Input id={id} aria-describedby={d} value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value })} />}</Field>
            <Field label="Contact email">{(id) => <Input id={id} type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />}</Field>
            <Field label="Margin (%)">{(id) => <Input id={id} type="number" min={0} max={100} value={v.margin} onChange={(e) => setV({ ...v, margin: e.target.value })} />}</Field>
          </>}
          {error && <Banner tone="error">{error}</Banner>}
        </div>
      </Modal>
    </>
  );
}

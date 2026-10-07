'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner, Button, DataTable, EmptyState, Field, Modal, PageBody, PageHeader, Select, Skeleton, StatusPill, Textarea, useToast, type DataColumn } from '@trackrex/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, ApiError } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/auth';
import { RefPicker } from '@/shared/crud/fields';

interface Asset { id: string; code: string; name: string; category: string; serial: string | null; status: string; assignedToId: string | null }
interface Hist { id: string; employeeName: string; assignedAt: string; assignNote: string | null; returnedAt: string | null; condition: string | null; returnNote: string | null }
const label = (s: string) => s.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const tone = (s: string) => (s === 'assigned' ? 'pending' : s === 'repair' ? 'late' : s === 'retired' ? 'absent' : 'present') as 'pending' | 'late' | 'absent' | 'present';

export function AssetDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const router = useRouter();
  const [assigning, setAssigning] = useState(false);
  const [returning, setReturning] = useState(false);
  const [who, setWho] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [condition, setCondition] = useState('good');
  const a = useQuery({ queryKey: ['asset', id], queryFn: () => api<Asset>(`/v1/helpdesk/assets/${id}`) });
  const h = useQuery({ queryKey: ['asset-history', id], queryFn: () => api<{ data: Hist[] }>(`/v1/helpdesk/assets/${id}/history`) });
  const done = () => { setAssigning(false); setReturning(false); setNote(''); setWho(null); void qc.invalidateQueries({ queryKey: ['asset', id] }); void qc.invalidateQueries({ queryKey: ['asset-history', id] }); };
  const act = useMutation({ mutationFn: ({ path, body }: { path: string; body?: unknown }) => api(`/v1/helpdesk/assets/${id}/${path}`, { method: 'POST', body: body ?? {} }), onSuccess: done, onError: (e) => toast('error', e instanceof ApiError ? e.message : 'That did not work.') });
  if (a.isLoading) return <Skeleton className="m-6 h-48" />;
  if (!a.data) return <EmptyState title="Asset not found" />;
  const x = a.data;
  const update = can('helpdesk.asset.update');
  return (
    <>
      <PageHeader title={`${x.code}: ${x.name}`} scope="Help desk · Assets" description={`${label(x.category)}${x.serial ? ` · ${x.serial}` : ''}`} secondary={<><StatusPill tone={tone(x.status)}>{label(x.status)}</StatusPill>{update && x.status === 'in_stock' && <Button onClick={() => act.mutate({ path: 'repair' })}>Send for repair</Button>}{update && x.status !== 'retired' && <Button onClick={() => router.push(`/helpdesk/assets/${id}/edit`)}>Edit details</Button>}</>}
        primary={update ? (x.status === 'in_stock' ? <Button variant="primary" onClick={() => setAssigning(true)}>Give to someone</Button> : x.status === 'assigned' ? <Button variant="primary" onClick={() => setReturning(true)}>Take back</Button> : x.status === 'repair' ? <Button variant="primary" onClick={() => act.mutate({ path: 'repaired' })}>Back from repair</Button> : undefined) : undefined}
        />
      <PageBody wide={false} className="space-y-4">
        <h2 className="text-section font-semibold">History</h2>
        {h.data?.data.length === 0 ? <p className="text-sm text-muted">It has not been given to anyone yet.</p> : (
          <ol className="divide-y divide-rule border-y border-rule">{h.data?.data.map((r) => (
            <li key={r.id} className="py-2 text-sm"><span className="font-medium">{r.employeeName}</span> <span className="text-muted">from {new Date(r.assignedAt).toLocaleDateString()}{r.returnedAt ? ` to ${new Date(r.returnedAt).toLocaleDateString()}` : ' until now'}</span>{r.condition && r.condition !== 'good' && <span className="ml-2"><StatusPill tone="late">{label(r.condition)}</StatusPill></span>}{(r.assignNote || r.returnNote) && <span className="block text-xs text-muted">{[r.assignNote, r.returnNote].filter(Boolean).join(' · ')}</span>}</li>))}</ol>
        )}
      </PageBody>
      <Modal open={assigning} onOpenChange={setAssigning} title="Give to someone" footer={<><Button onClick={() => setAssigning(false)}>Cancel</Button><Button variant="primary" disabled={!who} loading={act.isPending} onClick={() => act.mutate({ path: 'assign', body: { employeeId: who, ...(note ? { note } : {}) } })}>Give</Button></>}>
        <div className="space-y-3"><Field label="Employee" required>{(i) => <RefPicker id={i} entity="employees" value={who} onChange={setWho} />}</Field><Field label="Note">{(i) => <Textarea id={i} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}</Field></div>
      </Modal>
      <Modal open={returning} onOpenChange={setReturning} title="Take back" footer={<><Button onClick={() => setReturning(false)}>Cancel</Button><Button variant="primary" loading={act.isPending} onClick={() => act.mutate({ path: 'return', body: { condition, ...(note ? { note } : {}) } })}>Take back</Button></>}>
        <div className="space-y-3"><Field label="Condition">{(i) => <Select id={i} value={condition} onChange={(e) => setCondition(e.target.value)}><option value="good">Good, back in stock</option><option value="needs_repair">Needs repair</option><option value="lost">Lost or beyond repair (retire it)</option></Select>}</Field><Field label="Note">{(i) => <Textarea id={i} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}</Field></div>
        {condition === 'lost' && <Banner tone="warn">A retired asset cannot be assigned or edited again.</Banner>}
      </Modal>
    </>
  );
}

interface Mine { id: string; code: string; name: string; category: string; serial: string | null; assignedAt: string }
export function MyAssets() {
  const q = useQuery({ queryKey: ['my-assets'], queryFn: () => api<{ data: Mine[] }>('/v1/helpdesk/my-assets') });
  const cols: DataColumn<Mine>[] = [
    { key: 'name', header: 'Item', cell: (r) => <><span className="font-medium">{r.name}</span><span className="ml-2 text-xs text-muted">{r.code}</span></> },
    { key: 'cat', header: 'Kind', cell: (r) => label(r.category) },
    { key: 'sn', header: 'Serial', cell: (r) => r.serial ?? '–' },
    { key: 'since', header: 'With you since', numeric: true, cell: (r) => new Date(r.assignedAt).toLocaleDateString() },
  ];
  return (
    <>
      <PageHeader title="My assets" scope="Help desk" description="Equipment the company has given you. Return it when you leave, or raise a request if it needs repair." />
      <PageBody wide={false}><DataTable caption="My assets" columns={cols} rows={q.data?.data ?? []} rowKey={(r) => r.id} loading={q.isLoading} empty={<EmptyState title="Nothing issued to you" />} /></PageBody>
    </>
  );
}

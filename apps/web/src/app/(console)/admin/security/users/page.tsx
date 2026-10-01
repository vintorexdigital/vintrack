'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, DataTable, EmptyState, Field, Input, Modal, PageBody, PageHeader, StatusPill, TabsView, useToast, type DataColumn } from '@trackrex/ui';
import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { api, ApiError } from '@/shared/api/client';
import { useCan } from '@/shared/auth/auth';

interface Member { id: string; name: string; email: string | null; mobile: string | null; roleKeys: string[]; status: string; isOwner: boolean; employeeId: string | null; lastLoginAt: string | null }
interface Invitation { id: string; email: string | null; mobile: string | null; roleKeys: string[]; status: string; expiresAt: string }
interface RoleInfo { key: string; name: string }

export default function UsersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const canInvite = useCan('company.users.invite');
  const members = useQuery({ queryKey: ['members'], queryFn: () => api<Member[]>('/v1/company/members') });
  const invites = useQuery({ queryKey: ['invitations'], queryFn: () => api<Invitation[]>('/v1/company/invitations') });
  const roles = useQuery({ queryKey: ['role-catalogue'], queryFn: () => api<RoleInfo[]>('/v1/company/roles') });
  const customRoles = useQuery({ queryKey: ['roles-custom'], queryFn: () => api<{ key: string; name: string; system: boolean }[]>('/v1/roles').then((r) => r.filter((x) => !x.system)), retry: false });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ email: '', mobile: '', name: '', role: 'employee' });
  const [error, setError] = useState<string>();
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['members'] }); void qc.invalidateQueries({ queryKey: ['invitations'] }); };
  const fail = (e: unknown) => toast('error', e instanceof ApiError ? e.message : 'Something went wrong.');
  const invite = useMutation({
    mutationFn: () => api<{ devToken?: string }>('/v1/company/invitations', { method: 'POST', body: { ...(f.email ? { email: f.email } : {}), ...(!f.email && f.mobile ? { mobile: f.mobile } : {}), ...(f.name ? { name: f.name } : {}), roleKeys: [f.role] } }),
    onSuccess: () => { setOpen(false); setF({ email: '', mobile: '', name: '', role: 'employee' }); refresh(); toast('success', 'Invitation sent. It works for 7 days.'); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not send the invitation.'),
  });
  const patch = useMutation({ mutationFn: (v: { id: string; body: unknown }) => api(`/v1/company/members/${v.id}`, { method: 'PATCH', body: v.body }), onSuccess: refresh, onError: fail });
  const revoke = useMutation({ mutationFn: (id: string) => api(`/v1/company/invitations/${id}`, { method: 'DELETE' }), onSuccess: refresh, onError: fail });
  const allRoles = [...(roles.data ?? []), ...(customRoles.data ?? [])];

  const mcols: DataColumn<Member>[] = [
    { key: 'name', header: 'Name', cell: (m) => <span className="font-medium">{m.name}{m.isOwner && <span className="ml-2"><StatusPill tone="holiday">Owner</StatusPill></span>}</span> },
    { key: 'contact', header: 'Email or mobile', cell: (m) => m.email ?? m.mobile ?? '–' },
    { key: 'roles', header: 'Role', cell: (m) => m.isOwner || !canInvite ? m.roleKeys.join(', ') : (
      <select aria-label={`Role for ${m.name}`} className="min-h-9 rounded-input border border-rule bg-surface px-2 text-sm" value={m.roleKeys[0]} onChange={(e) => patch.mutate({ id: m.id, body: { roleKeys: [e.target.value] } })}>{allRoles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select>
    ) },
    { key: 'status', header: 'Status', cell: (m) => <StatusPill tone={m.status === 'active' ? 'present' : 'absent'}>{m.status}</StatusPill> },
    { key: 'last', header: 'Last sign-in', numeric: true, cell: (m) => (m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleDateString() : 'Never') },
    ...(canInvite ? [{ key: 'act', header: '', card: false, cell: (m: Member) => !m.isOwner && <Button size="sm" variant="ghost" onClick={() => patch.mutate({ id: m.id, body: { status: m.status === 'active' ? 'suspended' : 'active' } })}>{m.status === 'active' ? 'Suspend' : 'Restore'}</Button> } satisfies DataColumn<Member>] : []),
  ];
  const icols: DataColumn<Invitation>[] = [
    { key: 'to', header: 'Invited', cell: (i) => i.email ?? i.mobile ?? '' },
    { key: 'roles', header: 'Role', cell: (i) => i.roleKeys.join(', ') },
    { key: 'status', header: 'Status', cell: (i) => <StatusPill tone={i.status === 'pending' ? 'pending' : i.status === 'accepted' ? 'present' : 'non-working'}>{i.status}</StatusPill> },
    { key: 'exp', header: 'Expires', numeric: true, cell: (i) => new Date(i.expiresAt).toLocaleDateString() },
    ...(canInvite ? [{ key: 'act', header: '', card: false, cell: (i: Invitation) => i.status === 'pending' && <Button size="sm" variant="ghost" onClick={() => revoke.mutate(i.id)}>Revoke</Button> } satisfies DataColumn<Invitation>] : []),
  ];

  return (
    <>
      <PageHeader title="Users and invitations" scope="Admin · Security" description="People who can sign in to this company. Employees are invited from their record; use this page for admins, HR and external users." primary={canInvite ? <Button variant="primary" icon={<UserPlus className="size-4" aria-hidden />} onClick={() => setOpen(true)}>Invite user</Button> : undefined} />
      <PageBody>
        <TabsView tabs={[
          { value: 'users', label: `Users${members.data ? ` (${members.data.length})` : ''}`, content: <DataTable caption="Users" columns={mcols} rows={members.data ?? []} rowKey={(m) => m.id} loading={members.isLoading} empty={<EmptyState title="No users yet" />} /> },
          { value: 'invites', label: `Invitations${invites.data ? ` (${invites.data.filter((i) => i.status === 'pending').length})` : ''}`, content: <DataTable caption="Invitations" columns={icols} rows={invites.data ?? []} rowKey={(i) => i.id} loading={invites.isLoading} empty={<EmptyState title="No invitations" hint="Invite people to give them a login." />} /> },
        ]} />
      </PageBody>
      <Modal open={open} onOpenChange={setOpen} title="Invite a user" description="They get a link that works for 7 days." footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={invite.isPending} disabled={!f.email && !f.mobile} onClick={() => { setError(undefined); invite.mutate(); }}>Send invitation</Button></>}>
        <div className="space-y-4">
          <Field label="Email" error={error}>{(id, d) => <Input id={id} aria-describedby={d} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />}</Field>
          <Field label="Or mobile number" help="Use international format, like +919876543210.">{(id, d) => <Input id={id} aria-describedby={d} type="tel" value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} />}</Field>
          <Field label="Name">{(id) => <Input id={id} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />}</Field>
          <Field label="Role">{(id) => <select id={id} className="min-h-11 w-full rounded-input border border-rule bg-surface px-3 text-sm md:min-h-9" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{allRoles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select>}</Field>
        </div>
      </Modal>
    </>
  );
}

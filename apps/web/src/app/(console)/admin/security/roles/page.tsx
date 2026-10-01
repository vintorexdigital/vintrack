'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, Field, Input, PageBody, PageHeader, Skeleton, StatusPill, useToast } from '@trackrex/ui';
import { Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { api, ApiError } from '@/shared/api/client';
import { useCan } from '@/shared/auth/auth';

interface Perm { key: string; module: string; resource: string; action: string; description: string; scopeable: boolean }
interface Role { key: string; name: string; description: string | null; system: boolean; grants: { permission: string; scope: string }[] }
const SCOPES = [['all', 'Everyone'], ['department', 'Same department'], ['location', 'Same location'], ['team', 'Own teams'], ['reportees', 'Reporting line'], ['direct', 'Direct reportees'], ['self', 'Only themselves']];

export default function RolesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const canManage = useCan('company.roles.manage');
  const perms = useQuery({ queryKey: ['permissions'], queryFn: () => api<Perm[]>('/v1/permissions') });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api<Role[]>('/v1/roles') });
  const [selected, setSelected] = useState<string>('manager');
  const [draft, setDraft] = useState<{ key: string; name: string; description: string; grants: Record<string, string> } | null>(null);
  const role = roles.data?.find((r) => r.key === selected);
  const grants = useMemo(() => Object.fromEntries((role?.grants ?? []).map((g) => [g.permission, g.scope])), [role]);
  const effective = draft ? draft.grants : grants;
  const byModule = useMemo(() => { const m = new Map<string, Perm[]>(); for (const p of perms.data ?? []) m.set(p.module, [...(m.get(p.module) ?? []), p]); return [...m]; }, [perms.data]);
  const fail = (e: unknown) => toast('error', e instanceof ApiError ? e.message : 'Could not save the role.');
  const save = useMutation({
    mutationFn: async () => {
      const g = Object.entries(draft!.grants).filter(([, s]) => s).map(([permission, scope]) => ({ permission, scope }));
      if (roles.data?.some((r) => r.key === draft!.key)) return api(`/v1/roles/${draft!.key}`, { method: 'PATCH', body: { name: draft!.name, description: draft!.description, grants: g } });
      return api('/v1/roles', { method: 'POST', body: { key: draft!.key, name: draft!.name, description: draft!.description, grants: g } });
    },
    onSuccess: () => { toast('success', 'Role saved. It applies immediately.'); setSelected(draft!.key); setDraft(null); void qc.invalidateQueries({ queryKey: ['roles'] }); },
    onError: fail,
  });
  const remove = useMutation({ mutationFn: () => api(`/v1/roles/${selected}`, { method: 'DELETE' }), onSuccess: () => { setSelected('manager'); void qc.invalidateQueries({ queryKey: ['roles'] }); }, onError: fail });

  return (
    <>
      <PageHeader title="Roles and permissions" scope="Admin · Security" description="Built-in roles cannot be edited. Create a custom role to give someone exactly the access they need, with a data scope per permission." primary={canManage ? <Button variant="primary" icon={<Plus className="size-4" aria-hidden />} onClick={() => setDraft({ key: '', name: '', description: '', grants: { ...grants } })}>New role from {role?.name ?? 'selection'}</Button> : undefined} />
      <PageBody>
        {roles.isLoading ? <Skeleton className="h-64" /> : !roles.data ? <EmptyState title="You cannot view roles" hint="You need the roles permission." /> : (
          <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
            <ul className="space-y-0.5" aria-label="Roles">
              {roles.data.map((r) => <li key={r.key}><button type="button" onClick={() => { setSelected(r.key); setDraft(null); }} aria-current={selected === r.key && !draft ? 'true' : undefined} className={`flex min-h-10 w-full items-center justify-between rounded-input px-3 text-left text-sm hover:bg-canvas ${selected === r.key && !draft ? 'bg-canvas font-semibold text-brand' : ''}`}>{r.name}{!r.system && <StatusPill tone="pending">Custom</StatusPill>}</button></li>)}
            </ul>
            <div className="min-w-0 space-y-4">
              {draft ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Key" required help="Lowercase letters, numbers, underscores.">{(id, d) => <Input id={id} aria-describedby={d} value={draft.key} onChange={(e) => setDraft({ ...draft, key: e.target.value })} />}</Field>
                  <Field label="Name" required>{(id) => <Input id={id} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}</Field>
                  <Field label="Description">{(id) => <Input id={id} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />}</Field>
                </div>
              ) : role && <div><h2 className="text-section font-semibold">{role.name}</h2><p className="text-sm text-muted">{role.description}</p>{role.system && <p className="mt-1 text-xs text-muted">Built-in role. Use “New role from {role.name}” to customise a copy.</p>}</div>}
              <div className="space-y-5">
                {byModule.map(([m, list]) => (
                  <section key={m}>
                    <h3 className="mb-1 text-sm font-semibold capitalize">{m}</h3>
                    <ul className="divide-y divide-rule border-y border-rule bg-surface">
                      {list.map((p) => (
                        <li key={p.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-sm">
                          <span className="min-w-0"><span className="block">{p.description}</span><span className="text-xs text-muted">{p.key}</span></span>
                          {draft ? (
                            <select aria-label={`Access for ${p.key}`} className="min-h-9 rounded-input border border-rule bg-surface px-2 text-sm" value={draft.grants[p.key] ?? ''} onChange={(e) => setDraft({ ...draft, grants: { ...draft.grants, [p.key]: e.target.value } })}>
                              <option value="">No access</option>{(p.scopeable ? SCOPES : SCOPES.slice(0, 1)).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                            </select>
                          ) : <span className="text-xs tabular-nums text-muted">{SCOPES.find(([v]) => v === effective[p.key])?.[1] ?? 'No access'}</span>}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
              {draft && <div className="sticky bottom-0 flex justify-end gap-2 border-t border-rule bg-canvas py-3"><Button onClick={() => setDraft(null)}>Cancel</Button><Button variant="primary" loading={save.isPending} disabled={!draft.key || !draft.name} onClick={() => save.mutate()}>Save role</Button></div>}
              {!draft && role && !role.system && canManage && <div className="flex gap-2"><Button onClick={() => setDraft({ key: role.key, name: role.name, description: role.description ?? '', grants: { ...grants } })}>Edit role</Button><Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>Delete role</Button></div>}
            </div>
          </div>
        )}
      </PageBody>
    </>
  );
}

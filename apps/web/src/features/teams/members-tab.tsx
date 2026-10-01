'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, useToast } from '@trackrex/ui';
import { useState } from 'react';
import { api, ApiError } from '@/shared/api/client';
import { RefPicker } from '@/shared/crud/fields';

interface Member { employeeId: string; displayName: string; code: string; role: string }

export function TeamMembersTab({ teamId }: { teamId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [pick, setPick] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['team-members', teamId], queryFn: () => api<Member[]>(`/v1/org/teams/${teamId}/members`) });
  const add = useMutation({ mutationFn: () => api(`/v1/org/teams/${teamId}/members`, { method: 'POST', body: { employeeId: pick } }), onSuccess: () => { setPick(null); void qc.invalidateQueries({ queryKey: ['team-members', teamId] }); }, onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Could not add.') });
  const remove = useMutation({ mutationFn: (id: string) => api(`/v1/org/teams/${teamId}/members/${id}`, { method: 'DELETE' }), onSuccess: () => void qc.invalidateQueries({ queryKey: ['team-members', teamId] }) });
  return (
    <div className="space-y-4">
      <div className="flex max-w-xl items-end gap-2">
        <div className="flex-1"><RefPicker entity="employees" value={pick} onChange={setPick} placeholder="Add an employee to this team" /></div>
        <Button variant="primary" disabled={!pick} loading={add.isPending} onClick={() => add.mutate()}>Add member</Button>
      </div>
      {q.data?.length === 0 ? <EmptyState title="No members yet" hint="Add employees to give this team's lead visibility over their data." /> : (
        <ul className="divide-y divide-rule border-y border-rule">
          {q.data?.map((m) => (
            <li key={m.employeeId} className="flex min-h-11 items-center justify-between gap-2 px-1"><span>{m.displayName} <span className="text-xs text-muted tabular-nums">{m.code}</span></span><Button size="sm" variant="ghost" onClick={() => remove.mutate(m.employeeId)}>Remove</Button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, Field, Input, useToast } from '@trackrex/ui';
import { useState } from 'react';
import { api, ApiError } from '@/shared/api/client';
import { RefPicker } from '@/shared/crud/fields';

interface Assigned { assignmentId: string; employeeId: string; code: string; displayName: string; effectiveFrom: string; effectiveTo: string | null }

export function ShiftEmployeesTab({ shiftId }: { shiftId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [emp, setEmp] = useState<string | null>(null);
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const key = ['shift-employees', shiftId];
  const q = useQuery({ queryKey: key, queryFn: () => api<Assigned[]>(`/v1/time/shifts/${shiftId}/employees`) });
  const add = useMutation({ mutationFn: () => api(`/v1/time/shifts/${shiftId}/assignments`, { method: 'POST', body: { employeeIds: [emp], effectiveFrom: from } }), onSuccess: () => { setEmp(null); void qc.invalidateQueries({ queryKey: key }); }, onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Could not assign.') });
  const remove = useMutation({ mutationFn: (id: string) => api(`/v1/time/shifts/${shiftId}/assignments/${id}`, { method: 'DELETE' }), onSuccess: () => void qc.invalidateQueries({ queryKey: key }) });
  return (
    <div className="space-y-4">
      <div className="grid max-w-2xl gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
        <Field label="Employee">{(id) => <RefPicker id={id} entity="employees" value={emp} onChange={setEmp} placeholder="Add an employee to this shift" />}</Field>
        <Field label="Effective from">{(id) => <Input id={id} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
        <Button variant="primary" disabled={!emp} loading={add.isPending} onClick={() => add.mutate()}>Assign</Button>
      </div>
      <p className="text-xs text-muted">Assigning ends the employee&apos;s previous shift the day before, so history is kept.</p>
      {q.data?.length === 0 ? <EmptyState title="Nobody is on this shift" hint="Assign employees so their punches use these rules." /> : (
        <ul className="divide-y divide-rule border-y border-rule">
          {q.data?.map((m) => (
            <li key={m.assignmentId} className="flex min-h-11 items-center justify-between gap-2 px-1"><span>{m.displayName} <span className="text-xs text-muted tabular-nums">{m.code} · from {m.effectiveFrom}</span></span><Button size="sm" variant="ghost" onClick={() => remove.mutate(m.assignmentId)}>Remove</Button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

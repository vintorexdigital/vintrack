'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Drawer, Field, Input, Select, Skeleton, useToast } from '@trackrex/ui';
import { useState } from 'react';
import { ATTENDANCE_CODES, type AttendanceCode } from '@trackrex/rules';
import { api, ApiError } from '@/shared/api/client';
import { useCan } from '@/shared/auth/auth';
import { CodeCell } from './code-cell';

interface DayDetail {
  day: { statusCode: string; secondaryCode: string | null; workedMinutes: number; breakMinutes: number; lateMinutes: number; earlyOutMinutes: number; overtimeMinutes: number; explanation: string[]; lateMark: boolean; deductionUnits: number; overrideCode: string | null; locked: boolean; firstIn: string | null; lastOut: string | null };
  punches: { id: string; type: string; at: string; source: string; latitude: number | null; longitude: number | null; address: string | null; comment: string | null; mockLocation: boolean; offline: boolean; selfieKey: string | null }[];
  breaks: { id: string; startedAt: string; endedAt: string | null; name: string | null }[];
  override: { reason: string; at: string } | null;
}

const hm = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
const time = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '–');

/** Everything behind one register cell: punches, break time, the policy's explanation and the override action. */
export function DayDrawer({ employee, date, onClose }: { employee: { id: string; name: string } | null; date: string | null; onClose: () => void }) {
  const open = !!employee && !!date;
  const qc = useQueryClient();
  const toast = useToast();
  const canOverride = useCan('attendance.day.override');
  const [code, setCode] = useState('P');
  const [reason, setReason] = useState('');
  const key = ['day', employee?.id, date];
  const q = useQuery({ queryKey: key, queryFn: () => api<DayDetail>(`/v1/attendance/days/${employee!.id}/${date}`), enabled: open });
  const refresh = () => { void qc.invalidateQueries({ queryKey: key }); void qc.invalidateQueries({ queryKey: ['register'] }); };
  const fail = (e: unknown) => toast('error', e instanceof ApiError ? e.message : 'Could not change the day.');
  const set = useMutation({ mutationFn: () => api(`/v1/attendance/days/${employee!.id}/${date}/override`, { method: 'PUT', body: { code, reason } }), onSuccess: () => { setReason(''); refresh(); toast('success', 'Day overridden.'); }, onError: fail });
  const clear = useMutation({ mutationFn: () => api(`/v1/attendance/days/${employee!.id}/${date}/override`, { method: 'DELETE' }), onSuccess: () => { refresh(); toast('success', 'Override removed.'); }, onError: fail });
  const d = q.data?.day;
  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()} title={employee?.name ?? ''} description={date ? new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : ''} width="lg">
      {q.isLoading || !d ? <div className="space-y-3"><Skeleton className="h-8 w-40" /><Skeleton className="h-24" /></div> : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <CodeCell code={d.statusCode} secondary={d.secondaryCode ?? undefined} late={d.lateMark} deduction={d.deductionUnits > 0} overridden={!!d.overrideCode} className="h-9 min-w-12 text-sm" />
            <span className="text-sm">{ATTENDANCE_CODES[d.statusCode as AttendanceCode]?.title}</span>
            {d.locked && <span className="text-xs text-muted">Locked for payroll</span>}
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
            {[['First in', time(d.firstIn)], ['Last out', time(d.lastOut)], ['Worked', hm(d.workedMinutes)], ['Breaks', hm(d.breakMinutes)], ['Late by', d.lateMinutes ? `${d.lateMinutes} min` : '–'], ['Overtime', d.overtimeMinutes ? hm(d.overtimeMinutes) : '–']].map(([l, v]) => <div key={l}><dt className="text-xs text-muted">{l}</dt><dd className="font-medium tabular-nums">{v}</dd></div>)}
          </dl>
          {d.explanation.length > 0 && <section><h3 className="mb-1 text-sm font-semibold">Why this status</h3><ul className="list-disc space-y-1 pl-5 text-sm">{d.explanation.map((x) => <li key={x}>{x}</li>)}</ul></section>}
          <section>
            <h3 className="mb-2 text-sm font-semibold">Punches</h3>
            {q.data!.punches.length === 0 ? <p className="text-sm text-muted">No punches this day.</p> : (
              <ul className="divide-y divide-rule border-y border-rule text-sm">
                {q.data!.punches.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2">
                    <span className="w-10 font-semibold uppercase">{p.type}</span><span className="tabular-nums">{time(p.at)}</span><span className="text-muted">{p.source}{p.offline ? ' · offline' : ''}{p.mockLocation ? ' · mock location' : ''}</span>
                    {p.latitude !== null && <a href={`https://www.openstreetmap.org/?mlat=${p.latitude}&mlon=${p.longitude}#map=17/${p.latitude}/${p.longitude}`} target="_blank" rel="noreferrer" className="text-xs">{p.address ?? 'View on map'}</a>}
                    {p.comment && <span className="w-full text-xs text-muted">“{p.comment}”</span>}
                  </li>
                ))}
              </ul>
            )}
            {q.data!.breaks.length > 0 && <ul className="mt-2 text-xs text-muted">{q.data!.breaks.map((b) => <li key={b.id}>{b.name ?? 'Break'}: {time(b.startedAt)} to {time(b.endedAt)}</li>)}</ul>}
          </section>
          {canOverride && !d.locked && (
            <section className="space-y-3 border-t border-rule pt-4">
              <h3 className="text-sm font-semibold">Override this day</h3>
              {q.data!.override && <p className="rounded-input bg-soft px-3 py-2 text-xs">Overridden: {q.data!.override.reason}</p>}
              <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
                <Field label="Set to">{(id) => <Select id={id} value={code} onChange={(e) => setCode(e.target.value)}><option value="P">Present</option><option value="HP">Half-day present</option><option value="AB">Absent</option><option value="ONW">Non-working day</option><option value="OH">Holiday</option></Select>}</Field>
                <Field label="Reason" required>{(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being changed?" />}</Field>
              </div>
              <div className="flex gap-2"><Button variant="primary" disabled={reason.trim().length < 3} loading={set.isPending} onClick={() => set.mutate()}>Apply override</Button>{d.overrideCode && <Button loading={clear.isPending} onClick={() => clear.mutate()}>Remove override</Button>}</div>
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}

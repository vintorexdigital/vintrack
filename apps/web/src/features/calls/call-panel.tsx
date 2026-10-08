'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banner, Button, EmptyState, Input, Modal, Skeleton, StatusPill, useToast } from '@trackrex/ui';
import { Phone, PhoneOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, ApiError } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/auth';

export interface CallSession {
  id: string; employeeName: string | null; customerNumber: string; status: string; provider: string; startedAt: string; answeredAt: string | null; endedAt: string | null;
  durationSeconds: number; hasRecording: boolean; recordingSeconds: number | null; recordingRemoved: boolean;
}
interface CallStatus { enabled: boolean; provider: string; mock: boolean; recordCalls: boolean; announceRecording: boolean }

const LIVE = new Set(['queued', 'ringing_agent', 'ringing_customer', 'in_progress']);
const LABEL: Record<string, string> = { queued: 'Starting', ringing_agent: 'Ringing your phone', ringing_customer: 'Ringing the customer', in_progress: 'On the call', completed: 'Completed', no_answer: 'No answer', busy: 'Busy', failed: 'Failed' };
const tone = (s: string) => (s === 'completed' ? 'present' : s === 'failed' || s === 'busy' || s === 'no_answer' ? 'absent' : 'pending') as 'present' | 'absent' | 'pending';
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export const useCallStatus = () => useQuery({ queryKey: ['call-status'], queryFn: () => api<CallStatus>('/v1/calls/status'), staleTime: 60_000 });

/** Plays a recording through the API (the audio needs the sign-in token, so an <audio src> alone would not work). Each play is audited. */
export function RecordingPlayer({ sessionId }: { sessionId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const load = async () => {
    try { const res = await api<Response>(`/v1/calls/sessions/${sessionId}/recording`, { raw: true }); setUrl(URL.createObjectURL(await res.blob())); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not load the recording.'); }
  };
  if (url) return <audio controls autoPlay src={url} className="h-9 w-full max-w-xs" />;
  return <span className="inline-flex items-center gap-2"><Button size="sm" onClick={() => void load()}>Play recording</Button>{err && <span role="alert" className="text-xs text-absent">{err}</span>}</span>;
}

function SessionRow({ s, mock, onChanged }: { s: CallSession; mock: boolean; onChanged: () => void }) {
  const toast = useToast();
  const step = useMutation({
    mutationFn: (body: Record<string, unknown>) => api(`/v1/calls/sessions/${s.id}/mock-progress`, { method: 'POST', body }),
    onSuccess: onChanged, onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Could not update the call.'),
  });
  const hangup = useMutation({ mutationFn: () => api(`/v1/calls/sessions/${s.id}/hangup`, { method: 'POST', body: {} }), onSuccess: onChanged });
  return (
    <li className="space-y-2 rounded-card border border-rule p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <StatusPill tone={tone(s.status)}>{LABEL[s.status] ?? s.status}</StatusPill>
        <span className="tabular-nums">{s.customerNumber}</span>
        <span className="text-xs text-muted">{s.employeeName ?? ''} · {new Date(s.startedAt).toLocaleString()}{s.durationSeconds > 0 ? ` · ${mmss(s.durationSeconds)}` : ''}</span>
        {s.provider.startsWith('mock') && <span className="rounded-pill bg-pending-tint px-2 py-0.5 text-xs">Mock: no real call</span>}
      </div>
      {LIVE.has(s.status) && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<PhoneOff className="size-4" aria-hidden />} loading={hangup.isPending} onClick={() => hangup.mutate()}>End call</Button>
          {mock && s.status === 'ringing_agent' && <Button size="sm" onClick={() => step.mutate({ event: 'agent_answered' })}>Simulate: you answer</Button>}
          {mock && s.status === 'ringing_customer' && <><Button size="sm" onClick={() => step.mutate({ event: 'customer_answered' })}>Simulate: customer answers</Button><Button size="sm" onClick={() => step.mutate({ event: 'no_answer' })}>Simulate: no answer</Button></>}
          {mock && s.status === 'in_progress' && <Button size="sm" onClick={() => step.mutate({ event: 'ended', durationSeconds: 95, recording: true })}>Simulate: call ends (95 s)</Button>}
        </div>
      )}
      {s.hasRecording && <RecordingPlayer sessionId={s.id} />}
      {s.recordingRemoved && <p className="text-xs text-muted">The recording was removed after the retention period.</p>}
    </li>
  );
}

/** Calls to one customer or lead, with a button to place a new one. */
export function CallPanel({ customerId, leadId, phone }: { customerId?: string; leadId?: string; phone?: string | null }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { can } = useAuth();
  const status = useCallStatus();
  const key = ['call-sessions', customerId ?? '', leadId ?? ''];
  const q = useQuery({ queryKey: key, refetchInterval: (query) => ((query.state.data as { data: CallSession[] } | undefined)?.data.some((s) => LIVE.has(s.status)) ? 3000 : 30_000), queryFn: () => api<{ data: CallSession[] }>('/v1/calls/sessions', { query: { ...(customerId ? { customerId } : {}), ...(leadId ? { leadId } : {}), limit: 20 } }) });
  const dial = useMutation({
    mutationFn: () => api('/v1/calls/dial', { method: 'POST', body: { ...(customerId ? { customerId } : {}), ...(leadId ? { leadId } : {}), ...(!customerId && !leadId && phone ? { phone } : {}) } }),
    onSuccess: () => { toast('success', 'Calling you first, then the customer.'); void qc.invalidateQueries({ queryKey: key }); },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Could not place the call.'),
  });
  if (status.isLoading) return <Skeleton className="h-24" />;
  if (!status.data?.enabled) return <EmptyState title="Cloud calling is off" hint="An admin can turn it on in Settings, under Calls." />;
  const live = q.data?.data.some((s) => LIVE.has(s.status));
  return (
    <div className="space-y-3">
      {status.data.mock && <Banner tone="warn">Calling is in mock mode: no phone rings and recordings are synthetic tones. Use the “Simulate” buttons to move a call along.</Banner>}
      {status.data.recordCalls && <p className="text-xs text-muted">Calls are recorded{status.data.announceRecording ? ' and the customer hears an announcement' : ''}. Recordings are kept for the period your company set and every listen is logged.</p>}
      {can('calls.call.create') && <Button variant="primary" icon={<Phone className="size-4" aria-hidden />} loading={dial.isPending} disabled={!!live} onClick={() => dial.mutate()}>Call</Button>}
      {q.data?.data.length === 0 ? <EmptyState title="No calls yet" /> : <ul className="space-y-3">{q.data?.data.map((s) => <SessionRow key={s.id} s={s} mock={status.data!.mock} onChanged={() => void qc.invalidateQueries({ queryKey: key })} />)}</ul>}
    </div>
  );
}

/** Header action on the call log: call any number. */
export function PlaceCallButton() {
  const { can } = useAuth();
  const status = useCallStatus();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const qc = useQueryClient();
  const toast = useToast();
  const dial = useMutation({
    mutationFn: () => api('/v1/calls/dial', { method: 'POST', body: { phone } }),
    onSuccess: () => { toast('success', 'Calling you first, then the number.'); setOpen(false); setPhone(''); void qc.invalidateQueries({ queryKey: ['call-sessions'] }); },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Could not place the call.'),
  });
  if (!can('calls.call.create') || !status.data?.enabled) return null;
  return (
    <>
      <Button icon={<Phone className="size-4" aria-hidden />} onClick={() => setOpen(true)}>Place a call</Button>
      <Modal open={open} onOpenChange={setOpen} title="Place a call" description="We ring your own phone first, then connect the number you enter."
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" loading={dial.isPending} disabled={!/^\+\d{8,15}$/.test(phone)} onClick={() => dial.mutate()}>Call</Button></>}>
        <label className="block text-sm font-medium">Number to call<Input className="mt-1.5" type="tel" inputMode="tel" placeholder="+919876543210" value={phone} onChange={(e) => setPhone(e.target.value.trim())} /></label>
        {status.data.mock && <p className="mt-2 text-xs text-muted">Mock mode: no real call is placed.</p>}
      </Modal>
    </>
  );
}

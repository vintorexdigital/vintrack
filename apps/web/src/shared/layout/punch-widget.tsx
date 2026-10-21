'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, LiveDot, cn, useToast } from '@trackrex/ui';
import { Coffee, Fingerprint } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/auth';
import { useT } from '../i18n/i18n';

export interface PunchStatus {
  linked: boolean;
  state?: 'in' | 'out' | 'break';
  since?: string | null;
  shift?: { name: string; startTime: string; timezone: string; workingMinutes: number } | null;
  requirements?: { sourceAllowed: boolean; selfie: string; location: string; commentOnIn: boolean; commentOnOut: boolean } | null;
  openBreak?: { id: string; startedAt: string; name: string | null } | null;
  today?: { workedMinutes: number; breakMinutes: number; lateMinutes: number; statusCode: string } | null;
}

export const usePunchStatus = () => {
  const { can, me } = useAuth();
  return useQuery({
    queryKey: ['punch-status', me?.company.id],
    queryFn: () => api<PunchStatus>('/v1/attendance/status'),
    enabled: can('attendance.punch.create') && !!me?.membership.employeeId,
    refetchInterval: 60_000,
  });
};

export function fmtDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.abs(mins % 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function sinceText(iso?: string | null, now = Date.now()): string {
  if (!iso) return '';
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  return mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)} h ${mins % 60} min ago`;
}

export function position(): Promise<{ latitude: number; longitude: number; accuracy: number } | undefined> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(undefined);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(undefined),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30_000 },
    );
  });
}

/** Current punch state, time since the last punch, and one-click punching under the employee's shift rules. */
export function PunchWidget({ compact }: { compact?: boolean }) {
  const status = usePunchStatus();
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useT();
  const [, tick] = useState(0);
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(i); }, []);

  const punch = useMutation({
    mutationFn: async () => {
      const s = status.data;
      const needLocation = s?.requirements?.location === 'mandatory';
      let body: Record<string, unknown> = {};
      if (s?.requirements?.location !== 'off') {
        const pos = await position();
        if (!pos && needLocation) throw new ApiError(422, 'location_required', 'Turn on location in your browser to punch.');
        if (pos) body = pos;
      }
      let comment: string | undefined;
      const wantsComment = s?.state === 'in' ? s.requirements?.commentOnOut : s?.requirements?.commentOnIn;
      if (wantsComment) {
        comment = window.prompt('Add a comment to punch') ?? undefined;
        if (!comment) throw new ApiError(422, 'comment_required', 'A comment is needed to punch.');
      }
      return api('/v1/attendance/punches', { method: 'POST', body: { ...body, ...(comment ? { comment } : {}) } });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['punch-status'] }); void qc.invalidateQueries({ queryKey: ['home'] }); },
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Could not punch. Try again.'),
  });
  const brk = useMutation({
    mutationFn: () => (status.data?.state === 'break' ? api('/v1/attendance/breaks/end', { method: 'POST', body: {} }) : api('/v1/attendance/breaks/start', { method: 'POST', body: {} })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['punch-status'] }),
    onError: (e) => toast('error', e instanceof ApiError ? e.message : 'Could not change the break.'),
  });

  const s = status.data;
  if (!s?.linked) return null;
  const isIn = s.state === 'in' || s.state === 'break';
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Punch">
      <div className={cn('flex min-w-0 items-center gap-2 rounded-input bg-soft px-2.5 py-1.5', compact && 'hidden sm:flex')}>
        {isIn && <LiveDot />}
        <div className="min-w-0 leading-tight">
          <p className="truncate text-xs font-semibold text-ink">{s.state === 'break' ? t('status.onbreak') : isIn ? t('status.punchedin') : t('status.punchedout')}</p>
          <p className="truncate text-xs tabular-nums text-muted">{sinceText(s.since) || (s.shift ? `Shift ${s.shift.startTime}` : '')}</p>
        </div>
      </div>
      {isIn && (
        <Button size="sm" className="hidden sm:inline-flex" onClick={() => brk.mutate()} loading={brk.isPending} icon={<Coffee className="size-4" aria-hidden />}>
          {s.state === 'break' ? 'End break' : 'Break'}
        </Button>
      )}
      <Button variant={isIn ? 'secondary' : 'primary'} size="sm" onClick={() => punch.mutate()} loading={punch.isPending} disabled={s.requirements?.sourceAllowed === false} icon={<Fingerprint className="size-4" aria-hidden />}>
        {isIn ? t('action.punchout') : t('action.punchin')}
      </Button>
    </div>
  );
}

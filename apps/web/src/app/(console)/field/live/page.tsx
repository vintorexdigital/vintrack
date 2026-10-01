'use client';
import { useQuery } from '@tanstack/react-query';
import { Banner, EmptyState, Input, KpiBand, PageBody, PageHeader, StatusPill, cn } from '@trackrex/ui';
import { useMemo, useState } from 'react';
import { api } from '@/shared/api/client';
import { TrackMap, type MapMarker } from '@/shared/map/map';

interface Live { employeeId: string; code: string | null; name: string; at: string; latitude: number; longitude: number; battery: number | null; status: 'moving' | 'stopped' | 'stale' | 'off_duty' }
interface Trail { points: { at: string; lat: number; lng: number }[]; stops: { lat: number; lng: number; arrival: string; departure: string; minutes: number }[]; distanceMeters: number; travelMinutes: number; workingMinutes: number }
const TONE = { moving: 'present', stopped: 'late', stale: 'absent', off_duty: 'muted' } as const;
const WORDS = { moving: 'Moving', stopped: 'Stopped', stale: 'No signal', off_duty: 'Off duty' } as const;
const today = () => new Date().toISOString().slice(0, 10);
const ago = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ago`; };

export default function LiveMap() {
  const [selected, setSelected] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [q, setQ] = useState('');
  const live = useQuery({ queryKey: ['live'], queryFn: () => api<{ data: Live[]; asOf: string }>('/v1/location/live'), refetchInterval: 30_000 });
  const trail = useQuery({ queryKey: ['trail', selected, date], enabled: !!selected, queryFn: () => api<Trail>('/v1/location/trail', { query: { employeeId: selected!, date } }) });
  const rows = useMemo(() => (live.data?.data ?? []).filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase())), [live.data, q]);
  const markers: MapMarker[] = useMemo(() => (selected && trail.data?.points.length ? rows.filter((r) => r.employeeId === selected) : rows).map((r) => ({ id: r.employeeId, lat: r.latitude, lng: r.longitude, label: `${r.name} · ${WORDS[r.status]}`, tone: TONE[r.status], selected: r.employeeId === selected })), [rows, selected, trail.data]);
  const counts = useMemo(() => ({ moving: rows.filter((r) => r.status === 'moving').length, stopped: rows.filter((r) => r.status === 'stopped').length, off: rows.filter((r) => r.status === 'off_duty' || r.status === 'stale').length }), [rows]);
  const sel = rows.find((r) => r.employeeId === selected);
  const km = trail.data ? (trail.data.distanceMeters / 1000).toFixed(1) : '–';

  return (
    <>
      <PageHeader title="Live map" scope="Field" description="Positions are recorded only while an employee is punched in, and employees can always see when tracking is on." />
      <PageBody className="space-y-4">
        <KpiBand items={[{ label: 'Moving', value: String(counts.moving) }, { label: 'Stopped', value: String(counts.stopped) }, { label: 'Off duty or no signal', value: String(counts.off) }]} />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <div className="space-y-3">
            <Input aria-label="Search people" placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
            {live.isError && <Banner tone="error">Could not load positions.</Banner>}
            {!live.isLoading && rows.length === 0 ? <EmptyState title="Nobody is on the map" hint="People appear here after they punch in and their app reports a position." /> : (
              <ul className="max-h-[28rem] divide-y divide-rule overflow-auto rounded-card border border-rule" aria-label="People">
                {rows.map((r) => (
                  <li key={r.employeeId}>
                    <button type="button" aria-pressed={selected === r.employeeId} onClick={() => setSelected(selected === r.employeeId ? null : r.employeeId)} className={cn('flex min-h-12 w-full items-center justify-between gap-2 px-3 text-left hover:bg-canvas', selected === r.employeeId && 'bg-canvas')}>
                      <span><span className="block text-sm font-medium">{r.name}</span><span className="block text-xs text-muted">{ago(r.at)}{r.battery != null ? ` · ${r.battery}%` : ''}</span></span>
                      <StatusPill tone={r.status === 'moving' ? 'present' : r.status === 'stopped' ? 'late' : r.status === 'stale' ? 'absent' : 'non-working'}>{WORDS[r.status]}</StatusPill>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-3">
            {sel && (
              <div className="flex flex-wrap items-center gap-3 rounded-card border border-rule bg-surface p-3 text-sm">
                <span className="font-semibold">{sel.name}</span>
                <label className="flex items-center gap-2 text-xs text-muted">Day <Input type="date" aria-label="Trail day" className="h-8 w-40" value={date} max={today()} onChange={(e) => setDate(e.target.value || today())} /></label>
                {trail.isLoading ? <span className="text-xs text-muted">Loading trail…</span> : trail.data && (
                  <span className="text-xs tabular-nums text-muted">{km} km · {trail.data.stops.length} stops · travelling {trail.data.travelMinutes} min · working {Math.floor(trail.data.workingMinutes / 60)}h {trail.data.workingMinutes % 60}m</span>
                )}
                {trail.isError && <span className="text-xs text-absent">No trail for that day.</span>}
              </div>
            )}
            <TrackMap label="Map of employee positions" className="h-[28rem] w-full rounded-card border border-rule" markers={markers}
              line={selected ? trail.data?.points : undefined} stops={selected ? trail.data?.stops.map((s) => ({ lat: s.lat, lng: s.lng, label: `${s.minutes} min stop from ${new Date(s.arrival).toLocaleTimeString()}` })) : undefined} onSelect={setSelected} />
          </div>
        </div>
      </PageBody>
    </>
  );
}

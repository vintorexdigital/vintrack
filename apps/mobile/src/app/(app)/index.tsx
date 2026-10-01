import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView } from 'react-native';
import { ApiError, punch, type PunchStatus } from '@/core';
import { currentPosition, watchWhileWorking } from '@/location';
import { useSession } from '@/session';
import { SelfieCapture } from '@/selfie';
import { SyncStatus } from '@/sync-status';
import { space, usePalette } from '@/theme';
import { Banner, Button, Card, Row, T } from '@/ui';
import { Crypto } from '@/ids';
import { deviceStore } from '@/storage-native';

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '–');
const hm = (m = 0) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;

export default function Today() {
  const s = useSession();
  const p = usePalette();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const status = useQuery({ queryKey: ['status'], queryFn: () => s.api.get<PunchStatus>('/v1/attendance/status'), refetchInterval: 60_000, retry: false });
  // Offline, the last state the server told us (kept on the phone), updated by what the person did, is the truth.
  const [cached, setCached] = useState<PunchStatus | null>(null);
  const [cacheRead, setCacheRead] = useState(false);
  useEffect(() => { void deviceStore.get('trk.status').then((v) => { if (v) setCached(JSON.parse(v) as PunchStatus); setCacheRead(true); }); }, []);
  useEffect(() => { if (status.data) void deviceStore.set('trk.status', JSON.stringify(status.data)); }, [status.data]);
  const [local, setLocal] = useState<'in' | 'out' | null>(null);
  const known = !!status.data || !!cached || (cacheRead && status.isError);
  const state: 'in' | 'out' | 'break' = local ?? status.data?.state ?? cached?.state ?? 'out';
  useEffect(() => { if (status.data?.state) setLocal(null); }, [status.data?.state]);

  // Foreground tracking while punched in and the company has tracking on.
  const working = state === 'in' && s.policy?.enabled === true;
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!working || !s.policy) return;
    let dead = false;
    void watchWhileWorking(s.policy.intervalSeconds, (pt) => { void s.pings.add({ at: pt.at, latitude: pt.latitude, longitude: pt.longitude, accuracy: pt.accuracy, speed: pt.speed, mock: pt.mock }, s.policy!); }).then((off) => { if (dead) off(); else stop.current = off; });
    return () => { dead = true; stop.current?.(); stop.current = null; };
  }, [working, s.policy, s.pings]);

  const [camera, setCamera] = useState(false);
  const doPunch = useCallback(async (selfie?: string) => {
    setBusy(true);
    try {
      const type = state === 'in' || state === 'break' ? 'out' : 'in';
      const position = await currentPosition();
      const ids = s.me?.user ? { tenantId: s.me.company.id, userId: s.me.user.id } : undefined;
      const out = await punch({ api: s.api, queue: s.queue, now: () => new Date(), newId: Crypto.randomUUID, blobs: s.blobs, ...(ids ? { ids } : {}) }, { type, position, ...(selfie ? { selfie } : {}) });
      setLocal(type);
      if (out.status === 'queued') setNote('Saved on this phone. It will be sent when you are back online.');
      else { setNote(out.result.warnings.includes('mock_location') ? 'Your location looks simulated. Your manager can see this.' : ''); void qc.invalidateQueries({ queryKey: ['status'] }); }
      if (type === 'out') { await s.pings.drainTo(s.queue); void s.sync(); }
    } catch (e) {
      Alert.alert('Could not punch', e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally { setBusy(false); }
  }, [s, state, qc]);

  const d = status.data ?? cached ?? undefined;
  const needsSelfie = d?.requirements?.selfie === 'mandatory';
  return (
    <ScrollView contentContainerStyle={{ padding: space.md, gap: space.md }} refreshControl={<RefreshControl refreshing={status.isFetching} onRefresh={() => void status.refetch()} />} style={{ backgroundColor: p.canvas }}>
      {d && !d.linked && <Banner tone="warn">Your account is not linked to an employee record, so you cannot punch. Ask your administrator.</Banner>}
      <Card>
        <T muted size={13}>{d?.shift ? `${d.shift.name} · starts ${d.shift.startTime}` : 'No shift today'}</T>
        <T size={28} bold>{!known ? 'Checking your status…' : state === 'in' ? 'Punched in' : state === 'break' ? 'On a break' : 'Not punched in'}</T>
        {d?.since && <T muted>since {fmt(d.since)}</T>}
        <Button title={state === 'in' || state === 'break' ? 'Punch out' : 'Punch in'} variant={state === 'in' ? 'danger' : 'primary'} loading={busy} disabled={!known || d?.linked === false} onPress={() => (needsSelfie ? setCamera(true) : void doPunch())} />
        {note ? <Banner>{note}</Banner> : null}
        {status.isError && <Banner tone="warn">Cannot reach the server. You can still punch; it will be sent later.</Banner>}
      </Card>
      {d?.today && (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}><T muted>Worked today</T><T bold>{hm(d.today.workedMinutes)}</T></Row>
          <Row style={{ justifyContent: 'space-between' }}><T muted>Breaks</T><T>{hm(d.today.breakMinutes)}</T></Row>
          {d.today.lateMinutes > 0 && <Row style={{ justifyContent: 'space-between' }}><T muted>Late by</T><T style={{ color: p.late }}>{d.today.lateMinutes} min</T></Row>}
        </Card>
      )}
      {s.policy && (
        <Card>
          <T bold>Location</T>
          <T muted size={14}>{s.policy.enabled ? `Your position is recorded about every ${Math.round(s.policy.intervalSeconds / 60) || 1} min, only while you are punched in. Keep the app open.` : 'Your company has location tracking switched off.'}</T>
          {working && <T size={14} style={{ color: p.present }}>● Tracking is on</T>}
        </Card>
      )}
      <SyncStatus />
      <SelfieCapture visible={camera} onCancel={() => setCamera(false)} onCapture={(b64) => { setCamera(false); void doPunch(b64); }} />
    </ScrollView>
  );
}

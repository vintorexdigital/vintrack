import * as Crypto from 'expo-crypto';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { ApiClient, OfflineQueue, PingBuffer, fetchPolicy, type Company, type FlushResult, type Me, type SignInResponse, type TrackingPolicy } from './core';
import { deviceBlobs } from './blobs-native';
import { deviceStore } from './storage-native';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';
const newId = () => Crypto.randomUUID();

export type SignInResult = { status: 'ok' } | { status: 'choose_company'; selectionToken: string; companies: Company[] };

interface SessionState {
  status: 'loading' | 'anonymous' | 'authenticated';
  me: Me | null;
  api: ApiClient;
  queue: OfflineQueue;
  pings: PingBuffer;
  blobs: typeof deviceBlobs;
  policy: TrackingPolicy | null;
  /** Bumps whenever the queue changes, so screens re-render. */
  queueVersion: number;
  signIn(v: { tenant: string; identifier: string; password: string }): Promise<SignInResult>;
  selectCompany(selectionToken: string, tenantId: string): Promise<SignInResult>;
  signOut(): Promise<void>;
  sync(): Promise<FlushResult>;
}

const Ctx = createContext<SessionState | null>(null);
export const useSession = (): SessionState => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
};

export function SessionProvider({ children }: { children: ReactNode }) {
  const lostRef = useRef<() => void>(() => undefined);
  const parts = useMemo(() => {
    const api = new ApiClient({ baseUrl: API_URL, store: deviceStore, newId, onSessionLost: () => lostRef.current() });
    return { api, queue: new OfflineQueue(deviceStore, newId, () => new Date(), deviceBlobs), pings: new PingBuffer(deviceStore) };
  }, []);
  const [status, setStatus] = useState<SessionState['status']>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [policy, setPolicy] = useState<TrackingPolicy | null>(null);
  const [queueVersion, setQueueVersion] = useState(0);

  const loadMe = useCallback(async () => {
    const fresh = await parts.api.get<Me>('/v1/auth/me');
    await deviceStore.set('trk.me', JSON.stringify(fresh));
    setMe(fresh);
    setStatus('authenticated');
    void fetchPolicy(parts.api).then(setPolicy).catch(() => undefined);
  }, [parts]);

  lostRef.current = () => { setMe(null); setStatus('anonymous'); };

  useEffect(() => {
    const off = parts.queue.subscribe(() => setQueueVersion((n) => n + 1));
    void (async () => {
      await Promise.all([parts.queue.load(), parts.pings.load()]);
      try {
        if (await parts.api.restore()) await loadMe();
        else setStatus('anonymous');
      } catch {
        // No connection at launch but a stored session: open with the last known profile so the person can still
        // punch and work. The first request after the network returns refreshes the session by itself.
        const cached = await deviceStore.get('trk.me');
        if (cached && (await deviceStore.get('trk.refresh'))) { setMe(JSON.parse(cached) as Me); setStatus('authenticated'); }
        else setStatus('anonymous');
      }
    })();
    return off;
  }, [parts, loadMe]);

  const sync = useCallback(async () => {
    await parts.pings.drainTo(parts.queue);
    return parts.queue.flush(parts.api);
  }, [parts]);

  // Send what is waiting every 30 seconds and whenever the app comes to the front.
  useEffect(() => {
    if (status !== 'authenticated') return;
    const t = setInterval(() => void sync().catch(() => undefined), 30_000);
    const s = AppState.addEventListener('change', (st) => { if (st === 'active') void sync().catch(() => undefined); });
    void sync().catch(() => undefined);
    return () => { clearInterval(t); s.remove(); };
  }, [status, sync]);

  const finish = useCallback(async (res: SignInResponse): Promise<SignInResult> => {
    if (res.status === 'ok') {
      await parts.api.setSession({ accessToken: res.accessToken, refreshToken: res.refreshToken });
      await loadMe();
      return { status: 'ok' };
    }
    return { status: 'choose_company', selectionToken: res.selectionToken, companies: res.companies };
  }, [parts, loadMe]);

  const value = useMemo<SessionState>(() => ({
    status, me, policy, queueVersion, blobs: deviceBlobs, ...parts,
    signIn: async (v) => finish(await parts.api.post<SignInResponse>('/v1/auth/login', { identifier: v.identifier, password: v.password, tenant: v.tenant }, { auth: false })),
    selectCompany: async (selectionToken, tenantId) => finish(await parts.api.post<SignInResponse>('/v1/auth/select-company', { selectionToken, tenantId }, { auth: false })),
    signOut: async () => {
      await parts.api.post('/v1/auth/logout', { refreshToken: await deviceStore.get('trk.refresh') }).catch(() => undefined);
      await parts.api.clearSession();
      await deviceStore.remove('trk.me');
      setMe(null);
      setStatus('anonymous');
    },
    sync,
  }), [status, me, policy, queueVersion, parts, finish, sync]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

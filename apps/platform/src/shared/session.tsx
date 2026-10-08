'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@trackrex/ui';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, platformToken, refreshPlatform } from './api';

export interface Staff { id: string; name: string; email: string; role: string }
export type LoginStep =
  | { status: 'ok' }
  | { status: 'totp_required' }
  | { status: 'totp_setup'; setupToken: string; secret: string; otpauthUri: string };

interface Session {
  status: 'loading' | 'anonymous' | 'authenticated';
  staff: Staff | null;
  login: (email: string, password: string, totp?: string) => Promise<LoginStep>;
  enroll: (setupToken: string, code: string) => Promise<void>;
  logout: () => void;
  can: (...roles: string[]) => boolean;
}
const Ctx = createContext<Session | null>(null);
export const useSession = () => { const v = useContext(Ctx); if (!v) throw new Error('no session'); return v; };

export function PlatformProviders({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: false, retry: 1 } } }));
  const [status, setStatus] = useState<Session['status']>('loading');
  const [staff, setStaff] = useState<Staff | null>(null);
  const router = useRouter();
  const booted = useRef(false);

  const adopt = (r: { accessToken: string; user: Staff }) => { platformToken.set(r.accessToken); setStaff(r.user); setStatus('authenticated'); };

  useEffect(() => {
    platformToken.onLost(() => { platformToken.set(null); setStaff(null); setStatus('anonymous'); });
    if (booted.current) return;
    booted.current = true;
    (async () => {
      const t = await refreshPlatform();
      if (!t) return setStatus('anonymous');
      try { const me = await api<{ id: string; role: string }>('/platform/v1/auth/me'); setStaff({ id: me.id, role: me.role, name: 'Staff', email: '' }); setStatus('authenticated'); } catch { setStatus('anonymous'); }
    })();
  }, []);

  const value = useMemo<Session>(() => ({
    status, staff,
    login: async (email, password, totp) => {
      const r = await api<{ status: string; accessToken?: string; user?: Staff; setupToken?: string; secret?: string; otpauthUri?: string }>('/platform/v1/auth/login', { method: 'POST', body: { email, password, ...(totp ? { totp } : {}) } });
      if (r.status === 'ok') { adopt(r as never); return { status: 'ok' }; }
      return r as LoginStep;
    },
    enroll: async (setupToken, code) => {
      const r = await api<{ accessToken: string; user: Staff }>('/platform/v1/auth/totp/enroll', { method: 'POST', body: { code }, bearer: setupToken });
      adopt(r);
    },
    logout: () => { platformToken.set(null); setStaff(null); setStatus('anonymous'); router.replace('/sign-in'); },
    can: (...roles) => !!staff && (staff.role === 'super_admin' || roles.includes(staff.role)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [status, staff, router]);

  return <QueryClientProvider client={client}><ToastProvider><Ctx.Provider value={value}>{children}</Ctx.Provider></ToastProvider></QueryClientProvider>;
}

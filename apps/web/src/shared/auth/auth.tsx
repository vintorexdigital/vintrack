'use client';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, refreshSession, tokenStore } from '../api/client';

export interface Company { id: string; slug: string; name: string; status: string }
export interface Me {
  user: { id: string; name: string; email: string | null; mobile: string | null; locale: string } | null;
  company: Company & { plan: string; timezone: string; currency: string; locale: string; country: string; trialEndsAt: string | null; supportAccessEnabled: boolean };
  membership: { id: string; roleKeys: string[]; isOwner: boolean; employeeId: string | null };
  permissions: { permission: string; scope: string }[];
  modules: string[];
  companies: Company[];
  support?: { sessionId: string };
}

export type SignInResult =
  | { status: 'ok' }
  | { status: 'choose_company'; selectionToken: string; companies: Company[] };

interface AuthState {
  status: 'loading' | 'anonymous' | 'authenticated';
  me: Me | null;
  can: (permission: string) => boolean;
  scopeOf: (permission: string) => string | null;
  hasModule: (m: string) => boolean;
  signIn: (identifier: string, password: string, tenant?: string) => Promise<SignInResult>;
  requestOtp: (identifier: string) => Promise<{ devCode?: string }>;
  verifyOtp: (identifier: string, code: string, tenant?: string) => Promise<SignInResult>;
  selectCompany: (selectionToken: string, tenantId: string) => Promise<SignInResult>;
  acceptInvitation: (v: { token: string; name: string; password: string }) => Promise<SignInResult>;
  switchCompany: (tenantId: string) => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const router = useRouter();
  const booted = useRef(false);

  const loadMe = useCallback(async () => {
    const m = await api<Me>('/v1/auth/me');
    setMe(m);
    setStatus('authenticated');
  }, []);

  useEffect(() => {
    tokenStore.onLost(() => { tokenStore.set(null); setMe(null); setStatus('anonymous'); });
    if (booted.current) return;
    booted.current = true;
    // A support hand-off arrives with its own short-lived token and has no refresh cookie.
    if (window.location.pathname === '/support') return;
    (async () => {
      const t = await refreshSession();
      if (!t) return setStatus('anonymous');
      try { await loadMe(); } catch { setStatus('anonymous'); }
    })();
  }, [loadMe]);

  const finish = useCallback(async (res: { status: string; accessToken?: string; selectionToken?: string; companies?: Company[]; company?: Company }): Promise<SignInResult> => {
    if (res.status === 'ok' && res.accessToken) {
      tokenStore.set(res.accessToken);
      try { localStorage.setItem('trk.tenant', res.company?.slug ?? ''); } catch { /* ignore */ }
      await loadMe();
      return { status: 'ok' };
    }
    return { status: 'choose_company', selectionToken: res.selectionToken!, companies: res.companies! };
  }, [loadMe]);

  const value = useMemo<AuthState>(() => {
    const perms = new Map((me?.permissions ?? []).map((p) => [p.permission, p.scope]));
    return {
      status, me,
      can: (p) => perms.has(p),
      scopeOf: (p) => perms.get(p) ?? null,
      hasModule: (m) => !me || m === 'core' || me.modules.includes(m),
      signIn: async (identifier, password, tenant) => finish(await api('/v1/auth/login', { method: 'POST', body: { identifier, password, ...(tenant ? { tenant } : {}) } })),
      requestOtp: (identifier) => api('/v1/auth/otp/request', { method: 'POST', body: { identifier } }),
      verifyOtp: async (identifier, code, tenant) => finish(await api('/v1/auth/otp/verify', { method: 'POST', body: { identifier, code, ...(tenant ? { tenant } : {}) } })),
      selectCompany: async (selectionToken, tenantId) => finish(await api('/v1/auth/select-company', { method: 'POST', body: { selectionToken, tenantId } })),
      acceptInvitation: async (v) => finish(await api('/v1/auth/invitations/accept', { method: 'POST', body: v })),
      switchCompany: async (tenantId) => {
        await finish(await api('/v1/auth/switch-company', { method: 'POST', body: { tenantId } }));
        router.replace('/');
        router.refresh();
      },
      signOut: async () => {
        await api('/v1/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
        tokenStore.set(null);
        setMe(null);
        setStatus('anonymous');
        router.replace('/sign-in');
      },
      reload: loadMe,
    };
  }, [status, me, finish, loadMe, router]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
export const useCan = (permission: string): boolean => useAuth().can(permission);

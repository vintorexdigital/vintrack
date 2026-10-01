'use client';
import { Banner } from '@trackrex/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/auth';
import { CommandPalette } from './command-palette';
import { ModuleLauncher } from './launcher';
import { Sidebar, SidebarDrawer } from './sidebar';
import { ShellProvider, useShell } from './shell-state';
import { MobileTabBar } from './tab-bar';
import { Topbar } from './topbar';

const DAY = 24 * 3_600_000;

/** Billing and dunning banners show only to people who can act on them, and can be dismissed for 24 hours. */
function Banners() {
  const { me, can } = useAuth();
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => { try { setDismissed(Date.now() - Number(localStorage.getItem('trk.billing-banner') ?? 0) < DAY); } catch { setDismissed(false); } }, []);
  const support = useQuery({ queryKey: ['support-session'], queryFn: () => api<{ session: { staffName: string; reason: string; expiresAt: string } | null }>('/v1/company/support-access'), enabled: can('company.support.manage'), refetchInterval: 60_000 });
  if (!me) return null;
  const canBill = me.membership.isOwner || can('billing.subscription.manage');
  const s = me.company.status;
  const trialDays = me.company.trialEndsAt ? Math.ceil((new Date(me.company.trialEndsAt).getTime() - Date.now()) / DAY) : null;
  return (
    <>
      {me.support && <Banner tone="warn">Platform support is working in this company through an audited, time-boxed session. Everything you do here is recorded.</Banner>}
      {support.data?.session && <Banner tone="info">{support.data.session.staffName} from Vintorex support has access until {new Date(support.data.session.expiresAt).toLocaleTimeString()}. Reason: {support.data.session.reason}. <Link href="/admin/security/support" className="font-medium">Manage access</Link></Banner>}
      {canBill && !dismissed && s === 'trial' && trialDays !== null && trialDays <= 7 && (
        <Banner tone="info" onDismiss={() => { try { localStorage.setItem('trk.billing-banner', String(Date.now())); } catch { /* ignore */ } setDismissed(true); }}>Your trial ends in {Math.max(trialDays, 0)} {trialDays === 1 ? 'day' : 'days'}. Choose a plan to keep your data and seats.</Banner>
      )}
      {canBill && !dismissed && s === 'past_due' && <Banner tone="warn" onDismiss={() => { try { localStorage.setItem('trk.billing-banner', String(Date.now())); } catch { /* ignore */ } setDismissed(true); }}>Your subscription payment is overdue. Update billing to avoid your company becoming read-only.</Banner>}
      {s === 'suspended' && <Banner tone="error">This company is suspended and read-only. {canBill ? 'Update billing to restore access.' : 'Ask your owner to update billing.'}</Banner>}
    </>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const { sidebar } = useShell();
  const width = sidebar === 'expanded' ? 'var(--sidebar-width-expanded)' : sidebar === 'rail' ? 'var(--sidebar-width-rail)' : '0px';
  return (
    <div className="shell-grid min-h-dvh" style={{ ['--sidebar-width' as string]: width }}>
      <Sidebar />
      <div className="col-start-2 flex min-w-0 flex-col pb-16 md:pb-0">
        <Topbar />
        <Banners />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">{children}</main>
      </div>
      <SidebarDrawer />
      <ModuleLauncher />
      <CommandPalette />
      <MobileTabBar />
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return <ShellProvider><Frame>{children}</Frame></ShellProvider>;
}


'use client';
import { LayoutGrid } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@trackrex/ui';
import { useAuth } from '../auth/auth';
import { useT } from '../i18n/i18n';
import { EMPLOYEE_NAV, MANAGER_NAV } from './nav';
import { isActive, visibleNav } from './nav-utils';
import { useShell } from './shell-state';

/** Below 768 px the main destinations live in a bottom tab bar of at most five items. */
export function MobileTabBar() {
  const { viewport, mode, setLauncherOpen } = useShell();
  const { can, hasModule } = useAuth();
  const { t } = useT();
  const path = usePathname();
  if (viewport !== 'phone') return null;
  const nav = visibleNav(mode === 'manager' ? MANAGER_NAV : EMPLOYEE_NAV, { can, hasModule });
  const tabs = nav.slice(0, 4).map((i) => ({ id: i.id, label: i.labelKey ? t(i.labelKey) : i.label, href: i.href ?? i.children?.[0]?.href ?? '/', icon: i.icon, active: i.href ? isActive(path, i.href) : !!i.children?.some((c) => isActive(path, c.href)) }));
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-rule bg-surface pb-[env(safe-area-inset-bottom)]">
      {tabs.map((tab) => (
        <Link key={tab.id} href={tab.href} aria-current={tab.active ? 'page' : undefined} className={cn('flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium', tab.active ? 'text-brand' : 'text-muted')}>
          <tab.icon className="size-5" aria-hidden />{tab.label}
        </Link>
      ))}
      <button type="button" onClick={() => setLauncherOpen(true)} className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-medium text-muted">
        <LayoutGrid className="size-5" aria-hidden />{t('common.more')}
      </button>
    </nav>
  );
}

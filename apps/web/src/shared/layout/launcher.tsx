'use client';
import { Drawer } from '@trackrex/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '../auth/auth';
import { useT } from '../i18n/i18n';
import { EMPLOYEE_NAV, MANAGER_NAV } from './nav';
import { visibleNav } from './nav-utils';
import { useShell } from './shell-state';

/** Icon view: a grid of module tiles for fast switching on touch devices. Lists only licensed modules. */
export function ModuleLauncher() {
  const { launcherOpen, setLauncherOpen, mode } = useShell();
  const { can, hasModule } = useAuth();
  const { t } = useT();
  const path = usePathname();
  useEffect(() => { setLauncherOpen(false); }, [path, setLauncherOpen]);
  const items = visibleNav(mode === 'manager' ? MANAGER_NAV : EMPLOYEE_NAV, { can, hasModule });
  return (
    <Drawer open={launcherOpen} onOpenChange={setLauncherOpen} title={t('common.modules')} description="Jump to any module you can use.">
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {items.map((i) => {
          const href = i.href ?? i.children?.[0]?.href ?? '/';
          return (
            <li key={i.id}>
              <Link href={href} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-overlay border border-rule bg-canvas p-2 text-center text-xs font-medium text-ink hover:border-brand">
                <i.icon className="size-6 text-brand" aria-hidden />
                {i.labelKey ? t(i.labelKey) : i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </Drawer>
  );
}

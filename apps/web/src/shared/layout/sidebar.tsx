'use client';
import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button, cn, IconButton, Tip } from '@trackrex/ui';
import { useAuth } from '../auth/auth';
import { useT } from '../i18n/i18n';
import { EMPLOYEE_NAV, MANAGER_NAV, type NavItem } from './nav';
import { isActive, visibleNav } from './nav-utils';
import { useShell } from './shell-state';

function useNav(): NavItem[] {
  const { can, hasModule } = useAuth();
  const { mode } = useShell();
  return visibleNav(mode === 'manager' ? MANAGER_NAV : EMPLOYEE_NAV, { can, hasModule });
}

const itemBase = 'relative flex min-h-11 items-center gap-3 rounded-button px-3 text-sm font-medium text-ink outline-none hover:bg-canvas focus-visible:ring-2 focus-visible:ring-brand md:min-h-9';

function Label({ item }: { item: NavItem }) {
  const { t } = useT();
  return <>{item.labelKey ? t(item.labelKey) : item.label}</>;
}

function NavLink({ item, rail, onNavigate }: { item: NavItem; rail: boolean; onNavigate?: () => void }) {
  const path = usePathname();
  const active = isActive(path, item.href);
  const { t } = useT();
  const label = item.labelKey ? t(item.labelKey) : item.label;
  const link = (
    <Link href={item.href!} onClick={onNavigate} aria-current={active ? 'page' : undefined} aria-label={rail ? label : undefined} className={cn(itemBase, rail && 'justify-center px-0', active && 'bg-canvas text-brand')}>
      {active && <span aria-hidden className="absolute inset-y-1.5 left-0 w-1 rounded-r bg-brand" />}
      <item.icon className="size-5 shrink-0" aria-hidden />
      {!rail && <span className="truncate"><Label item={item} /></span>}
    </Link>
  );
  return rail ? <Tip label={label}>{link}</Tip> : link;
}

/** In the icon rail a group shows a flyout of its pages on click, hover or keyboard focus. */
function RailGroup({ item }: { item: NavItem }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { t } = useT();
  const active = item.children!.some((c) => isActive(path, c.href));
  const label = item.labelKey ? t(item.labelKey) : item.label;
  const show = () => { clearTimeout(timer.current); setOpen(true); };
  const hide = () => { timer.current = setTimeout(() => setOpen(false), 120); };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" aria-label={label} onMouseEnter={show} onMouseLeave={hide} onFocus={show} className={cn(itemBase, 'justify-center px-0', active && 'bg-canvas text-brand')}>
          {active && <span aria-hidden className="absolute inset-y-1.5 left-0 w-1 rounded-r bg-brand" />}
          <item.icon className="size-5" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content side="right" align="start" sideOffset={8} onMouseEnter={show} onMouseLeave={hide} onOpenAutoFocus={(e) => e.preventDefault()} className="z-50 min-w-52 rounded-overlay border border-rule bg-surface p-1 shadow-[var(--shadow-overlay)]">
          <p className="px-2.5 py-1.5 text-xs font-semibold text-muted">{label}</p>
          {item.children!.map((c) => (
            <Link key={c.id} href={c.href!} onClick={() => setOpen(false)} aria-current={isActive(path, c.href) ? 'page' : undefined} className={cn('flex min-h-9 items-center gap-2 rounded-input px-2.5 text-sm hover:bg-canvas', isActive(path, c.href) && 'text-brand')}>
              <c.icon className="size-4" aria-hidden /><Label item={c} />
            </Link>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ExpandedGroup({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  const path = usePathname();
  const active = item.children!.some((c) => isActive(path, c.href));
  const [open, setOpen] = useState(active);
  useEffect(() => { if (active) setOpen(true); }, [active]);
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={cn(itemBase, 'w-full text-left', active && 'text-brand')}>
        <item.icon className="size-5 shrink-0" aria-hidden />
        <span className="flex-1 truncate"><Label item={item} /></span>
        <ChevronDown className={cn('size-4 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <ul className="ml-5 mt-0.5 space-y-0.5 border-l border-rule pl-2">
          {item.children!.map((c) => (
            <li key={c.id}>
              <Link href={c.href!} onClick={onNavigate} aria-current={isActive(path, c.href) ? 'page' : undefined} className={cn('flex min-h-11 items-center rounded-input px-2.5 text-sm text-ink hover:bg-canvas md:min-h-8', isActive(path, c.href) && 'bg-canvas font-semibold text-brand')}>
                <Label item={c} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SidebarBody({ rail, onNavigate }: { rail: boolean; onNavigate?: () => void }) {
  const items = useNav();
  return (
    <nav aria-label="Main" className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-2 py-2">
      {items.map((item) =>
        item.children ? (rail ? <RailGroup key={item.id} item={item} /> : <ExpandedGroup key={item.id} item={item} {...(onNavigate ? { onNavigate } : {})} />) : <NavLink key={item.id} item={item} rail={rail} {...(onNavigate ? { onNavigate } : {})} />,
      )}
    </nav>
  );
}

export function Brand({ rail }: { rail?: boolean }) {
  return (
    <Link href="/" className="flex h-14 shrink-0 items-center gap-2 px-4 font-semibold tracking-tight text-ink" aria-label="Trackrex home">
      <span className="inline-flex size-7 items-center justify-center rounded-input bg-brand text-sm text-on-brand" aria-hidden>T</span>
      {!rail && <span>Trackrex</span>}
    </Link>
  );
}

/** Desktop and tablet sidebar. Collapses to a 72 px rail; Ctrl or Cmd + B toggles it. */
export function Sidebar() {
  const { sidebar, toggleSidebar } = useShell();
  const { t } = useT();
  const rail = sidebar === 'rail';
  if (sidebar === 'hidden') return null;
  return (
    <aside className="sticky top-0 z-30 hidden h-dvh min-w-0 flex-col overflow-hidden border-r border-rule bg-surface md:flex" aria-label="Sidebar">
      <Brand rail={rail} />
      <SidebarBody rail={rail} />
      <div className="border-t border-rule p-2">
        {rail ? (
          <IconButton label={t('common.expand')} onClick={toggleSidebar} className="w-full" aria-keyshortcuts="Control+B Meta+B"><PanelLeftOpen className="size-5" /></IconButton>
        ) : (
          <Button variant="ghost" className="w-full justify-start" onClick={toggleSidebar} icon={<PanelLeftClose className="size-5" aria-hidden />} aria-keyshortcuts="Control+B Meta+B">{t('common.collapse')}</Button>
        )}
      </div>
    </aside>
  );
}

/** Below 768 px the sidebar is an off-canvas drawer opened from the top bar. */
export function SidebarDrawer() {
  const { drawerOpen, setDrawerOpen, viewport } = useShell();
  const path = usePathname();
  useEffect(() => { setDrawerOpen(false); }, [path, setDrawerOpen]);
  if (viewport !== 'phone') return null;
  return (
    <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--color-overlay)]" />
        <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(20rem,88vw)] flex-col bg-surface shadow-[var(--shadow-overlay)] focus:outline-none">
          <Dialog.Title className="sr-only">Navigation</Dialog.Title>
          <Dialog.Description className="sr-only">Main navigation</Dialog.Description>
          <div className="flex items-center justify-between pr-2"><Brand /><Dialog.Close asChild><IconButton label="Close menu"><X className="size-5" /></IconButton></Dialog.Close></div>
          <SidebarBody rail={false} onNavigate={() => setDrawerOpen(false)} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

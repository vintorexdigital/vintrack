'use client';
import { Button, IconButton, Skeleton, cn } from '@trackrex/ui';
import { Building2, ClipboardList, Receipt, Gauge, Handshake, LogOut, Menu as MenuIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useSession } from '@/shared/session';

const NAV = [
  { href: '/', label: 'Overview', icon: Gauge },
  { href: '/companies', label: 'Companies', icon: Building2 },
  { href: '/billing', label: 'Billing', icon: Receipt },
  { href: '/resellers', label: 'Resellers and groups', icon: Handshake },
  { href: '/audit', label: 'Platform audit log', icon: ClipboardList },
];

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const s = useSession();
  const router = useRouter();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (s.status === 'anonymous') router.replace('/sign-in'); }, [s.status, router]);
  useEffect(() => { setOpen(false); }, [path]);
  if (s.status !== 'authenticated') return <div className="space-y-3 p-6" aria-busy="true"><Skeleton className="h-8 w-48" /><Skeleton className="h-64" /></div>;
  const nav = (
    <nav aria-label="Platform" className="space-y-0.5 p-2">
      {NAV.map((n) => { const active = n.href === '/' ? path === '/' : path.startsWith(n.href); return (
        <Link key={n.href} href={n.href} aria-current={active ? 'page' : undefined} className={cn('flex min-h-11 items-center gap-3 rounded-button px-3 text-sm font-medium no-underline hover:bg-canvas md:min-h-9', active ? 'bg-canvas text-brand' : 'text-ink')}><n.icon className="size-5" aria-hidden />{n.label}</Link>
      ); })}
    </nav>
  );
  return (
    <div className="grid min-h-dvh md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-rule bg-surface md:flex">
        <p className="flex h-14 items-center gap-2 px-4 font-semibold"><span className="inline-flex size-7 items-center justify-center rounded-input bg-brand text-sm text-on-brand" aria-hidden>T</span>Platform</p>
        {nav}
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-rule bg-surface px-3 md:px-4">
          <IconButton label="Menu" className="md:hidden" onClick={() => setOpen(!open)}><MenuIcon className="size-5" /></IconButton>
          <p className="text-sm font-semibold md:hidden">Platform</p>
          <p className="ml-auto text-xs text-muted"><span className="font-medium text-ink">{s.staff?.role.replace('_', ' ')}</span></p>
          <Button size="sm" variant="ghost" onClick={s.logout} icon={<LogOut className="size-4" aria-hidden />}>Sign out</Button>
        </header>
        {open && <div className="border-b border-rule bg-surface md:hidden">{nav}</div>}
        <main id="main" tabIndex={-1} className="focus:outline-none">{children}</main>
      </div>
    </div>
  );
}

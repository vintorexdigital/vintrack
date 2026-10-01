'use client';
import { Input, Select, cn } from '@trackrex/ui';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/shared/auth/auth';
import { ADMIN_NAV } from '@/shared/layout/nav';
import { isActive, visibleAdmin } from '@/shared/layout/nav-utils';
import { useShell } from '@/shared/layout/shell-state';

/** The admin area has its own sidebar, grouped by intent, with search. Below md it is a section picker. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { can, hasModule } = useAuth();
  const path = usePathname();
  const router = useRouter();
  const { sidebar } = useShell();
  const [q, setQ] = useState('');
  const groups = useMemo(() => visibleAdmin(ADMIN_NAV, { can, hasModule }).map((g) => ({ ...g, items: g.items.filter((i) => !q || i.label.toLowerCase().includes(q.toLowerCase())) })).filter((g) => g.items.length), [can, hasModule, q]);
  const flat = groups.flatMap((g) => g.items);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <div className={cn('grid min-w-0', sidebar === 'rail' ? 'lg:grid-cols-[14rem_minmax(0,1fr)]' : 'xl:grid-cols-[15rem_minmax(0,1fr)]')}>
      <div className="border-b border-rule bg-surface p-3 md:hidden">
        <Select aria-label="Admin section" value={flat.find((i) => isActive(path, i.href))?.href ?? ''} onChange={(e) => router.push(e.target.value)}>
          <option value="" disabled>Choose a section</option>
          {groups.map((g) => <optgroup key={g.id} label={g.label}>{g.items.map((i) => <option key={i.href} value={i.href}>{i.label}</option>)}</optgroup>)}
        </Select>
      </div>
      <nav aria-label="Admin" className="hidden border-r border-rule bg-surface md:block">
        <div className="sticky top-14 max-h-[calc(100dvh-3.5rem)] overflow-y-auto p-3">
          <Input aria-label="Search admin" placeholder="Search admin" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" />
          {groups.map((g) => {
            const active = g.items.some((i) => isActive(path, i.href));
            const expanded = q ? true : open[g.id] ?? active ?? true;
            return (
              <div key={g.id} className="mb-1">
                <button type="button" aria-expanded={expanded} onClick={() => setOpen({ ...open, [g.id]: !expanded })} className="flex min-h-9 w-full items-center gap-2 rounded-input px-2 text-left text-sm font-semibold text-ink hover:bg-canvas">
                  <g.icon className="size-4 text-muted" aria-hidden /><span className="flex-1">{g.label}</span><ChevronDown className={cn('size-4 text-muted transition-transform', expanded && 'rotate-180')} aria-hidden />
                </button>
                {expanded && <ul className="ml-4 border-l border-rule pl-2">{g.items.map((i) => <li key={i.href}><Link href={i.href} aria-current={isActive(path, i.href) ? 'page' : undefined} className={cn('flex min-h-8 items-center rounded-input px-2 text-sm hover:bg-canvas', isActive(path, i.href) ? 'bg-canvas font-semibold text-brand' : 'text-ink')}>{i.label}</Link></li>)}</ul>}
              </div>
            );
          })}
        </div>
      </nav>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

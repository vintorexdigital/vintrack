'use client';
import { cn } from '@trackrex/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/shared/auth/auth';

const TABS = [
  { href: '/reports', label: 'Standard reports', match: (p: string) => p === '/reports' || (!/^\/reports\/(saved|dashboards|schedules|snapshots)/.test(p) && p.startsWith('/reports/')) },
  { href: '/reports/saved', label: 'Saved reports', match: (p: string) => p.startsWith('/reports/saved') },
  { href: '/reports/dashboards', label: 'Dashboards', match: (p: string) => p.startsWith('/reports/dashboards') },
  { href: '/reports/schedules', label: 'Scheduled', match: (p: string) => p.startsWith('/reports/schedules') || p.startsWith('/reports/snapshots') },
];

/** Moves between the fixed reports, the ones people built, dashboards and scheduled deliveries. */
export function ReportsTabs() {
  const path = usePathname();
  const { can, hasModule } = useAuth();
  if (!hasModule('advanced_analytics') || !can('reports.builder.read')) return null;
  return (
    <nav aria-label="Report types" className="flex flex-wrap gap-1 px-4 pb-2 md:px-6">
      {TABS.map((t) => <Link key={t.href} href={t.href} aria-current={t.match(path) ? 'page' : undefined} className={cn('min-h-9 rounded-button px-3 py-1.5 text-sm no-underline', t.match(path) ? 'bg-brand text-on-brand' : 'text-ink hover:bg-canvas')}>{t.label}</Link>)}
    </nav>
  );
}

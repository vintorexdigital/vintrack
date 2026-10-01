'use client';
import { PageBody, PageHeader } from '@trackrex/ui';
import Link from 'next/link';
import { useAuth } from '@/shared/auth/auth';
import { ADMIN_NAV } from '@/shared/layout/nav';
import { visibleAdmin } from '@/shared/layout/nav-utils';

export default function AdminHome() {
  const { can, hasModule } = useAuth();
  const groups = visibleAdmin(ADMIN_NAV, { can, hasModule });
  return (
    <>
      <PageHeader title="Admin" description="Set up your organization, time and leave rules, security and company settings." />
      <PageBody>
        <div className="grid gap-6 md:grid-cols-2 2xl:grid-cols-3">
          {groups.map((g) => (
            <section key={g.id} className="rounded-overlay border border-rule bg-surface p-4">
              <h2 className="mb-2 flex items-center gap-2 text-section font-semibold"><g.icon className="size-5 text-brand" aria-hidden />{g.label}</h2>
              <ul className="space-y-0.5">{g.items.map((i) => <li key={i.href}><Link href={i.href} className="flex min-h-9 items-center rounded-input px-2 text-sm hover:bg-canvas">{i.label}</Link></li>)}</ul>
            </section>
          ))}
        </div>
      </PageBody>
    </>
  );
}

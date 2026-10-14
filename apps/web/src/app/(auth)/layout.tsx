import type { ReactNode } from 'react';
import { BrandMark, Wordmark } from '@trackrex/ui';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
      <section className="hidden flex-col justify-between bg-brand p-10 text-on-brand lg:flex">
        <p className="inline-flex items-center gap-2.5 self-start rounded-card bg-surface py-2.5 pl-3 pr-5"><BrandMark className="size-10 xl:size-12" /><Wordmark tagline className="text-2xl xl:text-3xl" /></p>
        <div className="max-w-lg space-y-4">
          <h2 className="text-3xl font-semibold leading-tight">Know who is working, where and on what.</h2>
          <p className="text-on-brand/80">Attendance, leave, visits and productivity for field and office teams, set up in an afternoon and trusted for payroll.</p>
          <ul className="space-y-1 text-sm text-on-brand/80">
            <li>Punch rules enforced on the server, not just in the app</li>
            <li>Policies that explain every late mark and deduction</li>
            <li>Tracking only during working time, always visible to employees</li>
          </ul>
        </div>
        <p className="text-xs text-on-brand/80">A product of Vintorex</p>
      </section>
      <section className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <p className="mb-8 flex items-center gap-2.5 lg:hidden"><BrandMark className="size-10" /><Wordmark tagline className="text-2xl sm:text-3xl" /></p>
          {children}
        </div>
      </section>
    </main>
  );
}

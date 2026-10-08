import { Menu } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CONTACT_EMAIL, loginUrl, signupUrl } from '../content/site';

const NAV = [['Product', '/product/attendance/'], ['Pricing', '/pricing/'], ['Security', '/security/'], ['Help', '/help/']] as const;
const btn = 'inline-flex min-h-11 items-center justify-center rounded-button px-4 text-sm font-semibold no-underline';

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2">
        <Link href="/" className="text-lg font-semibold tracking-tight text-ink no-underline">Trackrex</Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map(([l, h]) => <Link key={h} href={h} className="inline-flex min-h-11 items-center rounded-button px-3 text-sm font-medium text-ink no-underline hover:bg-canvas">{l}</Link>)}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <a href={loginUrl} className={`${btn} text-ink hover:bg-canvas`}>Sign in</a>
          <a href={signupUrl} className={`${btn} bg-brand text-on-brand`}>Start free trial</a>
        </div>
        <details className="relative md:hidden">
          <summary className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-button hover:bg-canvas" aria-label="Menu"><Menu className="size-5" aria-hidden /></summary>
          <div className="absolute right-0 mt-2 flex w-64 flex-col gap-1 rounded-card border border-rule bg-surface p-2 shadow-lg">
            {NAV.map(([l, h]) => <Link key={h} href={h} className="flex min-h-11 items-center rounded-button px-3 text-ink no-underline hover:bg-canvas">{l}</Link>)}
            <a href={loginUrl} className="flex min-h-11 items-center rounded-button px-3 text-ink no-underline hover:bg-canvas">Sign in</a>
            <a href={signupUrl} className={`${btn} bg-brand text-on-brand`}>Start free trial</a>
          </div>
        </details>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const col = (title: string, links: [string, string][]) => (
    <div><h2 className="mb-2 text-sm font-semibold">{title}</h2><ul className="space-y-1 text-sm">{links.map(([l, h]) => <li key={h}>{h.startsWith('http') || h.startsWith('mailto') ? <a href={h} className="text-muted no-underline hover:text-ink">{l}</a> : <Link href={h} className="text-muted no-underline hover:text-ink">{l}</Link>}</li>)}</ul></div>
  );
  return (
    <footer className="mt-16 border-t border-rule bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div><p className="text-lg font-semibold">Trackrex</p><p className="mt-2 max-w-xs text-sm text-muted">Workforce operations for field and office teams. A product of Vintorex.</p></div>
        {col('Product', [['Attendance and shifts', '/product/attendance/'], ['Leave and holidays', '/product/leave/'], ['Field tracking', '/product/field-tracking/'], ['Customers and tasks', '/product/tasks-customers/']])}
        {col('Company', [['Pricing', '/pricing/'], ['Security and privacy', '/security/'], ['Book a demo', '/demo/'], ['Contact', `mailto:${CONTACT_EMAIL}`]])}
        {col('Resources', [['Help center', '/help/'], ['API reference', '/api-docs/'], ['Sign in', loginUrl], ['Start free trial', signupUrl]])}
      </div>
      <p className="border-t border-rule px-4 py-4 text-center text-xs text-muted">© {new Date().getFullYear()} Vintorex. Trackrex is a trademark of Vintorex.</p>
    </footer>
  );
}

export function Section({ title, intro, children, id }: { title: string; intro?: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="mx-auto max-w-6xl px-4 py-12">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      {intro && <p className="mt-2 max-w-2xl text-muted">{intro}</p>}
      <div className="mt-6">{children}</div>
    </section>
  );
}

export function CtaLink({ href, children, primary = true }: { href: string; children: ReactNode; primary?: boolean }) {
  return <a href={href} className={`${btn} ${primary ? 'bg-brand text-on-brand' : 'border border-rule bg-surface text-ink hover:bg-canvas'}`}>{children}</a>;
}

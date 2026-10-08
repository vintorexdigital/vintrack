import { ArrowRight, Lock, Radar, Timer } from 'lucide-react';
import Link from 'next/link';
import { CtaLink, Section } from '../components/chrome';
import { MODULES } from '../content/modules';
import { signupUrl } from '../content/site';

const PROMISES = [
  { icon: Timer, title: 'Rules the server enforces', body: 'Shifts, policies and leave rules are checked on every request, so a modified app or a spreadsheet cannot bend them.' },
  { icon: Radar, title: 'Tracking with limits', body: 'Location is recorded only while someone is punched in, the employee can see it is on, and history is deleted on your schedule.' },
  { icon: Lock, title: 'Your data stays yours', body: 'Every company is isolated in the database itself. Support can only look in with your permission, for a reason, for a limited time.' },
];

export default function Home() {
  return (
    <>
      <section className="border-b border-rule bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:py-20">
          <div>
            <p className="text-sm font-semibold text-brand">Attendance · Leave · Field operations</p>
            <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Know who is working, where, and on what.</h1>
            <p className="mt-4 max-w-xl text-lg text-muted">Trackrex gives office and field teams one place for attendance, leave, visits and live location, with policies your payroll team can trust and privacy your employees can see.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <CtaLink href={signupUrl}>Start your 14-day trial</CtaLink>
              <CtaLink href="/demo/" primary={false}>Book a demo</CtaLink>
            </div>
            <p className="mt-3 text-sm text-muted">Every module is included in the trial. No card needed.</p>
          </div>
          <div aria-hidden className="self-center rounded-card border border-rule bg-canvas p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Today, 9 March</p>
            <div className="space-y-3">
              {[['Anitha K.', 'On time', 96, 'bg-present'], ['Suresh B.', 'Late 22 min', 88, 'bg-late'], ['Divya N.', 'On leave', 40, 'bg-non-working'], ['Karthik S.', 'Absent', 0, 'bg-absent']].map(([n, s, w, c]) => (
                <div key={String(n)} className="flex items-center gap-3 text-sm"><span className="w-24 shrink-0 font-medium">{n}</span><span className="relative h-3 flex-1 overflow-hidden rounded-pill bg-surface"><span className={`absolute inset-y-0 left-0 ${c}`} style={{ width: `${w}%` }} /></span><span className="w-24 shrink-0 text-right text-muted">{s}</span></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Section title="Built on three promises">
        <div className="grid gap-4 md:grid-cols-3">
          {PROMISES.map((p) => <div key={p.title} className="rounded-card border border-rule bg-surface p-5"><p.icon className="size-6 text-brand" aria-hidden /><h3 className="mt-3 font-semibold">{p.title}</h3><p className="mt-1 text-sm text-muted">{p.body}</p></div>)}
        </div>
      </Section>

      <Section title="What is in the box" intro="Every module is built on the same rules engine, roles and audit trail.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <Link key={m.slug} href={`/product/${m.slug}/`} className="group rounded-card border border-rule bg-surface p-5 no-underline hover:border-brand">
              <m.icon className="size-6 text-brand" aria-hidden />
              <h3 className="mt-3 font-semibold text-ink">{m.name}</h3>
              <p className="mt-1 text-sm text-muted">{m.tagline}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand">Read more <ArrowRight className="size-4" aria-hidden /></span>
            </Link>
          ))}
        </div>
      </Section>

      <section className="border-y border-rule bg-brand text-on-brand">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-10">
          <div><h2 className="text-2xl font-semibold">Set up in an afternoon.</h2><p className="text-on-brand/80">Import your people, pick a shift, send invitations.</p></div>
          <a href={signupUrl} className="inline-flex min-h-11 items-center rounded-button bg-surface px-5 text-sm font-semibold text-brand no-underline">Start free trial</a>
        </div>
      </section>
    </>
  );
}

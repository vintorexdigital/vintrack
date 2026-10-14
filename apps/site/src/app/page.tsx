import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  Cloud,
  Gauge,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  Radar,
  Shield,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Timer,
  Users2,
  WifiOff,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { ScrollSection } from '@trackrex/ui';
import { CtaLink, SectionHeader, SectionLabel } from '../components/chrome';
import { InteractiveDeviceShowcase, InteractiveRoiCalculator } from '../components/interactive-showcase';
import { TypingText } from '../components/site-effects';
import { MODULES } from '../content/modules';
import { CONTACT_EMAIL, signupUrl } from '../content/site';

const ACCENTS = [
  { text: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', hover: 'hover:bg-cyan-500/10', dot: 'bg-cyan-400', chip: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400', ring: 'bg-cyan-500/20 border-cyan-500/30 text-cyan-400', bar: 'from-cyan-500 to-cyan-400' },
  { text: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/20', hover: 'hover:bg-violet-500/10', dot: 'bg-violet-400', chip: 'bg-violet-500/10 border-violet-500/20 text-violet-400', ring: 'bg-violet-500/20 border-violet-500/30 text-violet-400', bar: 'from-violet-500 to-violet-400' },
  { text: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', hover: 'hover:bg-rose-500/10', dot: 'bg-rose-400', chip: 'bg-rose-500/10 border-rose-500/20 text-rose-400', ring: 'bg-rose-500/20 border-rose-500/30 text-rose-400', bar: 'from-rose-500 to-rose-400' },
  { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', hover: 'hover:bg-emerald-500/10', dot: 'bg-emerald-400', chip: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400', ring: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400', bar: 'from-emerald-500 to-emerald-400' },
] as const;
const accent = (i: number) => ACCENTS[i % ACCENTS.length]!;

const STATS = [
  { value: '99.99%', label: 'Uptime SLA', sub: 'Multi-region cloud' },
  { value: '1.4M+', label: 'Verified punches', sub: 'Every single month' },
  { value: '0', label: 'Spoofed check-ins', sub: 'Rejected by the server' },
  { value: '14 days', label: 'Free trial', sub: 'Every module included' },
];

const PILLARS = [
  { icon: Timer, title: 'Server-enforced rules', body: 'Shift windows, grace periods and leave policies are checked on every request. Spoofed coordinates are rejected.' },
  { icon: Radar, title: 'Ethical GPS', body: 'Location is recorded only while punched in, with a live indicator on the employee’s phone.' },
  { icon: Shield, title: 'Tenant isolation', body: 'Every company is segregated in PostgreSQL with row-level security and dedicated roles.' },
  { icon: WifiOff, title: 'Offline-first mobile', body: 'Punches and visits queue on the device and sync the moment a signal returns.' },
];

const CAPABILITIES = [
  { icon: Smartphone, title: 'iOS & Android', sub: 'Native field app' },
  { icon: MapPin, title: 'Geofencing', sub: 'Office & client sites' },
  { icon: CalendarCheck, title: 'Leave engine', sub: 'Accruals by rule' },
  { icon: Gauge, title: 'Real-time', sub: 'Live team telemetry' },
  { icon: Lock, title: 'Privacy-first', sub: 'Punch-gated tracking' },
  { icon: Cloud, title: 'Payroll export', sub: 'One-click register' },
];

const STEPS = [
  {
    icon: Users2,
    title: 'Configure shifts & geofences',
    tag: 'Setup',
    when: 'Day 1',
    points: ['Rotational shifts, grace periods and overtime multipliers', 'Office and client geofences drawn on a map', 'Employees imported via CSV or HRIS sync'],
    badges: ['Shifts', 'Geofences', 'CSV import'],
  },
  {
    icon: Smartphone,
    title: 'Field & office teams punch in',
    tag: 'Daily',
    when: 'Every shift',
    points: ['iOS, Android or desktop agent check-in', 'Server verifies GPS proximity and device integrity', 'Optional selfie and comment on every punch'],
    badges: ['Mobile', 'Desktop', 'Selfie'],
  },
  {
    icon: MapPin,
    title: 'Live wayfinding & task tracking',
    tag: 'Live',
    when: 'During work',
    points: ['Client visits with forms and digital signatures', 'Route breadcrumbs with stops and distance', 'Low battery drain with offline queuing'],
    badges: ['Visits', 'Tasks', 'Trails'],
  },
  {
    icon: Zap,
    title: 'Automated payroll & export',
    tag: 'Monthly',
    when: 'Pay cycle',
    points: ['Payable days, overtime and deductions calculated', 'Every deduction links to the rule that caused it', 'Lock the cycle and export ready-to-run files'],
    badges: ['Register', 'Excel', 'Audit trail'],
  },
];

const TESTIMONIALS = [
  {
    quote: 'Trackrex replaced four disconnected tools for our 180 field engineers. Shift discrepancies dropped to zero in our first payroll cycle.',
    author: 'Rajesh Venkat',
    role: 'VP of Field Operations',
    company: 'Apex Infrastructure Ltd',
    metric: '180',
    metricLabel: 'Field engineers',
  },
  {
    quote: 'The privacy transparency is what won our field team over. They know GPS only runs while on shift, and management gets real-time accountability.',
    author: 'Elena Rostova',
    role: 'Chief People Officer',
    company: 'Logix Express Global',
    metric: '100%',
    metricLabel: 'Team opt-in',
  },
  {
    quote: 'The fastest, most elegant workforce operations software we have tested. The server-enforced shift engine prevents weeks of manual reconciliation.',
    author: 'Marcus Chen',
    role: 'Operations Director',
    company: 'Centrix Facility Management',
    metric: '3 wks',
    metricLabel: 'Saved per quarter',
  },
];

const CONTACT = [
  { icon: Mail, label: 'Email', value: CONTACT_EMAIL, href: `mailto:${CONTACT_EMAIL}`, tone: 'text-violet-400' },
  { icon: MessageCircle, label: 'Live demo', value: '30-minute walkthrough', href: '/demo/', tone: 'text-cyan-400' },
  { icon: ShieldCheck, label: 'Security', value: 'How we protect data', href: '/security/', tone: 'text-rose-400' },
  { icon: BookOpen, label: 'Help center', value: 'Guides for every role', href: '/help/', tone: 'text-emerald-400' },
];

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section id="hero" data-section="hero" className="relative -mt-16 flex min-h-[100svh] items-center justify-center overflow-hidden pt-16 lg:-mt-18">
        <div className="section-orb section-orb-1 left-[8%] top-[18%] hidden size-80 bg-cyan-500/20 sm:block" aria-hidden />
        <div className="section-orb section-orb-2 bottom-[16%] right-[8%] hidden size-96 bg-violet-500/20 sm:block" aria-hidden />

        <div className="stagger-children relative z-10 mx-auto w-full max-w-[90rem] px-4 text-center sm:px-6 lg:px-8">
          <div>
            <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 font-mono text-xs font-medium text-emerald-400">
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
              </span>
              Trackrex 2.0 · Live telemetry &amp; privacy shield
            </div>
          </div>

          <h1 className="hero-title hero-title--xl mb-4 text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:mb-6 lg:text-7xl xl:text-8xl">
            <span className="text-text-primary">Know who is working,</span>
            <br />
            <span className="gradient-text">where &amp; on what.</span>
          </h1>

          <div className="mb-8 flex h-12 items-center justify-center">
            <p className="font-mono text-xl text-text-secondary sm:text-2xl lg:text-3xl xl:text-4xl">
              <TypingText phrases={['Attendance & Shifts', 'Live GPS Tracking', 'Leave & Approvals', 'Client Visits', 'Payroll Export']} />
            </p>
          </div>

          <p className="mx-auto mb-12 max-w-4xl text-base leading-relaxed text-text-secondary sm:text-lg lg:mb-16 lg:text-xl xl:text-2xl">
            One operating system for office and field teams —{' '}
            <span className="font-medium text-cyan-400">attendance</span>,{' '}
            <span className="font-medium text-violet-400">live geofencing</span>,{' '}
            <span className="font-medium text-rose-400">instant payroll</span>, and privacy your employees can actually see.
          </p>

          <div className="mb-12 flex flex-col items-center justify-center gap-4 xs:flex-row">
            <CtaLink href={signupUrl} size="lg" className="w-full xs:w-auto">
              <Sparkles className="size-5" aria-hidden />
              Start your 14-day trial
            </CtaLink>
            <CtaLink href="/demo/" primary={false} size="lg" className="w-full xs:w-auto">
              <CalendarCheck className="size-5" aria-hidden />
              Book a live demo
            </CtaLink>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            {[
              [CheckCircle2, 'No credit card required'],
              [ShieldCheck, 'Row-level tenant isolation'],
              [Zap, 'Instant cloud provisioning'],
            ].map(([Icon, label]) => {
              const I = Icon as typeof Zap;
              return (
                <div
                  key={label as string}
                  className="shimmer-hover flex max-w-full items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm text-text-secondary transition-all duration-200 hover:bg-surface-hover hover:text-text-primary"
                >
                  <I className="size-3.5" aria-hidden />
                  <span className="font-mono text-xs">{label as string}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-10 h-32 bg-gradient-to-t from-bg-primary to-transparent" />
        <div className="animate-float absolute bottom-8 left-1/2 z-10 hidden -translate-x-1/2 flex-col items-center gap-2 sm:flex">
          <span className="font-mono text-xs text-text-muted">scroll</span>
          <div className="h-8 w-0.5 rounded-full bg-gradient-to-b from-cyan-500/60 to-transparent" />
        </div>
      </section>

      {/* Platform (about) */}
      <section id="platform" data-section="platform" className="section-padding section-band relative overflow-hidden">
        <div className="absolute left-1/2 top-0 h-24 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-cyan-500/30 to-transparent" />
        <div className="section-orb section-orb-morph right-[-6rem] top-40 hidden size-[28rem] bg-cyan-500/10 lg:block" aria-hidden />
        <div className="relative z-10 mx-auto max-w-[90rem]">
          <ScrollSection variant="fade-up">
            <SectionHeader
              label="Why Trackrex"
              title="Truth Enforced at the Server"
              intro="Most workforce systems rely on spreadsheets or client-side checks that are easy to game. Trackrex checks every punch, every location and every policy where it can’t be tampered with."
            />
          </ScrollSection>

          <div className="mb-16 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {STATS.map((s, i) => (
              <ScrollSection key={s.label} variant="scale" delay={i * 80}>
                <div className="glass-card shimmer-hover group p-6 text-center">
                  <div className="gradient-text-static mb-1 font-mono text-3xl font-extrabold lg:text-4xl">{s.value}</div>
                  <div className="mb-1 text-sm font-semibold text-text-primary">{s.label}</div>
                  <div className="text-xs text-text-muted">{s.sub}</div>
                </div>
              </ScrollSection>
            ))}
          </div>

          <div className="grid items-start gap-10 lg:grid-cols-2">
            <ScrollSection variant="slide-right">
              <div className="space-y-5">
                <h3 className="text-xl font-bold text-text-primary">Platform Summary</h3>
                <p className="leading-relaxed text-text-secondary">
                  Trackrex sits at the intersection of operations, HR and finance. Its core is a{' '}
                  <span className="font-medium text-cyan-400">server-side rule engine</span>, a{' '}
                  <span className="font-medium text-cyan-400">punch-gated location stream</span> and a{' '}
                  <span className="font-medium text-cyan-400">versioned policy ledger</span>, backed by{' '}
                  <span className="font-medium text-violet-400">PostgreSQL row-level security</span> and{' '}
                  <span className="font-medium text-rose-400">append-only audit logs</span>.
                </p>
                <p className="leading-relaxed text-text-secondary">
                  Whether you run a 20-person office or 500 engineers on the road, the same register drives attendance, leave, field visits and payroll — so the number on the payslip always matches what actually happened.
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  {['Attendance', 'Shifts', 'Leave', 'Geofencing', 'Field visits', 'Payroll', 'Audit log', 'REST API'].map((b) => (
                    <span key={b} className="tech-badge">{b}</span>
                  ))}
                </div>
              </div>
            </ScrollSection>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {PILLARS.map((p, i) => {
                const a = accent(i);
                return (
                  <ScrollSection key={p.title} variant="slide-left" delay={i * 80}>
                    <div className={`glass-card shimmer-hover group h-full border p-5 ${a.border} ${a.hover}`}>
                      <div className={`mb-3 flex size-10 items-center justify-center rounded-lg ${a.bg} ${a.text}`}>
                        <p.icon className="size-5" aria-hidden />
                      </div>
                      <h4 className={`mb-2 text-sm font-semibold ${a.text}`}>{p.title}</h4>
                      <p className="text-xs leading-relaxed text-text-muted">{p.body}</p>
                    </div>
                  </ScrollSection>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Modules (skills) */}
      <section id="modules" data-section="modules" className="section-padding section-band-soft relative overflow-hidden">
        <div className="relative z-10 mx-auto max-w-[90rem]">
          <ScrollSection variant="fade-up">
            <SectionHeader
              label="Product suite"
              title="Module Matrix"
              intro="Every tool your workforce operations need — unified on the same tenant boundary, role matrix and real-time audit ledger."
            />
          </ScrollSection>

          <ScrollSection variant="fade-up">
            <div className="mb-16 flex flex-wrap justify-center gap-3">
              {CAPABILITIES.map((c) => (
                <div key={c.title} className="glass-card shimmer-hover group flex items-center gap-2.5 px-5 py-3 transition-all hover:border-cyan-500/30">
                  <c.icon className="size-4 text-cyan-400" aria-hidden />
                  <div className="text-left">
                    <div className="text-sm font-semibold text-text-primary transition-colors group-hover:text-accent-cyan">{c.title}</div>
                    <div className="text-xs text-text-muted">{c.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollSection>

          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {MODULES.map((m, i) => {
              const a = accent(i);
              return (
                <ScrollSection key={m.slug} variant="fade-up" delay={(i % 3) * 100}>
                  <Link href={`/product/${m.slug}/`} className="glass-card group flex h-full flex-col p-6 no-underline">
                    <div className="mb-5 flex items-center gap-3">
                      <span className={`flex size-10 items-center justify-center rounded-lg bg-surface ${a.text}`}>
                        <m.icon className="size-5" aria-hidden />
                      </span>
                      <h3 className="text-base font-bold text-text-primary">{m.name}</h3>
                    </div>
                    <p className="mb-5 text-sm leading-relaxed text-text-secondary">{m.tagline}</p>
                    <ul className="mb-6 space-y-3">
                      {m.points.slice(0, 4).map((pt, j) => (
                        <li key={pt.title}>
                          <div className="mb-1.5 flex items-center justify-between">
                            <span className="text-sm font-medium text-text-primary">{pt.title}</span>
                            <span className={`font-mono text-xs ${a.text}`}>0{j + 1}</span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-surface">
                            <div className={`h-full rounded-full bg-gradient-to-r ${a.bar}`} style={{ width: `${92 - j * 9}%` }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                    <span className="mt-auto inline-flex items-center gap-1.5 text-xs font-semibold text-text-secondary transition-colors group-hover:text-accent-cyan">
                      Explore module <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" aria-hidden />
                    </span>
                  </Link>
                </ScrollSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* Workflow (timeline) */}
      <section id="workflow" data-section="workflow" className="section-padding section-band relative overflow-hidden">
        <div className="section-orb section-orb-2 left-[-8rem] top-1/3 hidden size-[26rem] bg-rose-500/10 lg:block" aria-hidden />
        <div className="relative z-10 mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <ScrollSection variant="fade-up">
            <SectionHeader
              label="How it works"
              title="Check-in to Settlement"
              intro="A frictionless four-stage lifecycle designed for high-velocity office and field operations."
            />
          </ScrollSection>

          <div className="relative">
            <div className="absolute bottom-0 left-4 top-0 w-px overflow-hidden sm:left-8" aria-hidden>
              <div className="timeline-line absolute inset-0 opacity-15" />
              <div className="timeline-line absolute inset-0" />
            </div>
            <div className="space-y-8">
              {STEPS.map((s, i) => {
                const a = accent(i);
                return (
                  <ScrollSection key={s.title} variant={i % 2 ? 'slide-left' : 'slide-right'}>
                    <div className="relative flex gap-6 pl-8 sm:gap-10 sm:pl-16">
                      <div className={`absolute left-0 top-6 z-10 flex size-8 items-center justify-center rounded-full border sm:left-4 ${a.ring} ${i === 0 ? 'timeline-dot-active' : ''}`}>
                        <s.icon className="size-4" aria-hidden />
                      </div>
                      <div className="glass-card shimmer-hover group flex-1 p-6">
                        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="mb-1 flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-bold text-text-primary">{s.title}</h3>
                              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 font-mono text-xs text-emerald-400">{s.tag}</span>
                            </div>
                            <p className="text-sm text-text-secondary">
                              <span className="font-medium text-text-primary">Step 0{i + 1}</span> · Trackrex workflow
                            </p>
                          </div>
                          <span className={`shrink-0 rounded-full border px-3 py-1 font-mono text-xs ${a.chip}`}>{s.when}</span>
                        </div>
                        <ul className="mb-4 space-y-2">
                          {s.points.map((pt) => (
                            <li key={pt} className="flex items-start gap-2.5 text-sm text-text-secondary transition-colors group-hover:text-text-primary">
                              <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${a.dot}`} />
                              {pt}
                            </li>
                          ))}
                        </ul>
                        <div className="flex flex-wrap gap-1.5">
                          {s.badges.map((b) => (
                            <span key={b} className="tech-badge">{b}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </ScrollSection>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Showcase (projects) */}
      <section id="showcase" data-section="showcase" className="section-padding section-band-soft relative">
        <div className="relative z-10 mx-auto max-w-[90rem]">
          <ScrollSection variant="fade-up">
            <SectionHeader
              label="Live product"
              title="Built for Production"
              intro="Explore the field app, the dispatcher console and the privacy engine — then estimate what Trackrex saves your team."
            />
          </ScrollSection>

          <ScrollSection variant="scale">
            <div className="stack-card group mb-10 border border-cyan-500/20 p-6 lg:p-8">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="mb-1.5 flex items-center gap-3">
                    <h3 className="text-xl font-bold text-text-primary">Trackrex Platform</h3>
                    <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-gradient-to-r from-cyan-500/20 to-violet-500/20 px-2.5 py-0.5 font-mono text-xs text-cyan-300">
                      <Sparkles className="size-3" aria-hidden /> Featured
                    </span>
                  </div>
                  <p className="text-sm font-medium text-cyan-400">Mobile app · Ops console · Privacy engine</p>
                </div>
                <div className="flex gap-5">
                  {[
                    ['97.8%', 'Attendance'],
                    ['48/50', 'Agents live'],
                    ['99.4%', 'Geofence'],
                  ].map(([v, l]) => (
                    <div key={l} className="text-center">
                      <div className="font-mono text-lg font-extrabold text-cyan-400">{v}</div>
                      <div className="text-xs text-text-muted">{l}</div>
                    </div>
                  ))}
                </div>
              </div>
              <InteractiveDeviceShowcase />
            </div>
          </ScrollSection>

          <ScrollSection variant="fade-up">
            <InteractiveRoiCalculator />
          </ScrollSection>
        </div>
      </section>

      {/* Proof */}
      <section id="proof" data-section="proof" className="section-padding section-band relative overflow-hidden">
        <div className="relative z-10 mx-auto max-w-[90rem]">
          <ScrollSection variant="fade-up">
            <SectionHeader
              label="Customer validation"
              title="Loved by Ops & Field Teams"
              intro="Operations leads, HR and the people in the field — all working from the same source of truth."
            />
          </ScrollSection>

          <div className="grid gap-6 md:grid-cols-3">
            {TESTIMONIALS.map((t, i) => {
              const a = accent(i);
              return (
                <ScrollSection key={t.author} variant="fade-up" delay={i * 100}>
                  <figure className={`glass-card shimmer-hover flex h-full flex-col justify-between border p-6 ${a.border}`}>
                    <div>
                      <div className="mb-4 flex items-center justify-between">
                        <span className={`font-mono text-2xl font-extrabold ${a.text}`}>{t.metric}</span>
                        <span className="font-mono text-xs text-text-muted">{t.metricLabel}</span>
                      </div>
                      <blockquote className="text-sm leading-relaxed text-text-secondary">“{t.quote}”</blockquote>
                    </div>
                    <figcaption className="mt-6 flex items-center gap-3 border-t border-border pt-4">
                      <span className={`flex size-9 items-center justify-center rounded-lg font-mono text-xs font-bold ${a.bg} ${a.text}`}>
                        {t.author.split(' ').map((n) => n[0]).join('')}
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-text-primary">{t.author}</span>
                        <span className="block text-xs text-text-muted">{t.role} · {t.company}</span>
                      </span>
                    </figcaption>
                  </figure>
                </ScrollSection>
              );
            })}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" data-section="contact" className="section-padding section-band-soft relative overflow-hidden">
        <div className="relative z-10 mx-auto max-w-[90rem]">
          <ScrollSection variant="fade-up">
            <SectionHeader
              label="Get in touch"
              title="Ready in an Afternoon"
              intro="Import your employees, pick a shift rule and invite your team. Fourteen days of full access, no commitments."
            />
          </ScrollSection>

          <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CONTACT.map((c, i) => (
              <ScrollSection key={c.label} variant="scale" delay={i * 80}>
                <a href={c.href} className="glass-card shimmer-hover group flex h-full flex-col items-center p-6 text-center no-underline">
                  <c.icon className={`mb-3 size-5 ${c.tone}`} aria-hidden />
                  <span className={`mb-1 text-xs font-semibold uppercase tracking-wider ${c.tone}`}>{c.label}</span>
                  <span className="break-all font-mono text-xs text-text-secondary group-hover:text-text-primary">{c.value}</span>
                </a>
              </ScrollSection>
            ))}
          </div>

          <ScrollSection variant="fade-up">
            <div className="gradient-border relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-cyan-500/5 via-violet-500/5 to-rose-500/5 px-6 py-14 text-center backdrop-blur-xl">
              <SectionLabel tone="violet">14-day trial · Every module included</SectionLabel>
              <h3 className="mb-4 text-3xl font-extrabold tracking-tight text-text-primary lg:text-4xl">Want to See It Live?</h3>
              <p className="mx-auto mb-8 max-w-xl text-text-secondary">
                Book a 30-minute walkthrough using your own shift pattern and leave policy, or jump straight in and set up your company today.
              </p>
              <div className="flex flex-col items-center justify-center gap-4 xs:flex-row">
                <CtaLink href={signupUrl} className="w-full xs:w-auto">
                  <Sparkles className="size-4" aria-hidden />
                  Start free trial
                </CtaLink>
                <CtaLink href="/demo/" primary={false} className="w-full xs:w-auto">
                  <CalendarCheck className="size-4" aria-hidden />
                  Book a demo
                </CtaLink>
              </div>
            </div>
          </ScrollSection>
        </div>
      </section>
    </>
  );
}

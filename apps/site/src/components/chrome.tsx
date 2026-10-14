import { ArrowRight, Heart, LogIn, Menu } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { BrandMark, ScrollSection } from '@trackrex/ui';
import { CONTACT_EMAIL, loginUrl, signupUrl } from '../content/site';
import { HeaderShell, NavLinks, ThemeToggle } from './site-effects';

const NAV = [
  ['Product', '/product/attendance/'],
  ['Pricing', '/pricing/'],
  ['Security', '/security/'],
  ['Help', '/help/'],
  ['API', '/api-docs/'],
] as const;

export function SiteHeader() {
  return (
    <HeaderShell>
      <div className="mx-auto max-w-[90rem] px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between lg:h-18">
          <Link href="/" aria-label="Trackrex home" className="group flex min-h-11 items-center gap-3 no-underline">
            <span className="flex size-8 items-center justify-center rounded-lg bg-surface shadow-lg shadow-cyan-500/30 ring-1 ring-border transition-all duration-300 group-hover:scale-105 group-hover:shadow-cyan-500/50">
              <BrandMark className="size-6" />
            </span>
            <span className="text-sm font-semibold text-text-primary transition-colors group-hover:text-accent-cyan">Trackrex</span>
          </Link>

          <div className="hidden items-center gap-3 md:flex">
            <NavLinks items={NAV} />
            <ThemeToggle />
            <a
              href={loginUrl}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-text-secondary no-underline transition-all duration-200 hover:bg-surface-hover hover:text-text-primary"
            >
              <LogIn className="size-4" aria-hidden />
              Sign in
            </a>
            <a
              href={signupUrl}
              className="inline-flex items-center gap-2 rounded-lg border border-accent-cyan/40 px-4 py-2 text-sm font-medium text-accent-cyan no-underline transition-all duration-200 hover:border-accent-cyan/60 hover:bg-accent-cyan/10"
            >
              Start free trial
              <ArrowRight className="size-4" aria-hidden />
            </a>
          </div>

          <div className="flex items-center gap-1 md:hidden">
            <ThemeToggle />
            <details className="relative">
              <summary
                className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                aria-label="Menu"
              >
                <Menu className="size-5" aria-hidden />
              </summary>
              <div className="absolute right-0 mt-2 flex w-64 flex-col gap-1 rounded-xl border border-border bg-bg-secondary/95 p-2 shadow-2xl shadow-black/30 backdrop-blur-xl">
                <NavLinks items={NAV} variant="menu" />
                <div className="my-1 border-t border-border" />
                <a href={loginUrl} className="flex min-h-11 items-center gap-2 rounded-lg px-3.5 text-sm font-medium text-text-secondary no-underline hover:bg-surface-hover hover:text-text-primary">
                  <LogIn className="size-4" aria-hidden />
                  Sign in
                </a>
                <a
                  href={signupUrl}
                  className="mt-1 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 text-sm font-semibold text-white no-underline shadow-lg shadow-cyan-500/30"
                >
                  Start free trial
                </a>
              </div>
            </details>
          </div>
        </div>
      </div>
    </HeaderShell>
  );
}

const FOOTER_LINKS: [string, string][] = [
  ['Attendance', '/product/attendance/'],
  ['Field tracking', '/product/field-tracking/'],
  ['Pricing', '/pricing/'],
  ['Security', '/security/'],
  ['Help', '/help/'],
  ['API', '/api-docs/'],
  ['Book a demo', '/demo/'],
  ['Contact', `mailto:${CONTACT_EMAIL}`],
];

export function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-border px-4 py-12">
      <div className="mx-auto flex max-w-[90rem] flex-col items-center gap-6 text-center">
        <Link href="/" className="group flex items-center gap-2.5 no-underline">
          <BrandMark className="size-7" />
          <span className="text-sm font-semibold text-text-primary group-hover:text-accent-cyan">Trackrex</span>
          <span className="font-mono text-xs text-text-muted">· Track It Easy</span>
        </Link>
        <nav aria-label="Footer" className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {FOOTER_LINKS.map(([label, href]) =>
            href.startsWith('mailto') ? (
              <a key={href} href={href} className="font-mono text-xs text-text-secondary no-underline transition-colors hover:text-accent-cyan">
                {label}
              </a>
            ) : (
              <Link key={href} href={href} className="font-mono text-xs text-text-secondary no-underline transition-colors hover:text-accent-cyan">
                {label}
              </Link>
            ),
          )}
        </nav>
        <p className="flex flex-wrap items-center justify-center gap-1.5 font-mono text-xs text-text-muted">
          Built with <Heart className="size-3.5 fill-rose-500 text-rose-500" aria-label="love" /> for teams in offices and on the road
          <span aria-hidden>·</span>
          <span className="text-cyan-400">Attendance</span>
          <span aria-hidden>·</span>
          <span className="text-violet-400">Field ops</span>
          <span aria-hidden>·</span>
          <span className="text-rose-400">Payroll</span>
        </p>
        <p className="font-mono text-xs text-text-muted">© {new Date().getFullYear()} Vintorex Corp · Trackrex is a registered trademark</p>
      </div>
    </footer>
  );
}

export function SectionLabel({ children, tone = 'cyan' }: { children: ReactNode; tone?: 'cyan' | 'violet' | 'emerald' | 'rose' }) {
  const tones = {
    cyan: 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400 [&>span]:bg-cyan-400',
    violet: 'border-violet-500/30 bg-violet-500/10 text-violet-400 [&>span]:bg-violet-400',
    emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 [&>span]:bg-emerald-400',
    rose: 'border-rose-500/30 bg-rose-500/10 text-rose-400 [&>span]:bg-rose-400',
  } as const;
  return (
    <div className={`mb-4 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 font-mono text-xs font-medium uppercase tracking-wider ${tones[tone]}`}>
      <span className="size-1.5 animate-pulse rounded-full" />
      {children}
    </div>
  );
}

export function SectionHeader({ label, title, intro }: { label?: string; title: ReactNode; intro?: ReactNode }) {
  return (
    <div className="mb-14 flex flex-col items-center text-center lg:mb-20">
      {label && <SectionLabel>{label}</SectionLabel>}
      <h2 className="hero-title mb-4 text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl xl:text-6xl">
        <span className="gradient-text">{title}</span>
      </h2>
      {intro && <p className="max-w-3xl text-base leading-relaxed text-text-secondary lg:text-lg xl:text-xl">{intro}</p>}
    </div>
  );
}

export function Section({
  title,
  intro,
  label,
  children,
  id,
  className,
}: {
  title: string;
  intro?: string;
  label?: string;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <section id={id} className={`section-padding relative ${className || ''}`}>
      <div className="relative z-10 mx-auto max-w-6xl">
        <ScrollSection variant="fade-up">
          <SectionHeader label={label} title={title} intro={intro} />
        </ScrollSection>
        <ScrollSection variant="fade-up" delay={100}>
          {children}
        </ScrollSection>
      </div>
    </section>
  );
}

const ctaBase =
  'inline-flex items-center justify-center gap-3 rounded-xl font-semibold no-underline transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary';

export const ctaPrimary = `${ctaBase} relative overflow-hidden bg-gradient-to-r from-cyan-500 to-violet-500 text-white shadow-lg shadow-cyan-500/30 hover:scale-[1.03] hover:shadow-cyan-500/50 active:scale-[0.98] before:absolute before:inset-0 before:bg-white/20 before:opacity-0 before:transition-opacity hover:before:opacity-100`;
export const ctaSecondary = `${ctaBase} border border-border bg-surface text-text-primary backdrop-blur-sm hover:border-border-bright hover:bg-surface-hover`;

export function CtaLink({
  href,
  children,
  primary = true,
  size = 'md',
  className = '',
}: {
  href: string;
  children: ReactNode;
  primary?: boolean;
  size?: 'md' | 'lg';
  className?: string;
}) {
  const sizing = size === 'lg' ? 'h-14 px-10 text-base' : 'h-12 px-6 text-sm';
  return (
    <a href={href} className={`${primary ? ctaPrimary : ctaSecondary} ${sizing} ${className}`}>
      <span className="relative inline-flex items-center gap-3">{children}</span>
    </a>
  );
}

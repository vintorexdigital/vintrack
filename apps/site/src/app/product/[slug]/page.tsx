import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CtaLink, Section } from '../../../components/chrome';
import { MODULES, moduleBySlug } from '../../../content/modules';
import { signupUrl } from '../../../content/site';

export const dynamicParams = false;
export function generateStaticParams() { return MODULES.map((m) => ({ slug: m.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const m = moduleBySlug((await params).slug);
  return m ? { title: m.name, description: m.tagline } : {};
}

export default async function ModulePage({ params }: { params: Promise<{ slug: string }> }) {
  const m = moduleBySlug((await params).slug);
  if (!m) notFound();
  return (
    <>
      <section className="relative overflow-hidden px-4 pb-10 pt-20 text-center sm:px-6 lg:pt-28">
        <div className="relative z-10 mx-auto max-w-4xl">
          <span className="mx-auto mb-6 flex size-14 items-center justify-center rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 shadow-lg shadow-cyan-500/20">
            <m.icon className="size-7" aria-hidden />
          </span>
          <h1 className="hero-title text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl"><span className="gradient-text">{m.name}</span></h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-text-secondary">{m.intro}</p>
          <div className="mt-8 flex justify-center"><CtaLink href={signupUrl} size="lg">Start free trial</CtaLink></div>
        </div>
      </section>
      <Section title="How it works" label="Module details">
        <dl className="grid gap-4 sm:grid-cols-2">
          {m.points.map((p) => <div key={p.title} className="glass-card shimmer-hover p-6"><dt className="font-semibold text-text-primary">{p.title}</dt><dd className="mt-2 text-sm leading-relaxed text-text-secondary">{p.body}</dd></div>)}
        </dl>
      </Section>
      <Section title="More modules" label="Product suite">
        <ul className="flex flex-wrap justify-center gap-2">{MODULES.filter((x) => x.slug !== m.slug).map((x) => <li key={x.slug}><a href={`/product/${x.slug}/`} className="tech-badge min-h-11 px-4 text-sm no-underline">{x.name}</a></li>)}</ul>
      </Section>
    </>
  );
}

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
      <section className="border-b border-rule bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-12">
          <m.icon className="size-8 text-brand" aria-hidden />
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">{m.name}</h1>
          <p className="mt-3 max-w-2xl text-lg text-muted">{m.intro}</p>
          <div className="mt-6"><CtaLink href={signupUrl}>Start free trial</CtaLink></div>
        </div>
      </section>
      <Section title="How it works">
        <dl className="grid gap-4 sm:grid-cols-2">
          {m.points.map((p) => <div key={p.title} className="rounded-card border border-rule bg-surface p-5"><dt className="font-semibold">{p.title}</dt><dd className="mt-1 text-sm text-muted">{p.body}</dd></div>)}
        </dl>
      </Section>
      <Section title="More modules">
        <ul className="flex flex-wrap gap-2">{MODULES.filter((x) => x.slug !== m.slug).map((x) => <li key={x.slug}><a href={`/product/${x.slug}/`} className="inline-flex min-h-11 items-center rounded-button border border-rule bg-surface px-4 text-sm font-medium text-ink no-underline hover:border-brand">{x.name}</a></li>)}</ul>
      </Section>
    </>
  );
}

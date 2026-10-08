import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ARTICLES, articleBySlug } from '../../../content/help';

export const dynamicParams = false;
export function generateStaticParams() { return ARTICLES.map((a) => ({ slug: a.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = articleBySlug((await params).slug);
  return a ? { title: a.title, description: a.summary } : {};
}

export default async function Article({ params }: { params: Promise<{ slug: string }> }) {
  const a = articleBySlug((await params).slug);
  if (!a) notFound();
  const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: a.title, description: a.summary };
  const items = a.body.filter((p) => p.startsWith('- '));
  let listed = false;
  return (
    <article className="prose-site mx-auto max-w-3xl px-4 py-12">
      <p className="text-sm"><Link href="/help/">Help center</Link> / {a.category}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{a.title}</h1>
      <p className="mt-2 text-muted">{a.summary}</p>
      <div className="mt-6">
        {a.body.map((p, i) => {
          if (p.startsWith('- ')) { if (listed) return null; listed = true; return <ul key={i}>{items.map((x) => <li key={x}>{x.slice(2)}</li>)}</ul>; }
          return <p key={i}>{p}</p>;
        })}
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </article>
  );
}

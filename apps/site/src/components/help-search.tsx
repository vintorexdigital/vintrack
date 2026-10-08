'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Article } from '../content/help';

export function HelpSearch({ articles }: { articles: Pick<Article, 'slug' | 'title' | 'summary' | 'category'>[] }) {
  const [q, setQ] = useState('');
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? articles.filter((a) => `${a.title} ${a.summary} ${a.category}`.toLowerCase().includes(t)) : articles;
  }, [q, articles]);
  const cats = [...new Set(hits.map((a) => a.category))];
  return (
    <div>
      <label htmlFor="help-q" className="sr-only">Search the help center</label>
      <input id="help-q" type="search" placeholder="Search articles" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-11 w-full max-w-xl rounded-input border border-rule bg-surface px-3" />
      <p className="mt-2 text-sm text-muted" role="status">{hits.length} {hits.length === 1 ? 'article' : 'articles'}</p>
      {cats.map((c) => (
        <section key={c} className="mt-6"><h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">{c}</h2>
          <ul className="divide-y divide-rule rounded-card border border-rule bg-surface">
            {hits.filter((a) => a.category === c).map((a) => <li key={a.slug}><Link href={`/help/${a.slug}/`} className="block px-4 py-3 no-underline hover:bg-canvas"><span className="font-medium text-ink">{a.title}</span><span className="block text-sm text-muted">{a.summary}</span></Link></li>)}
          </ul>
        </section>
      ))}
    </div>
  );
}

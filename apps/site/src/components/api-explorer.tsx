'use client';
import { useMemo, useState } from 'react';

export interface Endpoint { method: string; path: string; summary: string; tag: string }
/** Colour is only a tint; the method is always spelled out and the text is full-contrast ink. */
const TONE: Record<string, string> = { GET: 'bg-present/15 text-ink', POST: 'bg-brand/15 text-ink', PUT: 'bg-late/20 text-ink', PATCH: 'bg-late/20 text-ink', DELETE: 'bg-absent/15 text-ink' };

export function ApiExplorer({ endpoints }: { endpoints: Endpoint[] }) {
  const [q, setQ] = useState('');
  const hits = useMemo(() => { const t = q.trim().toLowerCase(); return t ? endpoints.filter((e) => `${e.method} ${e.path} ${e.summary} ${e.tag}`.toLowerCase().includes(t)) : endpoints; }, [q, endpoints]);
  return (
    <div>
      <label htmlFor="api-q" className="sr-only">Search endpoints</label>
      <input id="api-q" type="search" placeholder="Search endpoints, for example punches" value={q} onChange={(e) => setQ(e.target.value)} className="min-h-11 w-full max-w-xl rounded-input border border-rule bg-surface px-3" />
      <p className="mt-2 text-sm text-muted" role="status">{hits.length} of {endpoints.length} endpoints</p>
      <ul className="mt-3 divide-y divide-rule rounded-card border border-rule bg-surface">
        {hits.slice(0, 200).map((e) => (
          <li key={`${e.method} ${e.path}`} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
            <span className={`w-16 rounded-input px-2 py-0.5 text-center text-xs font-semibold ${TONE[e.method] ?? 'bg-canvas'}`}>{e.method}</span>
            <code className="break-all">{e.path}</code>
            <span className="min-w-0 text-muted [overflow-wrap:anywhere]">{e.summary}</span>
          </li>
        ))}
      </ul>
      {hits.length > 200 && <p className="mt-2 text-sm text-muted">Showing the first 200. Narrow the search.</p>}
    </div>
  );
}

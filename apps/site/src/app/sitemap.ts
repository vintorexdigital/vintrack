import type { MetadataRoute } from 'next';
import { ARTICLES } from '../content/help';
import { MODULES } from '../content/modules';
import { SITE_URL } from '../content/site';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const fixed = ['', '/pricing/', '/security/', '/help/', '/api-docs/', '/demo/'];
  return [...fixed, ...MODULES.map((m) => `/product/${m.slug}/`), ...ARTICLES.map((a) => `/help/${a.slug}/`)].map((p) => ({ url: `${SITE_URL}${p || '/'}` }));
}

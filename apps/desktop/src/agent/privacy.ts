import { createHash } from 'node:crypto';
import type { ActivityPolicy, WindowSample } from './types';

/**
 * What leaves the computer is decided here, before anything is stored or sent, from the company's policy.
 * The server applies the same rules again; this side exists so data the company has not allowed never travels.
 */
export function applyPolicy(s: Pick<WindowSample, 'app' | 'title' | 'url'>, p: ActivityPolicy): { app: string; title?: string; url?: string } {
  const out: { app: string; title?: string; url?: string } = { app: s.app.toLowerCase().replace(/\.exe$/, '') };
  if (s.title && p.windowTitles === 'keep') out.title = s.title.slice(0, 300);
  else if (s.title && p.windowTitles === 'hash') out.title = createHash('sha256').update(s.title).digest('hex').slice(0, 16);
  if (s.url) {
    try {
      const u = new URL(s.url.includes('://') ? s.url : `https://${s.url}`);
      out.url = p.fullUrls ? u.toString().slice(0, 2000) : `https://${u.hostname.replace(/^www\./, '')}`;
    } catch { /* not a URL: ignore */ }
  }
  return out;
}

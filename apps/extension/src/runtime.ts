import { ApiClient, OfflineQueue } from '@trackrex/client-core';
import { chromeStore } from './chrome-store';
import { Sampler, type BrowserView } from './sampler';

declare const __API_URL__: string;
export const API_URL = __API_URL__;

export const api = new ApiClient({ baseUrl: API_URL, store: chromeStore, newId: () => crypto.randomUUID(), client: 'desktop' });
export const queue = new OfflineQueue(chromeStore, () => crypto.randomUUID());

export const browserView: BrowserView = {
  async focusedUrl() {
    const w = await chrome.windows.getLastFocused();
    if (!w.focused) return null;
    const [tab] = await chrome.tabs.query({ active: true, windowId: w.id! });
    return tab?.url ?? null;
  },
  idleState: () => chrome.idle.queryState(120),
};

export const sampler = new Sampler({ api, queue, browser: browserView, now: () => Date.now() });

/** The service worker can be stopped at any time, so everything is re-read from storage when it wakes. */
let loaded = false;
export async function boot(): Promise<boolean> {
  if (!loaded) { await queue.load(); loaded = true; }
  // Restoring rotates the refresh token, so do it once per worker lifetime; after that a 401 refreshes by itself.
  if (api.signedIn) return true;
  const ok = await api.restore().catch(() => false);
  if (ok) await sampler.refresh().catch(() => undefined);
  return ok;
}

import type { KeyValueStore } from '@trackrex/client-core';

/** chrome.storage.local, which survives the service worker being stopped and restarted. */
export const chromeStore: KeyValueStore = {
  async get(k) { const r = await chrome.storage.local.get(k); return (r[k] as string | undefined) ?? null; },
  async set(k, v) { await chrome.storage.local.set({ [k]: v }); },
  async remove(k) { await chrome.storage.local.remove(k); },
};

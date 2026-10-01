import { ApiClient, ApiError, isNetworkError, OfflineQueue } from '@trackrex/client-core';

export interface ActivityPolicy { enabled: boolean; windowTitles: string; fullUrls: boolean; screenshots: boolean }

export interface BrowserView {
  /** The URL of the active tab in the focused browser window, or null when the browser is not in front. */
  focusedUrl(): Promise<string | null>;
  idleState(): Promise<'active' | 'idle' | 'locked'>;
}

export interface SamplerDeps { api: ApiClient; queue: OfflineQueue; browser: BrowserView; now: () => number; appName?: string }

export interface SamplerState { status: 'waiting' | 'recording' | 'off'; reason: string; policy: ActivityPolicy | null; lastSite: string | null; sentToday: number }

/** Only ordinary web pages count. Browser-internal pages, extension pages and local files are never recorded. */
export function siteFor(raw: string | null, fullUrls: boolean): string | null {
  if (!raw) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  return fullUrls ? u.toString().slice(0, 2000) : `${u.protocol}//${u.hostname.replace(/^www\./, '')}`;
}

/** One sample a minute: what site was in front during the minute that just ended, and was the person at the keyboard. */
export class Sampler {
  private policy: ActivityPolicy | null = null;
  private punchedIn = false;
  private state: SamplerState = { status: 'waiting', reason: 'Waiting for your company’s settings', policy: null, lastSite: null, sentToday: 0 };

  constructor(private readonly d: SamplerDeps) {}

  getState(): SamplerState { return this.state; }

  async refresh(): Promise<void> {
    try {
      const [policy, status] = await Promise.all([
        this.d.api.get<ActivityPolicy>('/v1/activity/policy'),
        this.d.api.get<{ state?: string }>('/v1/attendance/status'),
      ]);
      this.policy = policy;
      this.punchedIn = status.state === 'in';
    } catch (e) {
      if (!isNetworkError(e)) throw e;
    }
    this.state = !this.policy ? { ...this.state, status: 'waiting', reason: 'Waiting for your company’s settings' }
      : !this.policy.enabled ? { ...this.state, status: 'off', reason: 'Your company has desktop activity switched off', policy: this.policy }
      : !this.punchedIn ? { ...this.state, status: 'waiting', reason: 'Not recording: you are not punched in', policy: this.policy }
      : { ...this.state, status: 'recording', reason: 'Recording sites while you are punched in', policy: this.policy };
  }

  async sample(): Promise<boolean> {
    if (this.state.status !== 'recording' || !this.policy) return false;
    const url = siteFor(await this.d.browser.focusedUrl(), this.policy.fullUrls);
    if (!url) return false;
    const idle = (await this.d.browser.idleState()) !== 'active';
    const start = Math.floor(this.d.now() / 60_000) * 60_000 - 60_000;
    await this.d.queue.enqueue({
      method: 'POST', path: '/v1/activity/buckets', quiet: true, label: 'Site activity',
      body: { buckets: [{ start: new Date(start).toISOString(), seconds: 60, activeSeconds: idle ? 0 : 60, idleSeconds: idle ? 60 : 0, app: this.d.appName ?? 'chrome', url }] },
    });
    this.state = { ...this.state, lastSite: new URL(url).hostname.replace(/^www\./, ''), sentToday: this.state.sentToday + 1 };
    try { await this.d.queue.flush(this.d.api); } catch (e) { if (!(e instanceof ApiError) && !isNetworkError(e)) throw e; }
    return true;
  }
}

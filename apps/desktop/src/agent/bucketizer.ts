import type { ActivityBucket } from './types';

export interface Sampled { at: number; app: string; title?: string; url?: string; idle: boolean }

/**
 * Turns a stream of samples taken every few seconds into one bucket per minute and application. A sample is idle when
 * the person has been away from the keyboard longer than the idle threshold. Each sample is worth `intervalSeconds`.
 */
export class Bucketizer {
  private open = new Map<string, { start: number; app: string; title?: string; url?: string; seconds: number; idle: number }>();
  private minute = -1;

  constructor(private readonly intervalSeconds: number) {}

  /** Returns the buckets that are complete (their minute has passed). */
  add(s: Sampled): ActivityBucket[] {
    const minute = Math.floor(s.at / 60_000);
    const done = minute !== this.minute ? this.flush() : [];
    this.minute = minute;
    const key = `${s.app}|${s.url ?? ''}`;
    const b = this.open.get(key) ?? { start: minute * 60_000, app: s.app, ...(s.title ? { title: s.title } : {}), ...(s.url ? { url: s.url } : {}), seconds: 0, idle: 0 };
    b.seconds += this.intervalSeconds;
    if (s.idle) b.idle += this.intervalSeconds;
    this.open.set(key, b);
    return done;
  }

  /** Close whatever is open, for example before the app quits or the person punches out. */
  flush(): ActivityBucket[] {
    const out: ActivityBucket[] = [...this.open.values()].map((b) => {
      const seconds = Math.min(b.seconds, 60);
      const idleSeconds = Math.min(b.idle, seconds);
      return { start: new Date(b.start).toISOString(), seconds, activeSeconds: seconds - idleSeconds, idleSeconds, app: b.app, ...(b.title ? { title: b.title } : {}), ...(b.url ? { url: b.url } : {}) };
    });
    this.open.clear();
    return out;
  }
}

import type { ApiClient } from './api';
import type { OfflineQueue } from './queue';
import type { KeyValueStore } from './storage';

export interface TrackPoint { at: string; latitude: number; longitude: number; accuracy?: number | null; speed?: number | null; heading?: number | null; battery?: number | null; mock?: boolean }
export interface TrackingPolicy { enabled: boolean; intervalSeconds: number }

const KEY = 'trk.pings';
const MAX_BUFFER = 2000;
const BATCH = 100;

/**
 * Collects location points while the person is working and hands them to the offline queue in batches. The
 * server decides what to keep (only points inside working time, only if the company has tracking on), so this
 * side only avoids sending more than the company asked for.
 */
export class PingBuffer {
  private points: TrackPoint[] = [];
  private lastKept = 0;

  constructor(private readonly store: KeyValueStore) {}

  async load(): Promise<void> { this.points = JSON.parse((await this.store.get(KEY)) ?? '[]') as TrackPoint[]; }
  get size(): number { return this.points.length; }
  private save() { return this.store.set(KEY, JSON.stringify(this.points)); }

  /** Keep a point unless it is closer in time to the last kept one than the interval. */
  async add(p: TrackPoint, policy: TrackingPolicy): Promise<boolean> {
    if (!policy.enabled) return false;
    const t = new Date(p.at).getTime();
    if (t - this.lastKept < policy.intervalSeconds * 1000 * 0.8) return false;
    this.lastKept = t;
    this.points.push(p);
    if (this.points.length > MAX_BUFFER) this.points.splice(0, this.points.length - MAX_BUFFER);
    await this.save();
    return true;
  }

  /** Move buffered points into the persistent queue, oldest first, in batches the API accepts. */
  async drainTo(queue: OfflineQueue, deviceId?: string): Promise<number> {
    let moved = 0;
    while (this.points.length) {
      const batch = this.points.splice(0, BATCH);
      await queue.enqueue({
        method: 'POST', path: '/v1/location/pings', quiet: true, label: `Location (${batch.length} points)`,
        body: { ...(deviceId ? { deviceId } : {}), pings: batch.map((p) => ({ at: p.at, latitude: p.latitude, longitude: p.longitude, ...(p.accuracy != null ? { accuracy: Math.round(p.accuracy) } : {}), ...(p.speed != null && p.speed >= 0 ? { speed: p.speed } : {}), ...(p.battery != null ? { battery: p.battery } : {}), ...(p.mock ? { mockLocation: true } : {}) })) },
      });
      moved += batch.length;
    }
    await this.save();
    return moved;
  }
}

export async function fetchPolicy(api: ApiClient): Promise<TrackingPolicy> {
  return api.get<TrackingPolicy>('/v1/location/policy');
}

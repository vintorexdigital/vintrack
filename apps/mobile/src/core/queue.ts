import { ApiError, isNetworkError, type ApiClient } from './api';
import { base64ToBytes, type BlobStore } from './blobs';
import type { KeyValueStore } from './storage';

export interface QueuedRequest {
  /** Doubles as the Idempotency-Key, so a retry after a lost response replays instead of repeating. */
  id: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  /** An upload: the bytes live in the blob store under this id until the request succeeds. */
  blob?: { id: string; contentType: string };
  /** What the person sees if it fails, for example "Punch in at 09:31". */
  label: string;
  createdAt: string;
  attempts: number;
  /** Background data such as location points: a permanent refusal is dropped quietly instead of shown. */
  quiet?: boolean;
}

export interface FailedRequest extends QueuedRequest {
  error: string;
  code: string;
  failedAt: string;
}

export interface FlushResult {
  sent: number;
  failed: number;
  remaining: number;
  stoppedBy: 'network' | 'auth' | 'server' | null;
}

const KEY = 'trk.queue';
const FAILED_KEY = 'trk.queue.failed';
const MAX_FAILED = 50;

/**
 * Changes made while offline wait here, on disk, and go out in the order they were made. Network trouble and
 * server errors stop the run and keep everything; a clear refusal (validation, permission, a rule) moves just
 * that item to a "needs attention" list so it can never block the ones behind it for ever.
 */
export class OfflineQueue {
  private items: QueuedRequest[] = [];
  private failedItems: FailedRequest[] = [];
  private listeners = new Set<() => void>();
  private flushing: Promise<FlushResult> | null = null;

  constructor(private readonly store: KeyValueStore, private readonly newId: () => string, private readonly now: () => Date = () => new Date(), private readonly blobs?: BlobStore) {}

  async load(): Promise<void> {
    this.items = JSON.parse((await this.store.get(KEY)) ?? '[]') as QueuedRequest[];
    this.failedItems = JSON.parse((await this.store.get(FAILED_KEY)) ?? '[]') as FailedRequest[];
    this.emit();
  }

  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { for (const l of this.listeners) l(); }
  private async persist() {
    await this.store.set(KEY, JSON.stringify(this.items));
    await this.store.set(FAILED_KEY, JSON.stringify(this.failedItems.slice(-MAX_FAILED)));
    this.emit();
  }

  pending(): readonly QueuedRequest[] { return this.items; }
  failed(): readonly FailedRequest[] { return this.failedItems; }
  get size(): number { return this.items.length; }

  async enqueue(r: Omit<QueuedRequest, 'id' | 'createdAt' | 'attempts'> & { id?: string }): Promise<QueuedRequest> {
    const item: QueuedRequest = { ...r, id: r.id ?? this.newId(), createdAt: this.now().toISOString(), attempts: 0 };
    this.items.push(item);
    await this.persist();
    return item;
  }

  async dismissFailed(id: string): Promise<void> {
    this.failedItems = this.failedItems.filter((f) => f.id !== id);
    await this.persist();
  }

  /** One run at a time: a second call while one is running waits for and shares its result. */
  flush(api: ApiClient): Promise<FlushResult> {
    this.flushing ??= this.run(api).finally(() => { this.flushing = null; });
    return this.flushing;
  }

  private async run(api: ApiClient): Promise<FlushResult> {
    const out: FlushResult = { sent: 0, failed: 0, remaining: 0, stoppedBy: null };
    while (this.items.length) {
      const item = this.items[0]!;
      try {
        if (item.blob) {
          const b64 = await this.blobs?.get(item.blob.id);
          if (!b64) throw new ApiError(410, 'file_missing', 'The saved file is no longer on this phone.');
          await api.putBytes(item.path, base64ToBytes(b64), item.blob.contentType, { idempotencyKey: item.id });
          await this.blobs?.remove(item.blob.id);
        } else {
          await api.request(item.method, item.path, { ...(item.body !== undefined ? { body: item.body } : {}), idempotencyKey: item.id });
        }
        this.items.shift();
        out.sent++;
      } catch (e) {
        if (isNetworkError(e)) { out.stoppedBy = 'network'; break; }
        if (e instanceof ApiError) {
          if (e.status === 401) { out.stoppedBy = 'auth'; break; }
          const retryable = e.status >= 500 || e.status === 429 || e.code === 'request_in_progress';
          if (retryable) { item.attempts++; out.stoppedBy = 'server'; break; }
          this.items.shift();
          if (!item.quiet) this.failedItems.push({ ...item, error: e.message, code: e.code, failedAt: this.now().toISOString() });
          out.failed++;
        } else {
          throw e;
        }
      }
      await this.persist();
    }
    await this.persist();
    out.remaining = this.items.length;
    return out;
  }
}

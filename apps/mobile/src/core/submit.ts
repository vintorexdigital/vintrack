import { isNetworkError, type ApiClient } from './api';
import type { OfflineQueue } from './queue';

export interface SubmitDeps { api: ApiClient; queue: OfflineQueue; newId: () => string }
export type SubmitOutcome<T> = { status: 'sent'; result: T } | { status: 'queued' };

/**
 * For actions that make sense offline (starting or finishing a task): send now, or keep on the phone and send
 * later under the same idempotency key. Refusals from the server are raised so the person sees them at once.
 */
export async function sendOrQueue<T>(d: SubmitDeps, a: { path: string; body?: unknown; label: string }): Promise<SubmitOutcome<T>> {
  const id = d.newId();
  const queue = () => d.queue.enqueue({ id, method: 'POST', path: a.path, ...(a.body !== undefined ? { body: a.body } : {}), label: a.label });
  if (d.queue.size > 0) {
    await queue();
    void d.queue.flush(d.api).catch(() => undefined);
    return { status: 'queued' };
  }
  try {
    return { status: 'sent', result: await d.api.post<T>(a.path, a.body, { idempotencyKey: id }) };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    await queue();
    return { status: 'queued' };
  }
}

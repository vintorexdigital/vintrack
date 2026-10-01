import { isNetworkError, type ApiClient } from './api';
import { base64ToBytes, type BlobStore } from './blobs';
import type { OfflineQueue } from './queue';

export interface Position { latitude: number; longitude: number; accuracy?: number | null; mock?: boolean }
export interface PunchInput { type: 'in' | 'out'; position?: Position | null; comment?: string; deviceId?: string; /** JPEG, base64. */ selfie?: string }
export interface PunchResult { id: string; type: 'in' | 'out'; at: string; warnings: string[] }
export type PunchOutcome = { status: 'sent'; result: PunchResult } | { status: 'queued'; at: string };

export interface PunchDeps {
  api: ApiClient;
  queue: OfflineQueue;
  now: () => Date;
  newId: () => string;
  blobs?: BlobStore;
  /** Needed to name a selfie: the folder on the server is fixed by who is signed in. */
  ids?: { tenantId: string; userId: string };
}

const label = (type: 'in' | 'out', at: Date) => `Punch ${type} at ${at.toTimeString().slice(0, 5)}`;

function bodyFor(i: PunchInput, extra: Record<string, unknown>, selfieKey?: string) {
  return {
    type: i.type,
    ...(i.position ? { latitude: i.position.latitude, longitude: i.position.longitude, ...(i.position.accuracy != null ? { accuracy: i.position.accuracy } : {}), ...(i.position.mock ? { mockLocation: true } : {}) } : {}),
    ...(i.comment ? { comment: i.comment } : {}),
    ...(selfieKey ? { selfieKey } : {}),
    ...(i.deviceId ? { deviceId: i.deviceId, platform: 'android' } : {}),
    ...extra,
  };
}

/**
 * Punch from the phone. Online, the server stamps the time. If the server cannot be reached the punch is kept
 * with the time of the tap and sent later as an offline punch (the server accepts a client time only for those),
 * under the same idempotency key as the first attempt so a lost response never doubles it.
 * An older backlog goes first, so punches always reach the server in the order they were made.
 */
export async function punch(d: PunchDeps, input: PunchInput): Promise<PunchOutcome> {
  const tapped = d.now();
  const id = d.newId();
  let selfieKey: string | undefined;
  if (input.selfie) {
    if (!d.ids || !d.blobs) throw new Error('A selfie needs the signed-in ids and a blob store.');
    selfieKey = `selfies/${d.ids.tenantId}/${d.ids.userId}/${d.newId()}.jpg`;
    try {
      await d.api.putBytes(`/v1/files/${selfieKey}`, base64ToBytes(input.selfie), 'image/jpeg');
    } catch (e) {
      if (!isNetworkError(e)) throw e;
      // No connection: keep the photo on the phone and queue its upload ahead of the punch that names it.
      const blobId = d.newId();
      await d.blobs.put(blobId, input.selfie);
      await d.queue.enqueue({ method: 'PUT', path: `/v1/files/${selfieKey}`, blob: { id: blobId, contentType: 'image/jpeg' }, label: 'Selfie upload' });
    }
  }
  const queued = () => d.queue.enqueue({ id, method: 'POST', path: '/v1/attendance/punches', body: bodyFor(input, { at: tapped.toISOString(), offline: true }, selfieKey), label: label(input.type, tapped) });

  if (d.queue.size > 0) {
    await queued();
    void d.queue.flush(d.api).catch(() => undefined);
    return { status: 'queued', at: tapped.toISOString() };
  }
  try {
    const result = await d.api.post<PunchResult>('/v1/attendance/punches', bodyFor(input, {}, selfieKey), { idempotencyKey: id });
    return { status: 'sent', result };
  } catch (e) {
    if (!isNetworkError(e)) throw e;
    await queued();
    return { status: 'queued', at: tapped.toISOString() };
  }
}

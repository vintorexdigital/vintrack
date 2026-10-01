import { describe, expect, it } from 'vitest';
import { OfflineQueue } from './queue';
import { sendOrQueue } from './submit';
import { makeApi, seqId } from './test-utils';

describe('sendOrQueue', () => {
  it('sends when online, queues when the network is down, and raises refusals', async () => {
    let mode: 'ok' | 'down' | 'no' = 'ok';
    const m = makeApi({ 'POST /v1/field/tasks/t1/check-in': () => (mode === 'ok' ? { body: { status: 'in_progress' } } : mode === 'down' ? 'network-error' : { status: 422, body: { code: 'too_far_from_customer', detail: 'Too far.' } }) });
    await m.api.setSession({ accessToken: 'A', refreshToken: 'R' });
    const queue = new OfflineQueue(m.store, seqId);
    const deps = { api: m.api, queue, newId: seqId };
    expect(await sendOrQueue(deps, { path: '/v1/field/tasks/t1/check-in', body: {}, label: 'Start task' })).toMatchObject({ status: 'sent' });
    mode = 'down';
    expect(await sendOrQueue(deps, { path: '/v1/field/tasks/t1/check-in', body: {}, label: 'Start task' })).toEqual({ status: 'queued' });
    expect(queue.size).toBe(1);
    mode = 'no';
    await queue.flush(m.api);
    expect(queue.failed()[0]).toMatchObject({ code: 'too_far_from_customer' });
    await expect(sendOrQueue(deps, { path: '/v1/field/tasks/t1/check-in', label: 'x' })).rejects.toMatchObject({ code: 'too_far_from_customer' });
  });
});

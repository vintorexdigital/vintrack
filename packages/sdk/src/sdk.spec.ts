import { describe, expect, it, vi } from 'vitest';
import { departments } from '@trackrex/schemas';
import { createClient, TrackrexError } from './index.js';

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('sdk', () => {
  it('builds list queries from filters and sends the bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { data: [], nextCursor: null }));
    const c = createClient({ baseUrl: 'https://api.test', getToken: () => 'tok', fetch: fetchMock as never });
    await c.resource(departments).list({ q: 'sales', limit: 25, filters: [{ field: 'status', op: 'eq', value: 'active' }] });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.test/v1/org/departments?q=sales&limit=25&filter%5Bstatus%5D%5Beq%5D=active');
    expect((init as RequestInit).headers).toMatchObject({ authorization: 'Bearer tok', 'x-client': 'api' });
  });

  it('validates with the shared schema before sending and adds idempotency keys for apps', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(201, { id: '1', version: 1 }));
    const c = createClient({ baseUrl: 'https://api.test', getToken: () => null, client: 'mobile', fetch: fetchMock as never, newKey: () => 'key-1' });
    expect(() => c.resource(departments).create({})).toThrow();
    await c.resource(departments).create({ name: 'Ops' });
    expect((fetchMock.mock.calls[0]![1] as RequestInit).headers).toMatchObject({ 'idempotency-key': 'key-1', 'x-client': 'mobile' });
  });

  it('raises problem details and retries once after a refresh', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(401, { code: 'token_invalid', title: 'Not signed in', status: 401, type: 't' }))
      .mockResolvedValueOnce(json(200, { data: [], nextCursor: null }));
    const refreshed = vi.fn().mockResolvedValue(true);
    const c = createClient({ baseUrl: 'https://api.test', getToken: () => 't', fetch: fetchMock as never, onUnauthorized: refreshed });
    await c.resource(departments).list();
    expect(refreshed).toHaveBeenCalledOnce();
    const bad = createClient({ baseUrl: 'https://api.test', getToken: () => 't', fetch: vi.fn().mockResolvedValue(json(409, { code: 'duplicate', detail: 'exists', title: 'Conflict', status: 409, type: 't' })) as never });
    await expect(bad.resource(departments).get('x')).rejects.toMatchObject({ code: 'duplicate', status: 409 });
    expect(new TrackrexError(500, { code: 'x', title: 't', status: 500, type: 'a' }).message).toBe('t');
  });

  it('walks every page', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json(200, { data: [{ id: 'a' }], nextCursor: 'c1' }))
      .mockResolvedValueOnce(json(200, { data: [{ id: 'b' }], nextCursor: null }));
    const c = createClient({ baseUrl: 'https://api.test', getToken: () => null, fetch: fetchMock as never });
    const ids: string[] = [];
    for await (const r of c.resource(departments).all()) ids.push(r.id);
    expect(ids).toEqual(['a', 'b']);
  });
});

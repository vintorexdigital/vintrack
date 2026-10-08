import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, ownerSession, platformAdmin, signIn, type Harness } from './harness.js';

let h: Harness;
let co: Awaited<ReturnType<typeof ownerSession>>;
beforeAll(async () => {
  h = await boot();
  co = await ownerSession(h, await platformAdmin(h));
});
afterAll(async () => { await h.close(); });

const P = '/v1/org/departments';

describe('create and validation', () => {
  it('creates, normalises and applies defaults', async () => {
    const r = await h.api.post(P).set(co.auth).send({ name: '  Sales  ' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ name: 'Sales', status: 'active', version: 1 });
  });
  it('returns field-level validation errors', async () => {
    const r = await h.api.post(P).set(co.auth).send({ name: '', status: 'nope', extra: 1 });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('validation_failed');
    expect(r.body.errors.map((e: { path: string }) => e.path).sort()).toEqual(expect.arrayContaining(['name', 'status']));
  });
  it('rejects duplicates case-insensitively with a readable message', async () => {
    await h.api.post(P).set(co.auth).send({ name: 'Ops' });
    const dup = await h.api.post(P).set(co.auth).send({ name: 'ops' });
    expect(dup.status).toBe(409);
    expect(dup.body.detail).toContain('name');
  });
  it('writes an audit entry with field-level values', async () => {
    const r = await h.api.post(P).set(co.auth).send({ name: 'Audited' });
    const a = await h.api.get(`/v1/audit?entity=departments&entityId=${r.body.id}`).set(co.auth);
    expect(a.body.data[0]).toMatchObject({ action: 'created', actorName: 'Olive Owner', source: 'api' });
    expect(a.body.data[0].changes.name).toEqual({ old: null, new: 'Audited' });
  });
});

describe('update, versioning and soft delete', () => {
  it('updates with optimistic locking and records the diff', async () => {
    const c = await h.api.post(P).set(co.auth).send({ name: 'Lock me' });
    const u = await h.api.patch(`${P}/${c.body.id}`).set(co.auth).send({ name: 'Locked', version: 1 });
    expect(u.status).toBe(200);
    expect(u.body.version).toBe(2);
    const stale = await h.api.patch(`${P}/${c.body.id}`).set(co.auth).send({ name: 'Stale', version: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('version_conflict');
    const a = await h.api.get(`/v1/audit?entityId=${c.body.id}`).set(co.auth);
    expect(a.body.data.find((x: { action: string }) => x.action === 'updated').changes.name).toEqual({ old: 'Lock me', new: 'Locked' });
  });
  it('rejects unknown and immutable fields', async () => {
    const c = await h.api.post(P).set(co.auth).send({ name: 'Strict' });
    expect((await h.api.patch(`${P}/${c.body.id}`).set(co.auth).send({ tenantId: 'x' })).status).toBe(422);
  });
  it('soft deletes to a recycle bin, restores, and frees the unique name', async () => {
    const c = await h.api.post(P).set(co.auth).send({ name: 'Bin me' });
    const d = await h.api.delete(`${P}/${c.body.id}?reason=Merged`).set(co.auth);
    expect(d.body).toMatchObject({ deleteReason: 'Merged' });
    expect((await h.api.get(`${P}/${c.body.id}`).set(co.auth)).status).toBe(404);
    const bin = await h.api.get(`${P}?deleted=only`).set(co.auth);
    expect(bin.body.data.map((x: { id: string }) => x.id)).toContain(c.body.id);
    // name is reusable while the old row sits in the bin
    expect((await h.api.post(P).set(co.auth).send({ name: 'Bin me' })).status).toBe(201);
    // but restoring now collides
    const clash = await h.api.post(`${P}/${c.body.id}/restore`).set(co.auth);
    expect(clash.status).toBe(409);
    const c2 = await h.api.post(P).set(co.auth).send({ name: 'Bin two' });
    await h.api.delete(`${P}/${c2.body.id}`).set(co.auth);
    const back = await h.api.post(`${P}/${c2.body.id}/restore`).set(co.auth);
    expect(back.status).toBe(200);
    expect(back.body.deletedAt).toBeNull();
    expect((await h.api.post(`${P}/${c2.body.id}/restore`).set(co.auth)).status).toBe(409);
  });
});

describe('lists', () => {
  beforeAll(async () => {
    for (let i = 1; i <= 12; i++) await h.api.post('/v1/org/cost-centers').set(co.auth).send({ name: `CC ${String(i).padStart(2, '0')}`, status: i % 3 === 0 ? 'inactive' : 'active' });
  });
  const L = '/v1/org/cost-centers';

  it('paginates by cursor without gaps or repeats and counts on demand', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const r: { status: number; body: { data: { name: string }[]; nextCursor: string | null; total?: number } } = await h.api.get(`${L}?limit=5&sort=name${cursor ? `&cursor=${cursor}` : ''}`).set(co.auth);
      expect(r.status).toBe(200);
      expect(r.body.total).toBeUndefined();
      seen.push(...r.body.data.map((x: { name: string }) => x.name));
      cursor = r.body.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toHaveLength(12);
    expect([...seen].sort()).toEqual(seen);
    const withTotal = await h.api.get(`${L}?limit=5&include_total=true`).set(co.auth);
    expect(withTotal.body.total).toBe(12);
  });
  it('sorts descending and breaks ties on id', async () => {
    const r = await h.api.get(`${L}?sort=-status,name&limit=100`).set(co.auth);
    const rows = r.body.data as { status: string; name: string }[];
    expect(rows[0]!.status).toBe('inactive');
    const firstActive = rows.findIndex((x) => x.status === 'active');
    expect(rows.slice(firstActive).map((x) => x.name)).toEqual(rows.slice(firstActive).map((x) => x.name).sort());
  });
  it('filters with operators and searches', async () => {
    const inactive = await h.api.get(`${L}?filter[status][eq]=inactive&include_total=true`).set(co.auth);
    expect(inactive.body.total).toBe(4);
    const multi = await h.api.get(`${L}?filter[name][in]=CC 01,CC 02&include_total=true`).set(co.auth);
    expect(multi.body.total).toBe(2);
    const contains = await h.api.get(`${L}?filter[name][contains]=cc 1&include_total=true`).set(co.auth);
    expect(contains.body.total).toBe(3);
    const q = await h.api.get(`${L}?q=cc 07`).set(co.auth);
    expect(q.body.data.map((x: { name: string }) => x.name)).toEqual(['CC 07']);
    const bad = await h.api.get(`${L}?filter[status][gt]=1`).set(co.auth);
    expect(bad.status).toBe(400);
    expect((await h.api.get(`${L}?sort=secret`).set(co.auth)).status).toBe(400);
    expect((await h.api.get(`${L}?cursor=garbage`).set(co.auth)).body.code).toBe('invalid_cursor');
  });
  it('caps the page size', async () => {
    const r = await h.api.get(`${L}?limit=9999`).set(co.auth);
    expect(r.body.data.length).toBeLessThanOrEqual(100);
  });
  it('exports CSV and XLSX safely', async () => {
    await h.api.post(L).set(co.auth).send({ name: '=HYPERLINK("http://evil")' });
    const csv = await h.api.get(`${L}/export?format=csv&q=hyperlink`).set(co.auth).buffer(true);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('cost-centers-');
    expect(csv.text.split('\r\n')[0]).toBe('Cost center name,Status');
    expect(csv.text).toContain("'=HYPERLINK");
    const xlsx = await h.api.get(`${L}/export?format=xlsx`).set(co.auth).buffer(true).parse((res, cb) => { const chunks: Buffer[] = []; res.on('data', (c: Buffer) => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); });
    expect(xlsx.headers['content-type']).toContain('spreadsheetml');
    expect((xlsx.body as Buffer).subarray(0, 2).toString()).toBe('PK');
  });
  it('bulk deletes atomically', async () => {
    const list = await h.api.get(`${L}?limit=2&sort=name`).set(co.auth);
    const ids = list.body.data.map((x: { id: string }) => x.id);
    const ok = await h.api.post(`${L}/bulk`).set(co.auth).send({ action: 'delete', ids, reason: 'Cleanup' });
    expect(ok.body.results).toHaveLength(2);
    const failing = await h.api.post(`${L}/bulk`).set(co.auth).send({ action: 'delete', ids: [ids[0], '00000000-0000-4000-8000-000000000000'] });
    expect(failing.status).toBe(404);
    expect((await h.api.post(`${L}/bulk`).set(co.auth).send({ action: 'delete', ids: [] })).status).toBe(422);
  });
});

describe('idempotency', () => {
  it('replays the original response and rejects reuse for a different body', async () => {
    const key = `key-${Date.now()}`;
    const first = await h.api.post(P).set({ ...co.auth, 'Idempotency-Key': key }).send({ name: 'Once' });
    const second = await h.api.post(P).set({ ...co.auth, 'Idempotency-Key': key }).send({ name: 'Once' });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(second.headers['idempotent-replay']).toBe('true');
    const other = await h.api.post(P).set({ ...co.auth, 'Idempotency-Key': key }).send({ name: 'Different' });
    expect(other.status).toBe(422);
    expect(other.body.code).toBe('idempotency_key_reuse');
    const rows = await h.api.get(`${P}?q=once&include_total=true`).set(co.auth);
    expect(rows.body.total).toBe(1);
  });
  it('requires a key for mobile and desktop clients', async () => {
    const phone = await signIn(h, co.ownerEmail, co.slug, undefined, 'mobile');
    const r = await h.api.post(P).set(phone.auth).send({ name: 'From phone' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('idempotency_key_required');
    const ok = await h.api.post(P).set({ ...phone.auth, 'Idempotency-Key': `phone-${Date.now()}` }).send({ name: 'From phone' });
    expect(ok.status).toBe(201);
  });
  it('rolls the key back with a failed request so a retry can succeed', async () => {
    const key = `fail-${Date.now()}`;
    const bad = await h.api.post(P).set({ ...co.auth, 'Idempotency-Key': key }).send({ name: '' });
    expect(bad.status).toBe(422);
    const good = await h.api.post(P).set({ ...co.auth, 'Idempotency-Key': key }).send({ name: 'Retry works' });
    expect(good.status).toBe(201);
  });
});

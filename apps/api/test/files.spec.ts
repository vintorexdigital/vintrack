import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, signIn, type Harness } from './harness.js';
import { world, type World } from './fixtures.js';

let h: Harness;
let w: World;
beforeAll(async () => { h = await boot(); w = await world(h); });
afterAll(async () => { await h.close(); });

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]);
const ids = async (auth: Record<string, string>) => { const me = (await h.api.get('/v1/auth/me').set(auth)).body as { user: { id: string }; company: { id: string } }; return { tenant: me.company.id, user: me.user.id }; };
const put = (path: string, auth: Record<string, string>, body: Buffer, type = 'image/jpeg') => h.api.put(`/v1/files/${path}`).set({ ...auth, 'Idempotency-Key': crypto.randomUUID(), 'content-type': type }).send(body);

describe('selfie files', () => {
  it('stores a selfie in the signed-in person\'s own folder and serves it back to them', async () => {
    const e = await w.employee('File Owner');
    const s = await w.join(e);
    const { tenant, user } = await ids(s.auth);
    const path = `selfies/${tenant}/${user}/${crypto.randomUUID()}.jpg`;
    expect((await put(path, s.auth, JPEG)).body.key).toBe(path);
    const got = await h.api.get(`/v1/files/${path}`).set(s.auth).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(got.status).toBe(200);
    expect(got.headers['content-type']).toContain('image/jpeg');
    expect(Buffer.compare(got.body as Buffer, JPEG)).toBe(0);
  });

  it('refuses other folders, wrong types, fake images and oversize files', async () => {
    const a = await w.join(await w.employee('File A'));
    const b = await w.join(await w.employee('File B'));
    const ia = await ids(a.auth);
    const ib = await ids(b.auth);
    const name = `${crypto.randomUUID()}.jpg`;
    expect((await put(`selfies/${ia.tenant}/${ib.user}/${name}`, a.auth, JPEG)).status).toBe(403);
    expect((await put(`selfies/${crypto.randomUUID()}/${ia.user}/${name}`, a.auth, JPEG)).status).toBe(403);
    expect((await put(`selfies/${ia.tenant}/${ia.user}/${name}`, a.auth, JPEG, 'text/plain')).status).toBe(422);
    expect((await put(`selfies/${ia.tenant}/${ia.user}/${name}`, a.auth, Buffer.from('not an image'))).body.code).toBe('unsupported_media');
    expect((await put(`selfies/${ia.tenant}/${ia.user}/${name}`, a.auth, Buffer.concat([JPEG, Buffer.alloc(1_600_000)]))).body.code).toBe('file_too_large');
    expect((await put(`selfies/${ia.tenant}/${ia.user}/not-a-uuid.jpg`, a.auth, JPEG)).status).toBe(422);
  });

  it('lets a manager see a selfie attached to a reportee\'s punch, and nobody else', async () => {
    const mgr = await w.employee('File Boss');
    const emp = await w.employee('File Rep', { reportingManagerId: mgr.id });
    const stranger = await w.employee('File Stranger');
    const m = await w.join(mgr, ['manager']);
    const s = await w.join(emp);
    const x = await w.join(stranger);
    const mobile = await signIn(h, emp.workEmail, w.co.slug, undefined, 'mobile');
    const { tenant, user } = await ids(mobile.auth);
    const path = `selfies/${tenant}/${user}/${crypto.randomUUID()}.jpg`;
    await put(path, mobile.auth, JPEG);
    expect((await h.api.get(`/v1/files/${path}`).set(m.auth)).status).toBe(404); // not yet attached to a punch
    const p = await h.api.post('/v1/attendance/punches').set({ ...mobile.auth, 'Idempotency-Key': crypto.randomUUID() }).send({ selfieKey: path });
    expect(p.status, JSON.stringify(p.body)).toBe(201);
    expect((await h.api.get(`/v1/files/${path}`).set(m.auth)).status).toBe(200);
    expect((await h.api.get(`/v1/files/${path}`).set(x.auth)).status).toBe(404);
    void s;
  });
});

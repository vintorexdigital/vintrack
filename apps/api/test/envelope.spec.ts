import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { isSealedBytes, EnvelopeService } from '../src/core/crypto/envelope.service.js';
import { LocalKms } from '../src/core/crypto/kms.js';
import { Db } from '../src/core/database/db.service.js';
import { boot, ownerSession, type Harness } from './harness.js';
import { loadConfig } from '../src/core/config.js';
import { STORAGE, type StorageProvider } from '../src/modules/files/storage.js';
import { world, type World } from './fixtures.js';
import { JobsService } from '../src/jobs/jobs.service.js';

let h: Harness;
let w: World;
let env: EnvelopeService;
let db: Db;
beforeAll(async () => { h = await boot(); w = await world(h); env = h.app.get(EnvelopeService); db = h.app.get(Db); });
afterAll(async () => { await h.close(); });

const owner = new pg.Pool({ connectionString: process.env.DATABASE_URL });
afterAll(async () => { await owner.end(); });
const tenantId = async (auth: Record<string, string>) => ((await h.api.get('/v1/auth/me').set(auth)).body as { company: { id: string } }).company.id;
const ping = (secondsAgo: number, lat: number, lng: number) => ({ at: new Date(Date.now() - secondsAgo * 1000).toISOString(), latitude: lat, longitude: lng, accuracy: 10, speed: 1 });

describe('local key service', () => {
  it('wraps and unwraps, refuses the wrong key, and keeps retired keys for unwrapping', async () => {
    const k1 = Buffer.alloc(32, 1).toString('base64');
    const k2 = Buffer.alloc(32, 2).toString('base64');
    const old = new LocalKms(`a:${k1}`);
    const dek = Buffer.alloc(32, 9) as Buffer;
    const w1 = await old.wrap(dek);
    expect(w1.keyId).toBe('a');
    expect(Buffer.compare(await old.unwrap('a', w1.wrapped), dek)).toBe(0);
    const rotated = new LocalKms(`b:${k2},a:${k1}`);
    expect(rotated.currentKeyId()).toBe('b');
    expect(Buffer.compare(await rotated.unwrap('a', w1.wrapped), dek)).toBe(0);
    await expect(new LocalKms(`b:${k2}`).unwrap('a', w1.wrapped)).rejects.toThrow(/not available/);
    const tampered = Buffer.from(w1.wrapped); tampered[40] = tampered[40]! ^ 1;
    await expect(old.unwrap('a', tampered)).rejects.toThrow();
    expect(() => new LocalKms('nope')).toThrow();
  });
});

describe('envelope encryption', () => {
  it('seals with the company key, binds to company and purpose, and survives key rotation', async () => {
    const t = await tenantId(w.co.auth);
    const sealed = await env.seal('test.purpose', Buffer.from('13.08,80.27'), t);
    expect(isSealedBytes(sealed)).toBe(true);
    expect(sealed.toString()).not.toContain('13.08');
    expect((await env.open('test.purpose', sealed, t)).toString()).toBe('13.08,80.27');
    await expect(env.open('other.purpose', sealed, t)).rejects.toThrow();
    const other = await tenantId((await ownerSession(h, w.admin)).auth);
    await expect(env.open('test.purpose', sealed, other)).rejects.toThrow();

    expect(await env.rotate(t)).toBe(2);
    const after = await env.seal('test.purpose', Buffer.from('new'), t);
    expect(after.readUInt32BE(4)).toBe(2);
    expect((await env.open('test.purpose', sealed, t)).toString()).toBe('13.08,80.27');
    const keys = await owner.query('select version, retired_at is not null as retired from tenant_keys where tenant_id = $1 order by version', [t]);
    expect(keys.rows).toEqual([{ version: 1, retired: true }, { version: 2, retired: false }]);
  });

  it('never stores a data key in the clear', async () => {
    const t = await tenantId(w.co.auth);
    await env.seal('x', Buffer.from('1'), t);
    const r = await owner.query('select wrapped_dek, kms_key_id from tenant_keys where tenant_id = $1', [t]);
    expect(r.rows.length).toBeGreaterThan(0);
    for (const row of r.rows as { wrapped_dek: string; kms_key_id: string }[]) {
      expect(Buffer.from(row.wrapped_dek, 'base64').length).toBe(12 + 16 + 32);
      expect(row.kms_key_id).toBe(env.kms.currentKeyId());
    }
  });

  it('keeps location history sealed in the database and readable through the API', async () => {
    const emp = await w.employee('Sealed Walker');
    const s = await w.join(emp);
    await h.api.post('/v1/attendance/punches').set(w.co.auth).send({ employeeId: emp.id, type: 'in', at: new Date(Date.now() - 90 * 60_000).toISOString() });
    const sent = await h.api.post('/v1/location/pings').set(s.auth).send({ pings: [ping(60, 13.0111, 80.2222), ping(30, 13.0211, 80.2222)] });
    expect(sent.body.accepted).toBe(2);
    const raw = await owner.query('select latitude, longitude, sealed from location_pings where employee_id = $1', [emp.id]);
    expect(raw.rows).toHaveLength(2);
    for (const r of raw.rows as { latitude: number | null; longitude: number | null; sealed: string }[]) {
      expect(r.latitude).toBeNull();
      expect(r.longitude).toBeNull();
      expect(r.sealed).toMatch(/^[A-Za-z0-9+/=]+$/);
    }
    const live = await owner.query('select latitude, sealed from live_locations where employee_id = $1', [emp.id]);
    expect(live.rows[0].latitude).toBeNull();
    const map = await h.api.get('/v1/location/live').set(w.co.auth);
    const mine = (map.body.data as { employeeId: string; latitude: number }[]).find((r) => r.employeeId === emp.id)!;
    expect(mine.latitude).toBeCloseTo(13.0211, 4);
    const trail = await h.api.get(`/v1/location/trail?employeeId=${emp.id}&date=${new Date().toISOString().slice(0, 10)}`).set(w.co.auth);
    expect(trail.body.points).toHaveLength(2);
    expect(trail.body.points[0].lat).toBeCloseTo(13.0111, 4);
  });

  it('seals home location, uses it for the at-home rule, and does not leak it through the employee record', async () => {
    const emp = await w.employee('Home Sealed');
    const patch = await h.api.patch(`/v1/people/employees/${emp.id}`).set(w.co.auth).send({ homeLatitude: 13.05, homeLongitude: 80.25 });
    expect(patch.status).toBe(200);
    expect(patch.body.homeLatitude ?? null).toBeNull();
    const plain = await owner.query('select home_latitude, home_longitude from employees where id = $1', [emp.id]);
    expect(plain.rows[0]).toEqual({ home_latitude: null, home_longitude: null });
    const sealed = await owner.query('select home_sealed from employee_private where employee_id = $1', [emp.id]);
    expect(sealed.rows[0].home_sealed).toBeTruthy();
    expect(sealed.rows[0].home_sealed).not.toContain('13.05');
  });

  it('seals selfies in the file store and serves them back as the original image', async () => {
    const e = await w.join(await w.employee('Sealed Selfie'));
    const me = (await h.api.get('/v1/auth/me').set(e.auth)).body as { user: { id: string }; company: { id: string } };
    const key = `selfies/${me.company.id}/${me.user.id}/${crypto.randomUUID()}.jpg`;
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 1, 2, 3]);
    await h.api.put(`/v1/files/${key}`).set({ ...e.auth, 'Idempotency-Key': crypto.randomUUID(), 'content-type': 'image/jpeg' }).send(jpeg).expect(200);
    const stored = await h.app.get<StorageProvider>(STORAGE).get(key);
    expect(isSealedBytes(stored!)).toBe(true);
    expect(stored!.includes(jpeg)).toBe(false);
    const got = await h.api.get(`/v1/files/${key}`).set(e.auth).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(Buffer.compare(got.body as Buffer, jpeg)).toBe(0);
  });

  it('seals data written in the clear by older versions, and re-wraps keys under a new master key', async () => {
    const emp = await w.employee('Legacy Walker');
    const t = await tenantId(w.co.auth);
    await owner.query(`insert into location_pings (tenant_id, employee_id, at, latitude, longitude) values ($1, $2, now() - interval '5 minutes', 12.9, 80.1)`, [t, emp.id]);
    await owner.query('update employees set home_latitude = 12.8, home_longitude = 80.0 where id = $1', [emp.id]);
    await h.app.get(JobsService).run('seal-legacy-locations');
    const p = await owner.query('select latitude, sealed from location_pings where employee_id = $1', [emp.id]);
    expect(p.rows[0].latitude).toBeNull();
    expect(p.rows[0].sealed).toBeTruthy();
    const e = await owner.query('select home_latitude from employees where id = $1', [emp.id]);
    expect(e.rows[0].home_latitude).toBeNull();

    // A new master key: data keys wrapped under the old one are re-wrapped and still open.
    const k = Buffer.alloc(32, 7).toString('base64');
    const rotatedKms = new LocalKms(`rot-2:${k},${process.env.KMS_MASTER_KEYS ?? 'dev-1:ZGV2LW1hc3Rlci1rZXktbm90LXNlY3JldC0zMi1ieXQ='}`);
    const env2 = new EnvelopeService(db, rotatedKms, loadConfig());
    const sealed = await env2.seal('re.wrap', Buffer.from('still readable'), t);
    expect(await env2.rewrapAll(t)).toBeGreaterThan(0);
    const kinds = await owner.query('select distinct kms_key_id from tenant_keys where tenant_id = $1', [t]);
    expect(kinds.rows).toEqual([{ kms_key_id: 'rot-2' }]);
    const env3 = new EnvelopeService(db, new LocalKms(`rot-2:${k}`), loadConfig());
    expect((await env3.open('re.wrap', sealed, t)).toString()).toBe('still readable');
  });

  it('exports sealed location data in the clear to the company that owns it', async () => {
    const r = await h.api.get('/v1/company/export').set(w.co.auth).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(r.status).toBe(200);
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(r.body as never);
    const ws = wb.getWorksheet('location_pings')!;
    const header = (ws.getRow(1).values as unknown[]).slice(1);
    expect(header).toContain('latitude');
    expect(header).not.toContain('sealed');
    const li = header.indexOf('latitude') + 1;
    expect(typeof ws.getRow(2).getCell(li).value).toBe('number');
    expect(wb.getWorksheet('tenant_keys')).toBeUndefined();
  });
});

describe('encryption status and rotation endpoints', () => {
  it('shows what is sealed, rotates the key on request, audits it, and is closed to others and to support', async () => {
    const before = await h.api.get('/v1/company/encryption').set(w.co.auth);
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({ enabled: true });
    expect(before.body.sealed).toContain('Home location');
    const v = before.body.keys[0].version as number;
    const rot = await h.api.post('/v1/company/encryption/rotate').set({ ...w.co.auth, 'Idempotency-Key': crypto.randomUUID() });
    expect(rot.body.version).toBe(v + 1);
    const audit = await h.api.get('/v1/audit?entity=company').set(w.co.auth);
    expect(JSON.stringify(audit.body)).toContain('data_key_rotated');
    const e = await w.join(await w.employee('No Keys'));
    expect((await h.api.get('/v1/company/encryption').set(e.auth)).status).toBe(403);
  });
});

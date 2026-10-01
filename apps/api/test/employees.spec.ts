import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD, boot, ownerSession, platformAdmin, signIn, uniq, type Harness } from './harness.js';

let h: Harness;
let admin: Awaited<ReturnType<typeof platformAdmin>>;
beforeAll(async () => {
  h = await boot();
  admin = await platformAdmin(h);
});
afterAll(async () => { await h.close(); });

const E = '/v1/people/employees';
const emp = (name: string, extra: Record<string, unknown> = {}) => ({
  firstName: name, displayName: name, dateOfJoining: '2026-01-05',
  workEmail: `${name.toLowerCase().replace(/\s/g, '.')}.${uniq()}@example.com`, ...extra,
});

describe('employee records', () => {
  it('assigns sequential codes and keeps them per company', async () => {
    const a = await ownerSession(h, admin);
    const b = await ownerSession(h, admin);
    const e1 = await h.api.post(E).set(a.auth).send(emp('Asha'));
    const e2 = await h.api.post(E).set(a.auth).send(emp('Bala'));
    const other = await h.api.post(E).set(b.auth).send(emp('Chitra'));
    expect(e1.body.code).toBe('EMP-0001');
    expect(e2.body.code).toBe('EMP-0002');
    expect(other.body.code).toBe('EMP-0001');
  });

  it('validates mobile numbers and rejects duplicates', async () => {
    const co = await ownerSession(h, admin);
    expect((await h.api.post(E).set(co.auth).send(emp('Bad', { mobile: '12345' }))).status).toBe(422);
    await h.api.post(E).set(co.auth).send(emp('One', { mobile: '+919800000001' }));
    const dup = await h.api.post(E).set(co.auth).send(emp('Two', { mobile: '+919800000001' }));
    expect(dup.status).toBe(409);
  });

  it('enforces the seat limit and frees seats on exit and delete', async () => {
    const co = await ownerSession(h, admin, { seatLimit: 2 });
    const a = await h.api.post(E).set(co.auth).send(emp('Seat A'));
    const b = await h.api.post(E).set(co.auth).send(emp('Seat B'));
    const full = await h.api.post(E).set(co.auth).send(emp('Seat C'));
    expect(full.status).toBe(402);
    expect(full.body.code).toBe('seat_limit_reached');
    const usage = await h.api.get('/platform/v1/tenants/' + co.tenantId).set(admin.auth);
    expect(usage.body.usage.employeesActive).toBe(2);

    const exited = await h.api.post(`${E}/${a.body.id}/exit`).set(co.auth).send({ dateOfExit: '2026-06-30', reason: 'Resigned' });
    expect(exited.body).toMatchObject({ status: 'exited', dateOfExit: '2026-06-30' });
    expect((await h.api.post(`${E}/${a.body.id}/exit`).set(co.auth).send({ dateOfExit: '2026-06-30' })).status).toBe(409);
    expect((await h.api.post(E).set(co.auth).send(emp('Seat C'))).status).toBe(201);

    const early = await h.api.post(`${E}/${b.body.id}/exit`).set(co.auth).send({ dateOfExit: '2025-01-01' });
    expect(early.status).toBe(422);
    await h.api.delete(`${E}/${b.body.id}?reason=Duplicate`).set(co.auth);
    const after = await h.api.get('/platform/v1/tenants/' + co.tenantId).set(admin.auth);
    expect(after.body.usage.employeesActive).toBe(1);
    expect((await h.api.post(`${E}/${b.body.id}/restore`).set(co.auth)).status).toBe(200);
  });

  it('prevents loops in the reporting line', async () => {
    const co = await ownerSession(h, admin);
    const a = (await h.api.post(E).set(co.auth).send(emp('Boss'))).body;
    const b = (await h.api.post(E).set(co.auth).send(emp('Mid', { reportingManagerId: a.id }))).body;
    const c = (await h.api.post(E).set(co.auth).send(emp('Junior', { reportingManagerId: b.id }))).body;
    const loop = await h.api.patch(`${E}/${a.id}`).set(co.auth).send({ reportingManagerId: c.id });
    expect(loop.status).toBe(422);
    expect(loop.body.errors[0].path).toBe('reportingManagerId');
    expect((await h.api.patch(`${E}/${a.id}`).set(co.auth).send({ reportingManagerId: a.id })).status).toBe(422);
  });

  it('bulk imports with a validation preview and row-level errors', async () => {
    const co = await ownerSession(h, admin);
    const rows = [
      emp('Imp One', { mobile: '+919811111111' }),
      { firstName: 'No name' }, // invalid
      emp('Imp Two', { mobile: '+919811111111' }), // duplicate in file
      emp('Imp Three', { mobile: '+919822222222' }),
    ];
    const dry = await h.api.post(`${E}/import`).set(co.auth).send({ rows, dryRun: true });
    expect(dry.body.total).toBe(4);
    expect(dry.body.imported).toBe(0);
    expect(dry.body.issues.some((i: { row: number }) => i.row === 2)).toBe(true);
    expect(dry.body.issues.some((i: { row: number; field: string }) => i.row === 3 && i.field === 'mobile')).toBe(true);
    const blocked = await h.api.post(`${E}/import`).set(co.auth).send({ rows, dryRun: false });
    expect(blocked.body.imported).toBe(0);
    const good = await h.api.post(`${E}/import`).set(co.auth).send({ rows: [rows[0], rows[3]], dryRun: false });
    expect(good.body.imported).toBe(2);
    const again = await h.api.post(`${E}/import`).set(co.auth).send({ rows: [rows[0]], dryRun: true });
    expect(again.body.issues[0].message).toContain('already belongs');
    const tpl = await h.api.get(`${E}/import/template`).set(co.auth);
    expect(tpl.body.columns.find((c: { key: string }) => c.key === 'dateOfJoining').required).toBe(true);
  });

  it('transfers reportees to another manager', async () => {
    const co = await ownerSession(h, admin);
    const m1 = (await h.api.post(E).set(co.auth).send(emp('Old Manager'))).body;
    const m2 = (await h.api.post(E).set(co.auth).send(emp('New Manager'))).body;
    await h.api.post(E).set(co.auth).send(emp('R1', { reportingManagerId: m1.id }));
    await h.api.post(E).set(co.auth).send(emp('R2', { reportingManagerId: m1.id }));
    const r = await h.api.post(`${E}/transfer`).set(co.auth).send({ fromManagerId: m1.id, toManagerId: m2.id });
    expect(r.body.moved).toBe(2);
    const list = await h.api.get(`${E}?filter[reportingManagerId][eq]=${m2.id}&include_total=true`).set(co.auth);
    expect(list.body.total).toBe(2);
  });
});

describe('roles and data scopes', () => {
  it('limits managers to their reportees and employees to themselves', async () => {
    const co = await ownerSession(h, admin);
    const mk = async (name: string, extra = {}) => (await h.api.post(E).set(co.auth).send(emp(name, extra))).body as { id: string; workEmail: string };
    const mgr = await mk('Manager M');
    const mid = await mk('Mid Level', { reportingManagerId: mgr.id });
    const low = await mk('Low Level', { reportingManagerId: mid.id });
    const other = await mk('Other Team');

    const join = async (e: { id: string; workEmail: string }, roleKeys: string[]) => {
      const inv = await h.api.post(`${E}/${e.id}/invite`).set(co.auth).send({ roleKeys });
      expect(inv.status, JSON.stringify(inv.body)).toBe(201);
      const acc = await h.api.post('/v1/auth/invitations/accept').set('x-client', 'api').send({ token: inv.body.devToken, name: 'Person', password: PASSWORD });
      expect(acc.body.status).toBe('ok');
      return signIn(h, e.workEmail, co.slug);
    };
    const mgrS = await join(mgr, ['manager']);
    const lowS = await join(low, ['employee']);

    // manager sees themselves and everyone below them, but not the other team
    const seenByMgr = await h.api.get(`${E}?limit=100`).set(mgrS.auth);
    expect(seenByMgr.body.data.map((x: { id: string }) => x.id).sort()).toEqual([mgr.id, mid.id, low.id].sort());
    // "direct reportees only" narrows further
    const direct = await h.api.get(`${E}?direct_only=true&limit=100`).set(mgrS.auth);
    expect(direct.body.data.map((x: { id: string }) => x.id).sort()).toEqual([mgr.id, mid.id].sort());
    expect((await h.api.get(`${E}/${other.id}`).set(mgrS.auth)).status).toBe(404);
    expect((await h.api.get(`${E}/${low.id}`).set(mgrS.auth)).status).toBe(200);

    // employee sees only themselves
    const seenByLow = await h.api.get(`${E}?limit=100`).set(lowS.auth);
    expect(seenByLow.body.data.map((x: { id: string }) => x.id)).toEqual([low.id]);
    expect((await h.api.get(`${E}/${mgr.id}`).set(lowS.auth)).status).toBe(404);

    // writes need permissions the role does not have
    const denied = await h.api.post(E).set(lowS.auth).send(emp('Nope'));
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('permission_denied');
    expect((await h.api.patch(`${E}/${low.id}`).set(lowS.auth).send({ displayName: 'Self edit' })).status).toBe(403);
    expect((await h.api.post('/v1/org/departments').set(mgrS.auth).send({ name: 'No' })).status).toBe(403);
    // everyone can read organization reference data
    expect((await h.api.get('/v1/org/departments').set(lowS.auth)).status).toBe(200);
    // export respects scope too
    expect((await h.api.get(`${E}/export`).set(lowS.auth)).status).toBe(403);
  });

  it('cannot grant ownership through invitations or role edits', async () => {
    const co = await ownerSession(h, admin);
    const inv = await h.api.post('/v1/company/invitations').set(co.auth).send({ email: 'x@example.com', roleKeys: ['owner'] });
    expect(inv.status).toBe(403);
    expect(inv.body.code).toBe('owner_not_grantable');
  });

  it('transfers ownership only with the new owner accepting', async () => {
    const co = await ownerSession(h, admin);
    const inv = await h.api.post('/v1/company/invitations').set(co.auth).send({ email: 'heir@example.com', roleKeys: ['admin'] });
    await h.api.post('/v1/auth/invitations/accept').set('x-client', 'api').send({ token: inv.body.devToken, name: 'Heir', password: PASSWORD });
    const heir = await signIn(h, 'heir@example.com', co.slug);
    const members = await h.api.get('/v1/company/members').set(co.auth);
    const heirM = members.body.find((m: { email: string }) => m.email === 'heir@example.com');
    expect((await h.api.post('/v1/company/ownership-transfer').set(heir.auth).send({ toMembershipId: heirM.id })).status).toBe(403);
    const start = await h.api.post('/v1/company/ownership-transfer').set(co.auth).send({ toMembershipId: heirM.id });
    expect(start.status).toBe(201);
    expect((await h.api.post(`/v1/company/ownership-transfer/${start.body.id}/accept`).set(co.auth)).status).toBe(403);
    expect((await h.api.post(`/v1/company/ownership-transfer/${start.body.id}/accept`).set(heir.auth)).status).toBe(200);
    const after = await h.api.get('/v1/company/members').set(heir.auth);
    expect(after.body.find((m: { email: string }) => m.email === 'heir@example.com').isOwner).toBe(true);
    expect(after.body.find((m: { email: string }) => m.email === co.ownerEmail).isOwner).toBe(false);
  });
});

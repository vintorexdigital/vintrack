import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD, boot, ownerSession, platformAdmin, signIn, type Harness } from './harness.js';

let h: Harness;
let co: Awaited<ReturnType<typeof ownerSession>>;
beforeAll(async () => {
  h = await boot();
  co = await ownerSession(h, await platformAdmin(h));
});
afterAll(async () => { await h.close(); });

describe('settings registry', () => {
  it('lists definitions by section with defaults and current overrides', async () => {
    const r = await h.api.get('/v1/settings').set(co.auth);
    expect(r.status).toBe(200);
    expect(r.body.definitions.length).toBeGreaterThan(100);
    expect(new Set(r.body.definitions.map((d: { section: string }) => d.section))).toContain('Attendance');
    expect(r.body.values).toEqual({});
  });
  it('validates values against the definition and audits changes', async () => {
    expect((await h.api.put('/v1/settings/attendance.month_start_day').set(co.auth).send({ value: 26 })).status).toBe(200);
    expect((await h.api.put('/v1/settings/attendance.month_start_day').set(co.auth).send({ value: 40 })).status).toBe(422);
    expect((await h.api.put('/v1/settings/geo.checkin_mode').set(co.auth).send({ value: 'maybe' })).status).toBe(422);
    expect((await h.api.put('/v1/settings/not.real').set(co.auth).send({ value: 1 })).status).toBe(404);
    const all = await h.api.get('/v1/settings').set(co.auth);
    expect(all.body.values['attendance.month_start_day']).toBe(26);
    const audit = await h.api.get('/v1/audit?entity=settings').set(co.auth);
    expect(audit.body.data[0].changes['attendance.month_start_day']).toEqual({ old: null, new: 26 });
    const reset = await h.api.delete('/v1/settings/attendance.month_start_day').set(co.auth);
    expect(reset.body.value).toBe(1);
  });
  it('honours sign-in method switches', async () => {
    await h.api.put('/v1/settings/auth.method.password').set(co.auth).send({ value: false });
    const login = await h.api.post('/v1/auth/login').set('x-client', 'api').send({ identifier: co.ownerEmail, password: PASSWORD, tenant: co.slug });
    expect(login.status).toBe(403);
    expect(login.body.code).toBe('method_disabled');
    await h.api.put('/v1/settings/auth.method.password').set(co.auth).send({ value: true });
  });
});

describe('custom roles', () => {
  it('creates a role, validates grants and shows effective access', async () => {
    const perms = await h.api.get('/v1/permissions').set(co.auth);
    expect(perms.body.some((p: { key: string }) => p.key === 'leave.request.approve')).toBe(true);
    const bad = await h.api.post('/v1/roles').set(co.auth).send({ key: 'auditor', name: 'Auditor', grants: [{ permission: 'made.up.thing', scope: 'all' }] });
    expect(bad.status).toBe(422);
    const noScope = await h.api.post('/v1/roles').set(co.auth).send({ key: 'auditor', name: 'Auditor', grants: [{ permission: 'company.settings.read', scope: 'team' }] });
    expect(noScope.status).toBe(422);
    const ok = await h.api.post('/v1/roles').set(co.auth).send({ key: 'org_viewer', name: 'Org viewer', grants: [{ permission: 'org.department.read', scope: 'all' }, { permission: 'hr.employee.read', scope: 'department' }] });
    expect(ok.status).toBe(201);
    expect((await h.api.post('/v1/roles').set(co.auth).send({ key: 'org_viewer', name: 'Dup', grants: [] })).status).toBe(409);
    expect((await h.api.post('/v1/roles').set(co.auth).send({ key: 'admin', name: 'Dup', grants: [] })).status).toBe(409);
    const eff = await h.api.get('/v1/roles/effective?roleKeys=org_viewer').set(co.auth);
    expect(eff.body).toEqual(expect.arrayContaining([{ permission: 'hr.employee.read', scope: 'department' }]));
    expect((await h.api.patch('/v1/roles/admin').set(co.auth).send({ name: 'x' })).status).toBe(409);
  });
  it('applies a custom role immediately and refuses to delete one in use', async () => {
    const inv = await h.api.post('/v1/company/invitations').set(co.auth).send({ email: 'viewer@example.com', roleKeys: ['org_viewer'] });
    await h.api.post('/v1/auth/invitations/accept').set('x-client', 'api').send({ token: inv.body.devToken, name: 'Viewer', password: PASSWORD });
    const v = await signIn(h, 'viewer@example.com', co.slug);
    expect((await h.api.get('/v1/org/departments').set(v.auth)).status).toBe(200);
    expect((await h.api.get('/v1/org/teams').set(v.auth)).status).toBe(403);
    await h.api.patch('/v1/roles/org_viewer').set(co.auth).send({ grants: [{ permission: 'org.team.read', scope: 'all' }] });
    expect((await h.api.get('/v1/org/teams').set(v.auth)).status).toBe(200);
    expect((await h.api.get('/v1/org/departments').set(v.auth)).status).toBe(403);
    const del = await h.api.delete('/v1/roles/org_viewer').set(co.auth);
    expect(del.status).toBe(409);
    expect(del.body.code).toBe('role_in_use');
    // non-managers cannot read the role editor
    expect((await h.api.get('/v1/roles').set(v.auth)).status).toBe(403);
  });
});

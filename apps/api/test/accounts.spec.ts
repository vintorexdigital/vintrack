import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASSWORD, boot, createCompany, ownerSession, platformAdmin, signIn, uniq, type Harness } from './harness.js';

let h: Harness;
let admin: Awaited<ReturnType<typeof platformAdmin>>;
beforeAll(async () => {
  h = await boot();
  admin = await platformAdmin(h);
});
afterAll(async () => { await h.close(); });

describe('health and errors', () => {
  it('serves health and returns problem+json for unknown routes', async () => {
    expect((await h.api.get('/health')).body.status).toBe('ok');
    const r = await h.api.get('/v1/nope').set('x-client', 'api');
    expect(r.status).toBe(404);
    expect(r.headers['content-type']).toContain('application/problem+json');
    expect(r.body).toMatchObject({ status: 404, code: 'route_not_found' });
    expect(r.headers['x-request-id']).toBeTruthy();
    const noAuth = await h.api.get('/v1/company');
    expect(noAuth.status).toBe(401);
    expect(noAuth.body).toMatchObject({ status: 401, code: 'unauthorized' });
  });
});

describe('platform realm', () => {
  it('requires two-factor enrolment before issuing tokens', async () => {
    const email = `${uniq('new')}@vintorex.test`;
    const { PlatformAuthService } = await import('../src/modules/platform/platform-auth.service.js');
    await h.app.get(PlatformAuthService).createStaff({ email, name: 'N', role: 'support', password: PASSWORD });
    const r = await h.api.post('/platform/v1/auth/login').send({ email, password: PASSWORD });
    expect(r.body.status).toBe('totp_setup');
    expect(r.body.accessToken).toBeUndefined();
    const { totpAt } = await import('../src/core/auth/totp.js');
    const wrong = await h.api.post('/platform/v1/auth/totp/enroll').set('Authorization', `Bearer ${r.body.setupToken}`).send({ code: '000000' });
    expect(wrong.status).toBe(401);
    const ok = await h.api.post('/platform/v1/auth/totp/enroll').set('Authorization', `Bearer ${r.body.setupToken}`).send({ code: totpAt(r.body.secret, Date.now()) });
    expect(ok.body.status).toBe('ok');
    // a pending token cannot reach platform data
    const blocked = await h.api.get('/platform/v1/tenants').set('Authorization', `Bearer ${r.body.setupToken}`);
    expect(blocked.status).toBe(401);
    expect(blocked.body.code).toBe('two_factor_required');
  });

  it('rejects bad credentials and wrong totp', async () => {
    const bad = await h.api.post('/platform/v1/auth/login').send({ email: admin.email, password: 'wrong-password' });
    expect(bad.status).toBe(401);
    const noTotp = await h.api.post('/platform/v1/auth/login').send({ email: admin.email, password: PASSWORD });
    expect(noTotp.body.status).toBe('totp_required');
    const badTotp = await h.api.post('/platform/v1/auth/login').send({ email: admin.email, password: PASSWORD, totp: '123456' });
    expect(badTotp.status).toBe(401);
  });

  it('keeps token audiences separate', async () => {
    const co = await ownerSession(h, admin);
    expect((await h.api.get('/platform/v1/tenants').set(co.auth)).status).toBe(401);
    expect((await h.api.get('/v1/company').set(admin.auth)).status).toBe(401);
  });

  it('limits what each staff role can do', async () => {
    const analyst = await platformAdmin(h, 'analyst');
    expect((await h.api.get('/platform/v1/tenants').set(analyst.auth)).status).toBe(200);
    const denied = await h.api.post('/platform/v1/tenants').set(analyst.auth).send({});
    expect(denied.status).toBe(403);
  });
});

describe('company lifecycle and sign-in', () => {
  it('provisions a company and lets the owner sign in', async () => {
    const co = await createCompany(h, admin, { name: 'Meridian' });
    const s = await signIn(h, co.ownerEmail, co.slug);
    const me = await h.api.get('/v1/auth/me').set(s.auth);
    expect(me.body.company).toMatchObject({ slug: co.slug, name: 'Meridian', status: 'trial' });
    expect(me.body.membership.isOwner).toBe(true);
    expect(me.body.permissions.length).toBeGreaterThan(20);
    expect(me.body.modules).toContain('attendance');
  });

  it('rejects duplicate and reserved slugs', async () => {
    const co = await createCompany(h, admin);
    const dup = await h.api.post('/platform/v1/tenants').set(admin.auth).send({ name: 'X Co', slug: co.slug, owner: { name: 'O', email: 'o@example.com', password: PASSWORD } });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('slug_taken');
    const reserved = await h.api.post('/platform/v1/tenants').set(admin.auth).send({ name: 'X Co', slug: 'admin', owner: { name: 'O', email: 'o@example.com' } });
    expect(reserved.status).toBe(422);
  });

  it('locks an account after repeated failures and does not reveal which accounts exist', async () => {
    const co = await createCompany(h, admin);
    const wrongUser = await h.api.post('/v1/auth/login').send({ identifier: 'nobody@example.com', password: 'x' });
    const wrongPass = await h.api.post('/v1/auth/login').send({ identifier: co.ownerEmail, password: 'x' });
    expect(wrongUser.body.code).toBe('invalid_credentials');
    expect(wrongPass.body.code).toBe('invalid_credentials');
    expect(wrongUser.body.detail).toBe(wrongPass.body.detail);
    for (let i = 0; i < 4; i++) await h.api.post('/v1/auth/login').send({ identifier: co.ownerEmail, password: 'x' });
    const locked = await h.api.post('/v1/auth/login').send({ identifier: co.ownerEmail, password: PASSWORD });
    expect(locked.status).toBe(423);
  });

  it('signs in with an email OTP', async () => {
    const co = await createCompany(h, admin);
    const req = await h.api.post('/v1/auth/otp/request').send({ identifier: co.ownerEmail });
    expect(req.body.sent).toBe(true);
    const bad = await h.api.post('/v1/auth/otp/verify').set('x-client', 'api').send({ identifier: co.ownerEmail, code: '000000', tenant: co.slug });
    expect(bad.status).toBe(401);
    const ok = await h.api.post('/v1/auth/otp/verify').set('x-client', 'api').send({ identifier: co.ownerEmail, code: req.body.devCode, tenant: co.slug });
    expect(ok.body.status).toBe('ok');
    // codes are single use
    const again = await h.api.post('/v1/auth/otp/verify').set('x-client', 'api').send({ identifier: co.ownerEmail, code: req.body.devCode, tenant: co.slug });
    expect(again.status).toBe(401);
    // unknown identifiers get the same response shape and no message is sent
    const before = h.messaging.sent.length;
    const unknown = await h.api.post('/v1/auth/otp/request').send({ identifier: 'ghost@example.com' });
    expect(unknown.body).toEqual({ sent: true });
    expect(h.messaging.sent.length).toBe(before);
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    const co = await createCompany(h, admin);
    const s = await signIn(h, co.ownerEmail, co.slug);
    const r1 = await h.api.post('/v1/auth/refresh').set('x-client', 'api').send({ refreshToken: s.refresh });
    expect(r1.status).toBe(200);
    const reuse = await h.api.post('/v1/auth/refresh').set('x-client', 'api').send({ refreshToken: s.refresh });
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('refresh_reuse');
    const afterReuse = await h.api.post('/v1/auth/refresh').set('x-client', 'api').send({ refreshToken: r1.body.refreshToken });
    expect(afterReuse.status).toBe(401);
  });

  it('keeps the refresh token in an httpOnly cookie for web clients', async () => {
    const co = await createCompany(h, admin);
    const r = await h.api.post('/v1/auth/login').send({ identifier: co.ownerEmail, password: PASSWORD, tenant: co.slug });
    expect(r.body.refreshToken).toBeUndefined();
    const cookie = (r.headers['set-cookie'] as unknown as string[])[0]!;
    expect(cookie).toContain('trk_rt=');
    expect(cookie).toContain('HttpOnly');
    const refreshed = await h.api.post('/v1/auth/refresh').set('Cookie', cookie.split(';')[0]!).send({});
    expect(refreshed.status).toBe(200);
  });

  it('enforces the company lifecycle: suspended is read-only, cancelled is closed', async () => {
    const co = await ownerSession(h, admin);
    const noReason = await h.api.post(`/platform/v1/tenants/${co.tenantId}/lifecycle`).set(admin.auth).send({ action: 'suspend' });
    expect(noReason.status).toBe(422);
    const sus = await h.api.post(`/platform/v1/tenants/${co.tenantId}/lifecycle`).set(admin.auth).send({ action: 'suspend', reason: 'Payment overdue' });
    expect(sus.body.status).toBe('suspended');
    expect((await h.api.get('/v1/company').set(co.auth)).status).toBe(200);
    const write = await h.api.patch('/v1/company').set(co.auth).send({ name: 'New name' });
    expect(write.status).toBe(423);
    expect(write.body.code).toBe('tenant_suspended');
    const restored = await h.api.post(`/platform/v1/tenants/${co.tenantId}/lifecycle`).set(admin.auth).send({ action: 'restore' });
    expect(restored.body.status).toBe('active');
    expect((await h.api.patch('/v1/company').set(co.auth).send({ name: 'New name' })).status).toBe(200);
    const bad = await h.api.post(`/platform/v1/tenants/${co.tenantId}/lifecycle`).set(admin.auth).send({ action: 'extend_trial' });
    expect(bad.status).toBe(409);
    await h.api.post(`/platform/v1/tenants/${co.tenantId}/lifecycle`).set(admin.auth).send({ action: 'cancel' });
    const closed = await h.api.get('/v1/company').set(co.auth);
    expect(closed.status).toBe(403);
    expect(closed.body.code).toBe('tenant_inactive');
  });
});

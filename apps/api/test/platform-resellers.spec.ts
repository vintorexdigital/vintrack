import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, createCompany, platformAdmin, type Harness } from './harness.js';

let h: Harness;
beforeAll(async () => { h = await boot(); });
afterAll(async () => { await h.close(); });

describe('resellers and company groups', () => {
  it('creates and edits resellers, rejects duplicates, and assigns a company', async () => {
    const onboarding = await platformAdmin(h, 'onboarding');
    const analyst = await platformAdmin(h, 'analyst');
    const slug = `rs-${Date.now().toString(36)}`;
    const made = await h.api.post('/platform/v1/resellers').set(onboarding.auth).send({ name: 'Southern Partners', slug, contactEmail: 'Partners@Example.com', marginPct: 20 });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    expect(made.body).toMatchObject({ slug, contactEmail: 'partners@example.com', status: 'active' });
    expect((await h.api.post('/platform/v1/resellers').set(onboarding.auth).send({ name: 'Dup', slug })).status).toBe(409);
    expect((await h.api.post('/platform/v1/resellers').set(onboarding.auth).send({ name: 'Bad', slug: 'Bad Slug!' })).status).toBe(422);
    expect((await h.api.post('/platform/v1/resellers').set(analyst.auth).send({ name: 'Nope', slug: 'nope-x' })).status).toBe(403);
    const upd = await h.api.patch(`/platform/v1/resellers/${made.body.id}`).set(onboarding.auth).send({ marginPct: 25, status: 'suspended' });
    expect(upd.body, JSON.stringify(upd.body)).toMatchObject({ status: 'suspended' });
    expect(Number(upd.body.marginPct)).toBe(25);

    const g = await h.api.post('/platform/v1/company-groups').set(onboarding.auth).send({ name: 'Acme Group' });
    expect(g.status).toBe(201);
    const co = await createCompany(h, onboarding);
    const assigned = await h.api.patch(`/platform/v1/tenants/${co.tenantId}`).set(onboarding.auth).send({ resellerId: made.body.id, groupId: g.body.id });
    expect(assigned.status).toBe(200);
    expect(assigned.body).toMatchObject({ resellerId: made.body.id, groupId: g.body.id });
    const list = await h.api.get('/platform/v1/resellers').set(analyst.auth);
    expect(list.body.map((r: { slug: string }) => r.slug)).toContain(slug);
  });
});

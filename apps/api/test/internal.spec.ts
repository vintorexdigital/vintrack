import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, createCompany, platformAdmin, type Harness } from './harness.js';

let h: Harness;
beforeAll(async () => { h = await boot(); });
afterAll(async () => { await h.close(); });

describe('custom domain certificate gate', () => {
  it('allows only verified domains of live companies', async () => {
    const admin = await platformAdmin(h);
    const co = await createCompany(h, admin);
    const domain = `hr-${co.slug}.example.com`;
    await h.db.platform.execute(sql`insert into platform.tenant_domains (tenant_id, domain, verified) values (${co.tenantId}::uuid, ${domain}, false)`);
    expect((await h.api.get(`/internal/domain-allowed?domain=${domain}`)).status).toBe(404);
    await h.db.platform.execute(sql`update platform.tenant_domains set verified = true where domain = ${domain}`);
    expect((await h.api.get(`/internal/domain-allowed?domain=${domain.toUpperCase()}`)).status).toBe(200);
    expect((await h.api.get('/internal/domain-allowed?domain=unknown.example.org')).status).toBe(404);
    expect((await h.api.get('/internal/domain-allowed?domain=a%20b;drop')).status).toBe(404);
    expect((await h.api.get('/internal/domain-allowed')).status).toBe(404);
    await h.api.post(`/platform/v1/tenants/${co.tenantId}/lifecycle`).set(admin.auth).send({ action: 'suspend', reason: 'Testing the gate' });
    expect((await h.api.get(`/internal/domain-allowed?domain=${domain}`)).status).toBe(404);
  });
});

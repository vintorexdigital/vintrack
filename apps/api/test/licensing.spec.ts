import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, createCompany, ownerSession, platformAdmin, type Harness } from './harness.js';

let h: Harness;
let admin: Awaited<ReturnType<typeof platformAdmin>>;
beforeAll(async () => { h = await boot(); admin = await platformAdmin(h); });
afterAll(async () => { await h.close(); });

const planOf = async (plan: string) => {
  const co = await ownerSession(h, admin);
  const r = await h.api.patch(`/platform/v1/tenants/${co.tenantId}`).set(admin.auth).send({ planKey: plan });
  if (r.status !== 200) throw new Error(`plan change failed ${JSON.stringify(r.body)}`);
  // sessions carry nothing about the plan, so the next request sees it (the directory cache is short-lived in tests)
  await h.app.get((await import('../src/core/auth/tenant-directory.service.js')).TenantDirectory).invalidate();
  return co;
};

describe('plans are enforced at the API, not only hidden in the console', () => {
  it('refuses modules the plan lacks with 402, and serves the ones it has', async () => {
    const office = await planOf('office');
    for (const path of ['/v1/field/tasks', '/v1/field/forms', '/v1/sales/leads', '/v1/field/calls', '/v1/expenses/claims', '/v1/automation/workflows', '/v1/calls/status', '/v1/location/policy', '/v1/field/customers']) {
      const r = await h.api.get(path).set(office.auth);
      expect(r.status, path).toBe(402);
      expect(r.body.code).toBe('module_not_licensed');
    }
    expect((await h.api.get('/v1/people/employees').set(office.auth)).status).toBe(200);
    expect((await h.api.get('/v1/leave/requests').set(office.auth)).status).toBe(200);
    expect((await h.api.get('/v1/time/shifts').set(office.auth)).status).toBe(200);
    expect((await h.api.get('/v1/productivity/summary?from=2026-01-01&to=2026-01-02').set(office.auth)).status).not.toBe(402); // desktop activity is in the Office plan
  });

  it('includes tasks, tracking, customers, leads and expenses in Field but not workflows or cloud calling', async () => {
    const field = await planOf('field');
    expect((await h.api.get('/v1/field/tasks').set(field.auth)).status).toBe(200);
    expect((await h.api.get('/v1/field/customers').set(field.auth)).status).toBe(200);
    expect((await h.api.get('/v1/expenses/claims').set(field.auth)).status).toBe(200);
    expect((await h.api.get('/v1/field/calls').set(field.auth)).status).toBe(200);
    expect((await h.api.get('/v1/sales/leads').set(field.auth)).status).toBe(402); // leads are not in Field
    expect((await h.api.get('/v1/automation/workflows').set(field.auth)).status).toBe(402);
    expect((await h.api.get('/v1/calls/status').set(field.auth)).status).toBe(402);
  });

  it('lets a feature flag switch a module on for one company, and the all-in-one plan has everything', async () => {
    const field = await planOf('field');
    expect((await h.api.get('/v1/automation/workflows').set(field.auth)).status).toBe(402);
    const flag = await h.api.patch(`/platform/v1/tenants/${field.tenantId}`).set(admin.auth).send({ featureFlags: { workflows: true } });
    expect(flag.status, JSON.stringify(flag.body)).toBe(200);
    await h.app.get((await import('../src/core/auth/tenant-directory.service.js')).TenantDirectory).invalidate();
    expect((await h.api.get('/v1/automation/workflows').set(field.auth)).status).toBe(200);
    const all = await planOf('all_in_one');
    expect((await h.api.get('/v1/automation/workflows').set(all.auth)).status).toBe(200);
    expect((await h.api.get('/v1/calls/status').set(all.auth)).status).toBe(200);
  });
});
void createCompany;

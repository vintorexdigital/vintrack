import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { ALL_KITS } from '@trackrex/schemas';
import { RESOURCES } from '../src/shared/crud/crud.factory.js';
import { boot, createCompany, ownerSession, platformAdmin, signIn, type Harness } from './harness.js';
import { validBody } from './bodies.js';

let h: Harness;
let admin: Awaited<ReturnType<typeof platformAdmin>>;
let A: Awaited<ReturnType<typeof ownerSession>>;
let B: Awaited<ReturnType<typeof ownerSession>>;

beforeAll(async () => {
  h = await boot();
  admin = await platformAdmin(h);
  A = await ownerSession(h, admin);
  B = await ownerSession(h, admin);
});
afterAll(async () => { await h.close(); });

/** Entities that reference other records need real ones in company A first. */
async function prepare(key: string): Promise<Record<string, unknown>> {
  if (key !== 'leave-requests' && key !== 'regularizations') return {};
  const emp = await h.api.post('/v1/people/employees').set(A.auth).send({ firstName: 'Ref', displayName: `Ref ${Math.random()}`, dateOfJoining: '2024-01-01' });
  if (key === 'regularizations') {
    const d = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    return { employeeId: emp.body.id, date: d, requestedCode: 'P', reason: 'Isolation check' };
  }
  const types = await h.api.get('/v1/leave/types').set(A.auth);
  const next = new Date(Date.now() + 10 * 86_400_000);
  while (next.getUTCDay() === 0) next.setUTCDate(next.getUTCDate() + 1);
  const d = next.toISOString().slice(0, 10);
  return { employeeId: emp.body.id, leaveTypeId: types.body.data.find((t: { code: string }) => t.code === 'LOP').id, fromDate: d, toDate: d, reason: 'Isolation check' };
}

describe('tenant isolation: every CRUD resource', () => {
  it('registers every kit exactly once', () => {
    expect(new Set(RESOURCES.map((r) => r.kit.def.key))).toEqual(new Set(ALL_KITS.map((k) => k.def.key)));
  });

  for (const kit of ALL_KITS) {
    const path = `/v1/${kit.def.path.replace(/^\//, '')}`;
    it(`${kit.def.key}: company B can neither see nor change company A's rows`, async () => {
      const extra = await prepare(kit.def.key); // before building the request: supertest shares one server
      const created = await h.api.post(path).set(A.auth).send(validBody(kit, extra));
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      const id = created.body.id as string;

      expect((await h.api.get(`${path}/${id}`).set(B.auth)).status).toBe(404);
      expect((await h.api.patch(`${path}/${id}`).set(B.auth).send({})).status).toBe(404);
      expect((await h.api.delete(`${path}/${id}`).set(B.auth)).status).toBe(404);
      expect((await h.api.post(`${path}/${id}/restore`).set(B.auth)).status).toBe(404);

      const listB = await h.api.get(`${path}?include_total=true&deleted=include`).set(B.auth);
      expect(listB.status).toBe(200);
      expect(listB.body.data.some((r: { id: string }) => r.id === id)).toBe(false);

      const bulk = await h.api.post(`${path}/bulk`).set(B.auth).send({ action: 'delete', ids: [id] });
      expect(bulk.status).toBe(404);
      // and the row is untouched for A
      const still = await h.api.get(`${path}/${id}`).set(A.auth);
      expect(still.status).toBe(200);
      expect(still.body.deletedAt ?? null).toBeNull();
    });
  }
});

describe('tenant isolation: database level', () => {
  const app = () => new pg.Pool({ connectionString: process.env.DATABASE_APP_URL });

  it('shows no rows when no tenant context is set', async () => {
    const pool = app();
    const r = await pool.query('select count(*)::int as n from departments');
    expect(r.rows[0].n).toBe(0);
    await pool.end();
  });

  it('hides other tenants rows and rejects writes into them', async () => {
    const pool = app();
    const c = await pool.connect();
    try {
      await h.api.post('/v1/org/departments').set(A.auth).send({ name: 'A only' });
      await c.query('begin');
      await c.query(`select set_config('app.tenant_id', $1, true)`, [B.tenantId]);
      const seen = await c.query('select count(*)::int as n from departments where tenant_id = $1', [A.tenantId]);
      expect(seen.rows[0].n).toBe(0);
      await expect(c.query(`insert into departments (tenant_id, name) values ($1, 'sneaky')`, [A.tenantId])).rejects.toMatchObject({ code: '42501' });
      await c.query('rollback');
      // an update cannot reach across tenants either
      await c.query('begin');
      await c.query(`select set_config('app.tenant_id', $1, true)`, [B.tenantId]);
      const upd = await c.query(`update departments set name = 'hacked' where tenant_id = $1`, [A.tenantId]);
      expect(upd.rowCount).toBe(0);
      await c.query('rollback');
    } finally {
      c.release();
      await pool.end();
    }
  });

  it('does not leak tenant context between pooled connections', async () => {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_APP_URL, max: 1 });
    const c1 = await pool.connect();
    await c1.query('begin');
    await c1.query(`select set_config('app.tenant_id', $1, true)`, [A.tenantId]);
    await c1.query('commit');
    c1.release();
    const c2 = await pool.connect();
    const r = await c2.query(`select current_setting('app.tenant_id', true) as t`);
    expect(r.rows[0].t === '' || r.rows[0].t === null).toBe(true);
    c2.release();
    await pool.end();
  });

  it('keeps business data out of reach of the platform role and the audit log append-only', async () => {
    const platform = new pg.Pool({ connectionString: process.env.DATABASE_PLATFORM_URL });
    await expect(platform.query('select * from employees')).rejects.toMatchObject({ code: '42501' });
    await expect(platform.query('select * from audit_log')).rejects.toMatchObject({ code: '42501' });
    await platform.end();
    const pool = app();
    const c = await pool.connect();
    await c.query('begin');
    await c.query(`select set_config('app.tenant_id', $1, true)`, [A.tenantId]);
    await expect(c.query('update audit_log set action = $1', ['x'])).rejects.toMatchObject({ code: '42501' });
    await c.query('rollback');
    await expect(c.query('delete from audit_log')).rejects.toMatchObject({ code: '42501' });
    c.release();
    await pool.end();
  });

  it('rejects cross-tenant references at the database', async () => {
    const dept = await h.api.post('/v1/org/departments').set(A.auth).send({ name: 'Cross ref' });
    const bad = await h.api.post('/v1/org/designations').set(B.auth).send({ name: 'Bad ref', departmentId: dept.body.id });
    expect(bad.status).toBe(409);
    expect(bad.body.code).toBe('invalid_reference');
  });
});

describe('users with memberships in two companies', () => {
  it('switches company and only ever sees the active company data', async () => {
    const email = 'consultant@example.com';
    const a = await ownerSession(h, admin);
    const b = await createCompany(h, admin, { ownerEmail: email });
    const inv = await h.api.post('/v1/company/invitations').set(a.auth).send({ email, roleKeys: ['admin'] });
    expect(inv.status).toBe(201);
    const acc = await h.api.post('/v1/auth/invitations/accept').set('x-client', 'api').send({ token: inv.body.devToken, name: 'Consultant', password: 'Sup3rSecret!x' });
    expect(acc.status, JSON.stringify(acc.body)).toBe(200);

    // two memberships now: sign-in asks which company
    const login = await h.api.post('/v1/auth/login').set('x-client', 'api').send({ identifier: email, password: 'Sup3rSecret!x' });
    expect(login.body.status).toBe('choose_company');
    expect(login.body.companies).toHaveLength(2);
    const picked = await h.api.post('/v1/auth/select-company').set('x-client', 'api').send({ selectionToken: login.body.selectionToken, tenantId: a.tenantId });
    expect(picked.body.status).toBe('ok');

    const inA = { Authorization: `Bearer ${picked.body.accessToken}`, 'x-client': 'api' };
    await h.api.post('/v1/org/departments').set(a.auth).send({ name: 'Only in A' });
    const listA = await h.api.get('/v1/org/departments').set(inA);
    expect(listA.body.data.map((d: { name: string }) => d.name)).toContain('Only in A');

    const sw = await h.api.post('/v1/auth/switch-company').set(inA).send({ tenantId: b.tenantId });
    expect(sw.body.status).toBe('ok');
    const inB = { Authorization: `Bearer ${sw.body.accessToken}`, 'x-client': 'api' };
    const listB = await h.api.get('/v1/org/departments').set(inB);
    expect(listB.body.data.map((d: { name: string }) => d.name)).not.toContain('Only in A');
    // a token for company A is not valid for B's data even if the id is known
    const meB = await h.api.get('/v1/auth/me').set(inB);
    expect(meB.body.company.id).toBe(b.tenantId);
    // cannot switch into a company without membership
    const c = await createCompany(h, admin);
    expect((await h.api.post('/v1/auth/switch-company').set(inB).send({ tenantId: c.tenantId })).status).toBe(403);
    void signIn;
  });
});

describe('support sessions', () => {
  it('needs the company to allow access, is time-boxed, and cannot read business data', async () => {
    const co = await ownerSession(h, admin);
    const support = await platformAdmin(h, 'support');
    const denied = await h.api.post(`/platform/v1/tenants/${co.tenantId}/support-sessions`).set(support.auth).send({ reason: 'Debugging shift setup', minutes: 30 });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('support_access_not_allowed');

    await h.api.put('/v1/company/support-access').set(co.auth).send({ enabled: true });
    const short = await h.api.post(`/platform/v1/tenants/${co.tenantId}/support-sessions`).set(support.auth).send({ reason: 'short', minutes: 30 });
    expect(short.status).toBe(422);
    const started = await h.api.post(`/platform/v1/tenants/${co.tenantId}/support-sessions`).set(support.auth).send({ reason: 'Debugging shift setup', minutes: 30 });
    expect(started.status).toBe(201);
    const sup = { Authorization: `Bearer ${started.body.accessToken}`, 'x-client': 'api' };

    expect((await h.api.get('/v1/org/departments').set(sup)).status).toBe(200);
    const me = await h.api.get('/v1/auth/me').set(sup);
    expect(me.body.support.sessionId).toBe(started.body.session.id);
    // business data permissions are withheld during support
    expect(me.body.permissions.some((p: { permission: string }) => p.permission.startsWith('location.'))).toBe(false);
    // changes are attributed to the staff member as impersonator
    const dept = await h.api.post('/v1/org/departments').set(sup).send({ name: 'Created by support' });
    expect(dept.status).toBe(201);
    const audit = await h.api.get('/v1/audit?entity=departments').set(co.auth);
    expect(audit.body.data.some((a: { impersonatorId: string }) => a.impersonatorId === support.id)).toBe(true);

    // the company can see the session, and revoking access ends it immediately
    const view = await h.api.get('/v1/company/support-access').set(co.auth);
    expect(view.body.session).toMatchObject({ reason: 'Debugging shift setup' });
    await h.api.put('/v1/company/support-access').set(co.auth).send({ enabled: false });
    const after = await h.api.get('/v1/org/departments').set(sup);
    expect(after.status).toBe(401);
    expect(after.body.code).toBe('support_session_ended');
  });
});

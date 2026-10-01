import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import supertest from 'supertest';
import { createApp } from '../src/bootstrap.js';
import { Db } from '../src/core/database/db.service.js';
import { totpAt } from '../src/core/auth/totp.js';
import { PlatformAuthService } from '../src/modules/platform/platform-auth.service.js';
import { ConsoleMessaging } from '../src/shared/providers/messaging/messaging.provider.js';
import { TenantDirectory } from '../src/core/auth/tenant-directory.service.js';

export const PASSWORD = 'Sup3rSecret!x';
export const TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

export interface Harness {
  app: INestApplication;
  api: ReturnType<typeof supertest>;
  db: Db;
  messaging: ConsoleMessaging;
  close(): Promise<void>;
}

export async function boot(): Promise<Harness> {
  const app = await createApp({ logger: false });
  await app.init();
  const server = app.getHttpServer();
  return {
    app, api: supertest(server), db: app.get(Db), messaging: app.get(ConsoleMessaging),
    close: async () => { await app.close(); },
  };
}

let counter = 0;
export const uniq = (p = 'x') => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`;

export async function platformAdmin(h: Harness, role: 'super_admin' | 'support' | 'finance' | 'onboarding' | 'analyst' = 'super_admin') {
  const email = `${uniq('staff')}@vintorex.test`;
  await h.app.get(PlatformAuthService).createStaff({ email, name: 'Staff', role, password: PASSWORD, totpSecret: TOTP_SECRET });
  await h.db.platform.execute(sql`update platform.platform_users set totp_enabled = true where email = ${email}`);
  const res = await h.api.post('/platform/v1/auth/login').send({ email, password: PASSWORD, totp: totpAt(TOTP_SECRET, Date.now()) });
  if (res.body.status !== 'ok') throw new Error(`platform login failed: ${JSON.stringify(res.body)}`);
  return { token: res.body.accessToken as string, email, id: res.body.user.id as string, auth: { Authorization: `Bearer ${res.body.accessToken}` } };
}

export async function createCompany(h: Harness, admin: { auth: Record<string, string> }, opts: { slug?: string; ownerEmail?: string; seatLimit?: number; name?: string } = {}) {
  const slug = opts.slug ?? uniq('co').toLowerCase();
  const ownerEmail = opts.ownerEmail ?? `owner-${slug}@example.com`;
  const res = await h.api.post('/platform/v1/tenants').set(admin.auth).send({
    name: opts.name ?? `Company ${slug}`, slug, seatLimit: opts.seatLimit ?? 10,
    owner: { name: 'Olive Owner', email: ownerEmail, password: PASSWORD },
  });
  if (res.status !== 201) throw new Error(`create company failed ${res.status}: ${JSON.stringify(res.body)}`);
  const tenantId = res.body.tenant.id as string;
  return { slug, tenantId, ownerEmail };
}

export async function signIn(h: Harness, identifier: string, tenant?: string, password = PASSWORD) {
  const res = await h.api.post('/v1/auth/login').set('x-client', 'api').send({ identifier, password, ...(tenant ? { tenant } : {}) });
  if (res.status !== 200 || res.body.status !== 'ok') throw new Error(`sign in failed ${res.status}: ${JSON.stringify(res.body)}`);
  return { token: res.body.accessToken as string, refresh: res.body.refreshToken as string, auth: { Authorization: `Bearer ${res.body.accessToken}`, 'x-client': 'api' }, body: res.body };
}

export async function ownerSession(h: Harness, admin: { auth: Record<string, string> }, opts: Parameters<typeof createCompany>[2] = {}) {
  const co = await createCompany(h, admin, opts);
  const s = await signIn(h, co.ownerEmail, co.slug);
  return { ...co, ...s };
}

export const bust = (h: Harness) => h.app.get(TenantDirectory).invalidate();

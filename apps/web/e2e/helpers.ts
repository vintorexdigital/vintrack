import { createHmac } from 'node:crypto';
import type { APIRequestContext, Page } from '@playwright/test';

export const DEMO = { tenant: 'meridian-demo', password: 'Trackrex#2026' };

export async function signIn(page: Page, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Company address').fill(DEMO.tenant);
  await page.getByLabel('Email or mobile number').fill(email);
  await page.getByLabel('Password').fill(DEMO.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/', { timeout: 20_000 });
  await page.getByRole('main').waitFor();
}

/** The no-page-level-horizontal-scroll check from the device matrix. */
export async function noHorizontalScroll(page: Page): Promise<{ scrollWidth: number; innerWidth: number }> {
  return page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
}

export const MATRIX: { name: string; width: number; height: number; zoom?: number }[] = [
  { name: '320x568', width: 320, height: 568 }, { name: '360x800', width: 360, height: 800 }, { name: '390x844', width: 390, height: 844 },
  { name: '412x915', width: 412, height: 915 }, { name: '844x390', width: 844, height: 390 }, { name: '915x412', width: 915, height: 412 },
  { name: '768x1024', width: 768, height: 1024 }, { name: '1024x768', width: 1024, height: 768 }, { name: '820x1180', width: 820, height: 1180 },
  { name: '1180x820', width: 1180, height: 820 }, { name: '1280x800', width: 1280, height: 800 }, { name: '1366x768', width: 1366, height: 768 },
  { name: '1440x900', width: 1440, height: 900 }, { name: '1920x1080', width: 1920, height: 1080 }, { name: '2560x1080', width: 2560, height: 1080 },
  { name: '3440x1440', width: 3440, height: 1440 }, { name: '5120x1440', width: 5120, height: 1440 }, { name: '3840x2160', width: 3840, height: 2160 },
  { name: '1280x800@200%', width: 640, height: 400, zoom: 2 },
];

export const API = process.env.API_URL ?? 'http://localhost:4000';

/** Platform staff bearer header, using the seeded operator and its TOTP secret. */
export async function platformAuth(request: APIRequestContext): Promise<Record<string, string>> {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const key = Buffer.from('JBSWY3DPEHPK3PXP'.split('').reduce((b, c) => b + alpha.indexOf(c).toString(2).padStart(5, '0'), '').match(/.{8}/g)!.map((x) => parseInt(x, 2)));
  const ctr = Buffer.alloc(8);
  ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac('sha1', key).update(ctr).digest();
  const o = h[19]! & 15;
  const totp = String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
  const res = await request.post(`${API}/platform/v1/auth/login`, { data: { email: 'admin@vintorex.test', password: DEMO.password, totp } });
  const body = (await res.json()) as { accessToken: string };
  return { authorization: `Bearer ${body.accessToken}` };
}

/** A brand-new trial company, so tests that change plans never depend on shared seed state. */
export async function createTrialCompany(request: APIRequestContext, seats = 10): Promise<{ slug: string; email: string }> {
  const auth = await platformAuth(request);
  const slug = `e2e-${Date.now().toString(36)}`;
  const email = `owner-${slug}@example.com`;
  const res = await request.post(`${API}/platform/v1/tenants`, { headers: auth, data: { name: `E2E ${slug}`, slug, seatLimit: seats, owner: { name: 'E2E Owner', email, password: DEMO.password } } });
  if (res.status() !== 201) throw new Error(`could not create company: ${await res.text()}`);
  return { slug, email };
}

export async function signInAs(page: Page, tenant: string, email: string) {
  await page.goto('/sign-in');
  await page.getByLabel('Company address').fill(tenant);
  await page.getByLabel('Email or mobile number').fill(email);
  await page.getByLabel('Password').fill(DEMO.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/', { timeout: 20_000 });
}

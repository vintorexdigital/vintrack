import { expect, test } from '@playwright/test';
import { DEMO, signIn } from './helpers';

test('manager signs in, sees today, opens the register and a CRUD list', async ({ page }) => {
  await signIn(page, 'hr@meridian.test');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  await expect(page.getByText('Present today')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/home-1440.png' });

  await page.goto('/attendance/register');
  await expect(page.getByRole('heading', { name: 'Monthly register' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/register-1440.png' });

  await page.goto('/admin/organization/departments');
  await expect(page.getByRole('heading', { name: 'Departments' })).toBeVisible();
  await expect(page.getByRole('table').getByText('Sales')).toBeVisible();
  await page.screenshot({ path: 'e2e/screenshots/departments-1440.png' });
});

test('support hand-off lands in the company console with a warning banner', async ({ page, request }) => {
  const { createHmac } = await import('node:crypto');
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const key = Buffer.from('JBSWY3DPEHPK3PXP'.split('').reduce((b, c) => b + alpha.indexOf(c).toString(2).padStart(5, '0'), '').match(/.{8}/g)!.map((x) => parseInt(x, 2)));
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const h = createHmac('sha1', key).update(ctr).digest(); const o = h[19]! & 15;
  const code = String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
  const api = process.env.API_URL ?? 'http://localhost:4000';
  const plat = await (await request.post(`${api}/platform/v1/auth/login`, { data: { email: 'admin@vintorex.test', password: DEMO.password, totp: code } })).json() as { accessToken: string };
  const auth = { authorization: `Bearer ${plat.accessToken}` };
  const list = await (await request.get(`${api}/platform/v1/tenants?q=Meridian`, { headers: auth })).json() as { data: { id: string; slug: string }[] };
  const tenant = list.data.find((t) => t.slug === DEMO.tenant)!;
  // The company switches support access on first (a manager does this in Admin > Security).
  const login = await (await request.post(`${api}/v1/auth/login`, { data: { identifier: 'owner@meridian.test', password: DEMO.password, tenant: DEMO.tenant } })).json() as { accessToken: string };
  await request.put(`${api}/v1/company/support-access`, { headers: { authorization: `Bearer ${login.accessToken}` }, data: { enabled: true } });
  const s = await (await request.post(`${api}/platform/v1/tenants/${tenant.id}/support-sessions`, { headers: auth, data: { reason: 'Playwright hand-off check', minutes: 15 } })).json() as { consoleUrl: string };
  expect(s.consoleUrl).toContain('/support#token=');
  await page.goto(s.consoleUrl.replace(/^https?:\/\/[^/]+/, ''));
  await page.waitForURL('**/', { timeout: 20_000 });
  await expect(page.getByText(/Platform support is working in this company/)).toBeVisible();
  expect(page.url()).not.toContain('token');
});

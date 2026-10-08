import { expect, test } from '@playwright/test';
import { DEMO, platformAuth, signIn } from './helpers';

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
  const api = process.env.API_URL ?? 'http://localhost:4000';
  const auth = await platformAuth(request);
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

import { createHmac } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';

const SECRET = 'JBSWY3DPEHPK3PXP';
function b32(s: string) { const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const c of s) bits += a.indexOf(c).toString(2).padStart(5, '0'); const out: number[] = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out); }
function totp(now = Date.now()) { const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(now / 30000))); const h = createHmac('sha1', b32(SECRET)).update(c).digest(); const o = h[19]! & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000)).padStart(6, '0'); }

async function login(page: Page) {
  await page.goto('/sign-in');
  await page.getByLabel('Work email').fill('admin@vintorex.test');
  await page.getByLabel('Password').fill('Trackrex#2026');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('6-digit code').fill(totp());
  await page.getByRole('button', { name: 'Verify' }).click();
  await page.waitForURL('**/', { timeout: 20_000 });
}

test('operator signs in, finds a company, and the overview loads', async ({ page }) => {
  await login(page);
  await expect(page.getByRole('heading', { name: /overview/i })).toBeVisible();
  await page.getByRole('link', { name: 'Companies' }).first().click();
  await page.getByLabel('Search companies').fill('Meridian');
  await page.getByRole('row', { name: /Meridian/ }).first().click();
  await expect(page.getByRole('heading', { name: /Meridian/ })).toBeVisible();
  await expect(page.getByText('Audit trail')).toBeVisible();
});

test('audit and resellers pages render', async ({ page }) => {
  await login(page);
  await page.goto('/audit');
  await expect(page.getByRole('heading', { name: 'Platform audit log' })).toBeVisible();
  await page.goto('/resellers');
  await expect(page.getByRole('heading', { name: 'Resellers and groups' })).toBeVisible();
});

test('no horizontal scroll on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await login(page);
  await page.goto('/companies');
  const w = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, i: window.innerWidth }));
  expect(w.s).toBeLessThanOrEqual(w.i);
});

test('billing page shows revenue, plans and open invoices', async ({ page }) => {
  await login(page);
  await page.getByRole('link', { name: 'Billing' }).click();
  await expect(page.getByRole('heading', { name: 'Billing' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Plan prices' })).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'Field' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Open invoices' })).toBeVisible();
});

test('platform pages have no serious accessibility violations', async ({ page }) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  await login(page);
  const problems: string[] = [];
  for (const r of ['/', '/companies', '/companies/new', '/billing', '/resellers', '/audit']) {
    await page.goto(r);
    await page.getByRole('main').first().waitFor();
    await page.waitForLoadState('networkidle').catch(() => undefined);
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    for (const v of res.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')) problems.push(`${r}: ${v.id} — ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
  }
  expect(problems).toEqual([]);
});

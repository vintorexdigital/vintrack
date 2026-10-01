import { expect, test } from '@playwright/test';

const MATRIX = [[320, 568], [360, 800], [390, 844], [844, 390], [768, 1024], [1024, 768], [1280, 800], [1920, 1080], [2560, 1080], [5120, 1440], [640, 400]] as const;
const ROUTES = ['/', '/pricing/', '/help/', '/product/field-tracking/', '/security/', '/api-docs/'];

test('home links to signup and the modules', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Know who is working');
  await expect(page.getByRole('link', { name: 'Start your 14-day trial' })).toHaveAttribute('href', /\/signup$/);
  await page.getByRole('link', { name: /Field tracking/ }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Field tracking' })).toBeVisible();
});

test('pricing calculator adds GST in rupees and none in dollars, and yearly is ten months', async ({ page }) => {
  await page.goto('/pricing/');
  await page.getByLabel('People').fill('25');
  await page.getByRole('radio', { name: /^Field/ }).check({ force: true });
  const total = page.getByRole('term').filter({ hasText: /Per month/ }).locator('xpath=following-sibling::dd[1]');
  await expect(total).toHaveText(/4,395\.50/);
  await page.getByRole('button', { name: 'Yearly' }).click();
  await expect(page.getByRole('term').filter({ hasText: /Per year/ }).locator('xpath=following-sibling::dd[1]')).toHaveText(/43,955\.00/);
  await page.getByRole('button', { name: 'USD' }).click();
  await expect(page.getByText(/GST \(18%\)/)).toHaveCount(0);
});

test('help search narrows articles and an article renders', async ({ page }) => {
  await page.goto('/help/');
  await page.getByLabel('Search the help center').fill('invoice');
  await expect(page.getByRole('link', { name: /Plans, seats and invoices/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /How punching/ })).toHaveCount(0);
  await page.getByRole('link', { name: /Plans, seats and invoices/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Plans, seats and invoices');
});

test('api reference lists endpoints and filters them', async ({ page }) => {
  await page.goto('/api-docs/');
  await page.getByLabel('Search endpoints').fill('attendance/punches');
  await expect(page.getByText('/v1/attendance/punches').first()).toBeVisible();
});

test('crawlers get a sitemap and robots', async ({ request }) => {
  expect((await (await request.get('/sitemap.xml')).text())).toContain('/pricing/');
  expect((await (await request.get('/robots.txt')).text())).toContain('Sitemap:');
});

for (const [w, h] of MATRIX) {
  test(`no horizontal scroll at ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    for (const r of ROUTES) {
      await page.goto(r);
      const m = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, i: window.innerWidth }));
      expect(m.s, r).toBeLessThanOrEqual(m.i);
    }
  });
}

test('pages have no serious accessibility violations', async ({ page }) => {
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  const problems: string[] = [];
  for (const r of ['/', '/pricing/', '/help/', '/help/billing/', '/product/attendance/', '/security/', '/api-docs/', '/demo/']) {
    await page.goto(r);
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    for (const v of res.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')) problems.push(`${r}: ${v.id} — ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
  }
  expect(problems).toEqual([]);
});

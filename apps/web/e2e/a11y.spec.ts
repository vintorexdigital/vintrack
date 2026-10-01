import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

/** Serious and critical WCAG 2.1 A/AA violations fail the build. Lesser findings are listed in the output. */
const PAGES = ['/', '/attendance/log', '/attendance/register', '/people/employees', '/leave/calendar', '/field/live', '/field/tasks', '/field/customers', '/expenses/claims', '/reports', '/reports/attendance-summary', '/productivity', '/admin/billing', '/admin/settings', '/admin/security/roles', '/admin/time/shifts/new'];

async function scan(page: import('@playwright/test').Page, path: string) {
  await page.goto(path);
  await page.getByRole('main').first().waitFor();
  await page.waitForLoadState('networkidle').catch(() => undefined);
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).disableRules(['region']).analyze();
  const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const minor = r.violations.filter((v) => !bad.includes(v)).map((v) => `${v.id} (${v.nodes.length})`);
  if (minor.length) console.log(`${path}: minor/moderate: ${minor.join(', ')}`);
  return bad.map((v) => `${v.id}: ${v.help} — ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

test('sign-in page has no serious accessibility violations', async ({ page }) => {
  await page.goto('/sign-in');
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([]);
});

test('console pages have no serious accessibility violations', async ({ page }) => {
  await signIn(page, 'owner@meridian.test');
  const problems: string[] = [];
  for (const p of PAGES) for (const m of await scan(page, p)) problems.push(`${p} → ${m}`);
  expect(problems).toEqual([]);
});

test('dark and high-contrast themes keep text readable', async ({ page }) => {
  await signIn(page, 'owner@meridian.test');
  for (const theme of ['dark', 'contrast']) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    const r = await new AxeBuilder({ page }).withTags(['wcag2aa']).analyze();
    const contrast = r.violations.filter((v) => v.id === 'color-contrast');
    expect(contrast.map((v) => `${theme}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  }
});

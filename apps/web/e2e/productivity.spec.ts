import { expect, test } from '@playwright/test';
import { noHorizontalScroll, signIn } from './helpers';

test('owner sees productivity by person and opens a day', async ({ page }) => {
  await signIn(page, 'owner@meridian.test');
  await page.goto('/productivity');
  await expect(page.getByRole('heading', { name: 'Productivity' })).toBeVisible();
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const week = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  await page.getByLabel('From').fill(week);
  await page.getByLabel('To').fill(yesterday);
  const row = page.getByRole('row').filter({ hasText: /\d+%/ }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();
  await expect(page.getByRole('heading', { name: 'Applications and websites' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('region', { name: 'By hour' })).toBeVisible();
  const w = await noHorizontalScroll(page);
  expect(w.scrollWidth).toBeLessThanOrEqual(w.innerWidth);
});

test('classification list is administered under Admin', async ({ page }) => {
  await signIn(page, 'owner@meridian.test');
  await page.goto('/admin/productivity/app-classes');
  await expect(page.getByRole('table').getByText('youtube.com')).toBeVisible({ timeout: 15_000 });
});

import { expect, test } from '@playwright/test';
import { noHorizontalScroll, signIn } from './helpers';

test('manager runs the attendance summary and downloads Excel', async ({ page }) => {
  await signIn(page, 'hr@meridian.test');
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
  await page.getByRole('link', { name: /Attendance summary/ }).click();
  await expect(page.getByRole('heading', { name: 'Attendance summary' })).toBeVisible();
  await page.getByLabel('From').fill('2026-01-05');
  await page.getByLabel('To').fill('2026-02-05');
  await expect(page.getByRole('table').getByRole('row').nth(1)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Total present days/i)).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Excel' }).click();
  expect((await download).suggestedFilename()).toMatch(/attendance-summary.*\.xlsx$/);
  const w = await noHorizontalScroll(page);
  expect(w.scrollWidth).toBeLessThanOrEqual(w.innerWidth);
});

test('employees do not see Reports', async ({ page }) => {
  await signIn(page, 'employee@meridian.test');
  await expect(page.getByRole('link', { name: 'Reports' })).toHaveCount(0);
});

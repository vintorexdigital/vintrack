import { expect, test } from '@playwright/test';
import { noHorizontalScroll, signIn } from './helpers';

test('opens the seeded dashboard with charts, numbers and a text alternative', async ({ page }) => {
  await signIn(page, 'hr@meridian.test');
  await page.goto('/reports/dashboards');
  await expect(page.getByRole('heading', { name: 'Dashboards' })).toBeVisible();
  await page.getByRole('table').getByText('Operations overview').click();
  await expect(page.getByRole('heading', { name: 'Operations overview' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hours by department' })).toBeVisible();
  // a bar chart prints its values and offers the numbers as a table
  const widget = page.getByRole('region', { name: 'Hours by department' });
  await expect(widget.getByText('Show the numbers')).toBeVisible({ timeout: 15_000 });
  await widget.getByText('Show the numbers').click();
  await expect(widget.getByRole('table')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Attendance trend' }).getByRole('img')).toBeVisible();
  // HR admins have no sales data, so that widget says so instead of breaking the page
  await expect(page.getByRole('region', { name: 'Pipeline value by stage' })).toContainText('sales.lead.read');
  const w = await noHorizontalScroll(page);
  expect(w.scrollWidth).toBeLessThanOrEqual(w.innerWidth);
});

test('builds a report, tries it, saves it, opens it and downloads it', async ({ page }) => {
  await signIn(page, 'hr@meridian.test');
  await page.goto('/reports/saved/new');
  await expect(page.getByRole('heading', { name: 'New saved report' })).toBeVisible();
  await page.getByLabel('Name').fill('E2E hours by person');
  await page.getByRole('checkbox', { name: 'Department' }).check();
  await page.getByRole('checkbox', { name: 'Hours worked' }).check();
  await page.getByRole('button', { name: 'Try it' }).click();
  await expect(page.getByRole('table', { name: 'Report results' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: /^Save|Create/ }).click();
  await page.waitForURL(/\/reports\/saved(\/|$)/);
  await page.goto('/reports/saved');
  await page.getByRole('table').getByText('E2E hours by person').first().click();
  await expect(page.getByRole('heading', { name: 'E2E hours by person' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Report results' })).toBeVisible({ timeout: 15_000 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Excel' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
  await page.getByRole('button', { name: /Send me this/ }).click();
  await page.getByRole('button', { name: 'Schedule' }).click();
  await expect(page.getByText(/Scheduled\. The first one arrives/)).toBeVisible();
  await page.goto('/reports/schedules');
  await expect(page.getByRole('table', { name: 'Schedules' }).getByText('E2E hours by person').first()).toBeVisible();
});

test('employees have no report builder', async ({ page }) => {
  await signIn(page, 'employee@meridian.test');
  await page.goto('/reports/saved');
  await expect(page.getByRole('table')).toHaveCount(0);
});

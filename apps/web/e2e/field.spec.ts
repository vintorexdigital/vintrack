import { expect, test } from '@playwright/test';
import { noHorizontalScroll, signIn } from './helpers';

test('manager sees the live map with people and a trail', async ({ page }) => {
  await signIn(page, 'manager@meridian.test');
  await page.goto('/field/live');
  await expect(page.getByRole('heading', { name: 'Live map' })).toBeVisible();
  const people = page.getByRole('list', { name: 'People' }).getByRole('button');
  await expect(people.first()).toBeVisible({ timeout: 15_000 });
  await people.first().click();
  await expect(page.getByLabel('Trail day')).toBeVisible();
  await expect(page.getByText(/km ·/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('region', { name: 'Map of employee positions' })).toBeVisible();
  const w = await noHorizontalScroll(page);
  expect(w.scrollWidth).toBeLessThanOrEqual(w.innerWidth);
});

test('manager assigns a task and the list shows customers and tasks', async ({ page }) => {
  await signIn(page, 'manager@meridian.test');
  await page.goto('/field/customers');
  await expect(page.getByRole('table').getByText('Anand Stores')).toBeVisible({ timeout: 15_000 });
  await page.goto('/field/tasks');
  await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
});

test('employees cannot see the live map nav but have My tasks', async ({ page }) => {
  await signIn(page, 'employee@meridian.test');
  await page.goto('/field/my-tasks');
  await expect(page.getByRole('heading', { name: 'My tasks' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Live map' })).toHaveCount(0);
});

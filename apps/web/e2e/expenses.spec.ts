import { expect, test } from '@playwright/test';
import { noHorizontalScroll, signIn } from './helpers';

test('manager sees pending expense claims', async ({ page }) => {
  await signIn(page, 'manager@meridian.test');
  await page.goto('/expenses/claims?filter[status][eq]=pending');
  await expect(page.getByRole('heading', { name: 'Expense claims' })).toBeVisible();
  const row = page.getByRole('row', { name: /EXP-/ }).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  const w = await noHorizontalScroll(page);
  expect(w.scrollWidth).toBeLessThanOrEqual(w.innerWidth);
});

test('employee raises a claim from the form', async ({ page }) => {
  await signIn(page, 'employee@meridian.test');
  await page.goto('/expenses/claims/new');
  await page.getByLabel('Category').click();
  await page.getByRole('option', { name: 'Travel' }).click();
  await page.getByLabel('Expense date').fill(new Date().toISOString().slice(0, 10));
  await page.getByLabel('Amount').fill('245');
  await page.getByLabel('Paid to').fill('Metro');
  await page.getByRole('button', { name: /save|create|submit/i }).first().click();
  await page.waitForURL(/\/expenses\/claims$/, { timeout: 15_000 });
  await expect(page.getByRole('row', { name: /Metro/ }).first()).toBeVisible({ timeout: 15_000 });
});

test('bell shows the inbox drawer', async ({ page }) => {
  await signIn(page, 'employee@meridian.test');
  await page.getByRole('button', { name: /Notifications/ }).click();
  await expect(page.getByRole('dialog', { name: 'Notifications' })).toBeVisible();
});
